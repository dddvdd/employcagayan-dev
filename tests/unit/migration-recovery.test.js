import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('six recovered DEV migration bodies match the observed ledger', async () => {
  const ledger = JSON.parse(await readFile(new URL('../../artifacts/auth-milestone-20261012/recovered-ledger.json', import.meta.url), 'utf8'))
  assert.equal(ledger.project_id, 'cdmkzzmaswwiryymtycn')
  assert.equal(ledger.migrations.length, 6)
  const normalize = value => value.replace(/\r\n/g, '\n').trim()
  for (const migration of ledger.migrations) {
    const local = await readFile(new URL(`../../supabase/migrations/${migration.version}_${migration.name}.sql`, import.meta.url), 'utf8')
    assert.equal(normalize(local.split('\n').slice(2).join('\n')), normalize(migration.statements.join('\n')), migration.name)
  }
})
