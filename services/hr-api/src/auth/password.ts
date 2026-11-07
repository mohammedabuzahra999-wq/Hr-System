import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * Passwords are hashed with scrypt from Node's own crypto.
 *
 * scrypt is memory-hard, so a stolen hash is expensive to attack with GPUs, and
 * it ships with Node — no native build step, which matters on Windows. The cost
 * parameters are stored inside the hash, so raising them later leaves existing
 * hashes verifiable and they upgrade on next sign-in.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEY_LENGTH = 64
const SALT_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

/**
 * Constant-time comparison. Returns false rather than throwing on a malformed
 * stored value, so a corrupt row cannot be told apart from a wrong password.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false

  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  try {
    const salt = Buffer.from(parts[4]!, 'base64')
    const expected = Buffer.from(parts[5]!, 'base64')
    const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: Math.max(PARAMS.maxmem, 128 * N * r * 2),
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** True when a stored hash used weaker parameters than the current policy. */
export function needsRehash(stored: string | null): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  return parts[0] !== 'scrypt' || Number(parts[1]) < PARAMS.N
}

/**
 * A temporary password an administrator reads out or pastes into a message.
 *
 * Ambiguous glyphs are left out — no O/0, no l/1/I — because this gets typed by
 * hand from a screen or a phone call, and "was that an ell or a one" turns a
 * password reset into a second support call.
 */
const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function generateTemporaryPassword(): string {
  const block = (length: number) =>
    Array.from({ length }, () => SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)]).join('')
  // Grouped, so it can be read aloud without losing your place.
  return `${block(4)}-${block(4)}-${block(4)}`
}

export interface PasswordProblem {
  code: 'tooShort' | 'tooCommon'
}

const COMMON = new Set([
  'password', 'password1', '12345678', '123456789', 'qwertyui', 'iloveyou',
  'admin123', 'letmein1', 'welcome1', 'passw0rd', '11111111', 'abc12345',
])

/** The strength rule lives here so it can be tightened without a frontend release. */
export function checkPasswordStrength(password: string): PasswordProblem | null {
  if (password.length < 8) return { code: 'tooShort' }
  if (COMMON.has(password.toLowerCase())) return { code: 'tooCommon' }
  return null
}
