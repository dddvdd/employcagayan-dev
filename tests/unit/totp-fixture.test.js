import test from 'node:test'
import assert from 'node:assert/strict'
import { totp } from '../support/totp.js'

test('live-test TOTP generator matches all RFC 6238 SHA-1 vectors', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  for (const [seconds, code] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) {
    assert.equal(totp(secret, seconds, 8), code)
  }
})
