// Official reference download only. No Supabase/database imports or mutations.
import fs from 'node:fs/promises'
import path from 'node:path'
import {parseEnv} from 'node:util'
import {PSA_CATALOGS, getPsaCatalogConfig, fetchPsaLevel, recordsHash} from './lib/psa-transport.mjs'
import {reviewPsaLevels} from './lib/psa-reference-review.mjs'
const help = 'Usage: node scripts/fetch-psa-references.mjs [--config <private.env>] [--catalog all|psoc|psgc|psced|psic] [--version <explicit-release>]\nDefault config: psa.env. Process PSA_API_TOKEN or PSA_PSOC_API_TOKEN takes precedence.\nExplicit newer releases: --catalog psoc --version 2022; --catalog psced --version 2017.\nDownloads public versioned references into a new local staging folder; never imports them into DEV.'
async function main(args) {
 if (args.length === 1 && args[0] === '--help') { console.log(help); return }
 const options = {}
 for (let i = 0; i < args.length; i += 2) {
  const key = args[i], value = args[i + 1]
  if (!['--config', '--catalog', '--version'].includes(key) || options[key] !== undefined || !value || value.startsWith('--')) throw Error('arguments')
  options[key] = value
 }
 const catalog = options['--catalog'] ?? 'all'
 if (catalog !== 'all' && !Object.hasOwn(PSA_CATALOGS, catalog)) throw Error('catalog')
 if (options['--version'] && catalog === 'all') throw Error('version needs one catalog')
 if (catalog !== 'all') getPsaCatalogConfig(catalog, options['--version'] ?? null)
 let local = {}
 const config = path.resolve(options['--config'] ?? 'psa.env')
 try {
  const stat = await fs.stat(config)
  if (!stat.isFile() || stat.size > 65536) throw Error('configuration size')
  const text = await fs.readFile(config, 'utf8')
  if (Buffer.byteLength(text) > 65536) throw Error('configuration size')
  local = parseEnv(text)
 } catch (error) { if (error.code !== 'ENOENT') throw Error('configuration') }
 const token = process.env.PSA_API_TOKEN || process.env.PSA_PSOC_API_TOKEN || local.PSA_API_TOKEN || local.PSA_PSOC_API_TOKEN
 if (typeof token !== 'string' || !token.trim()) throw Error('configuration')
 const startedAt = new Date().toISOString(), parent = new URL('../artifacts/psa-references/', import.meta.url)
 await fs.mkdir(parent, {recursive: true})
 const directory = new URL(startedAt.replace(/[:.]/g, '-') + '/', parent)
 await fs.mkdir(directory)
 const manifest = {format: 'psa-reference-download-manifest-v1', started_at: startedAt,
  source_origin: 'https://classification.psa.gov.ph', credentials_saved: false,
  download_complete: false, database_imported: false, catalogs: []}
 await fs.writeFile(new URL('manifest.json', directory), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'})
 let failed = false
 for (const name of catalog === 'all' ? Object.keys(PSA_CATALOGS) : [catalog]) {
  const config = getPsaCatalogConfig(name, options['--version'] ?? null), levels = []
  try {
   for (const level of config.levels) {
    const result = await fetchPsaLevel({catalog: name, version: config.version, level, token})
    levels.push(result)
    console.log(JSON.stringify({catalog: name, level, rows: result.records.length, pages: result.pages.length}))
   }
   const review = reviewPsaLevels(name, config.version, levels)
   const snapshot = {format: 'psa-reference-staging-v1', catalog: name, version: config.version,
    documentation: config.documentation, retrieved_at: new Date().toISOString(),
    source_origin: 'https://classification.psa.gov.ph', download_complete: levels.every(level => level.download_complete),
    ...review, levels}
   const filename = name + '-' + config.version + '.json', serialized = JSON.stringify(snapshot)
   // Final boundary: even an unexpected nested credential echo must not reach disk.
   if ([token, encodeURIComponent(token), new URLSearchParams({token}).toString().slice(6)].some(value => value && serialized.includes(value)))
    throw Error('credential echo')
   await fs.writeFile(new URL(filename, directory), serialized + '\n', {flag: 'wx'})
   manifest.catalogs.push({catalog: name, version: config.version, filename, records_sha256: recordsHash(levels.map(level => level.records)),
    download_complete: snapshot.download_complete, quality_status: review.quality_status, issues: review.issues,
    import_ready: false, counts: review.summaries})
   console.log(JSON.stringify({catalog: name, saved: true, download_complete: snapshot.download_complete,
    quality_status: review.quality_status, issues: review.issues.length, import_ready: false}))
  } catch {
   failed = true
   manifest.catalogs.push({catalog: name, version: config.version, download_complete: false, failure_code: 'download_or_validation_failed', import_ready: false})
   console.error(JSON.stringify({catalog: name, saved: false, failure_code: 'download_or_validation_failed', diagnostics_withheld: true}))
  }
  await fs.writeFile(new URL('manifest.json', directory), JSON.stringify(manifest, null, 2) + '\n')
 }
 manifest.finished_at = new Date().toISOString()
 manifest.download_complete = !failed && manifest.catalogs.every(item => item.download_complete)
 await fs.writeFile(new URL('manifest.json', directory), JSON.stringify(manifest, null, 2) + '\n')
 console.log(JSON.stringify({manifest_directory: path.basename(directory.pathname.slice(0, -1)), download_complete: manifest.download_complete, database_imported: false}))
 if (failed || !manifest.download_complete) process.exitCode = 1
}
main(process.argv.slice(2)).catch(() => {
 console.error('PSA reference download failed. Use --help and configure the token privately; credential values and diagnostics are withheld.')
 process.exitCode = 1
})

