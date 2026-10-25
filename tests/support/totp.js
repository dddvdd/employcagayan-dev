import { createHmac } from 'node:crypto'

// Test fixture only. RFC 6238, SHA-1/30 seconds; secrets stay in memory.
export function totp(secret, seconds = Math.floor(Date.now() / 1000), digits = 6) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const value = alphabet.indexOf(character)
    if (value < 0) throw new Error('Invalid test authenticator encoding')
    bits += value.toString(2).padStart(5, '0')
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map(byte => parseInt(byte, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(seconds / 30)))
  const hash = createHmac('sha1', key).update(counter).digest()
  const offset = hash[hash.length - 1] & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0')
}
