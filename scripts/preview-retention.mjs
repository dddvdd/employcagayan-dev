import fs from 'node:fs/promises'
import path from 'node:path'
import {previewRetention, renderRetentionPreview} from './lib/retention-preview.mjs'
const usage = 'Usage: node scripts/preview-retention.mjs --input <synthetic.json> --output <new-file> [--format json|html]\nOffline synthetic metadata only. Proposed policy inactive; disposal disabled.'
async function main(args) {
 if (args.length === 1 && args[0] === '--help') { console.log(usage); return }
 const allowed = new Set(['--input', '--output', '--format']), options = {}
 for (let i = 0; i < args.length; i += 2) {
  const key = args[i], value = args[i + 1]
  if (!allowed.has(key) || options[key] !== undefined || !value || value.startsWith('--')) throw Error('arguments')
  options[key] = value
 }
 const format = options['--format'] ?? 'json'
 if (!options['--input'] || !options['--output'] || !['json', 'html'].includes(format)) throw Error('arguments')
 const source = path.resolve(options['--input']), target = path.resolve(options['--output'])
 if (source.toLowerCase() === target.toLowerCase()) throw Error('same file')
 const stat = await fs.stat(source)
 if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw Error('input size')
 const text = await fs.readFile(source, 'utf8')
 if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) throw Error('input size')
 const report = previewRetention(JSON.parse(text))
 const output = format === 'json' ? JSON.stringify(report, null, 2) + '\n' : renderRetentionPreview(report)
 await fs.writeFile(target, output, {flag: 'wx', mode: 0o600})
 console.log(JSON.stringify({status: 'preview_created', policy_status: report.policy_status,
  disposal_enabled: false, records: report.counts.records, review_due: report.counts.review_due}))
}
main(process.argv.slice(2)).catch(() => {
 console.error('Retention preview failed. Use --help; provide valid synthetic metadata and a new output file.')
 process.exitCode = 1
})

