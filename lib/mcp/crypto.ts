import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function pkceS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier)) return false
  if (challenge.length < 43 || challenge.length > 128) return false
  return secretsEqual(pkceS256(verifier), challenge)
}
