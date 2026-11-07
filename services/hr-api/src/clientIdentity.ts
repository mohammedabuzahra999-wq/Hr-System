import { isIP } from 'node:net'

export type ClientAddressPolicy = { mode: 'direct' | 'trusted-proxy'; trusted: ReadonlySet<string> }
export function normalizeAddress(value: string): string | null {
  if (value.includes('%') || !isIP(value)) return null
  if (isIP(value) === 4) return value
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1).toLowerCase()
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(normalized)
  if (mapped) { const high = parseInt(mapped[1]!, 16), low = parseInt(mapped[2]!, 16); return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}` }
  return normalized
}
export function parseClientAddressPolicy(mode: string, list: string): ClientAddressPolicy {
  if (!['direct', 'trusted-proxy'].includes(mode) || list.length > 2048) throw Error('invalidTrustedProxyConfiguration')
  const entries = list ? list.split(',').map(p => p.trim()) : []
  if (entries.length > 32 || (mode === 'direct' && entries.length) || (mode === 'trusted-proxy' && !entries.length)) throw Error('invalidTrustedProxyConfiguration')
  const addresses = entries.map(normalizeAddress)
  if (addresses.some(a => !a)) throw Error('invalidTrustedProxyConfiguration')
  return {mode: mode as ClientAddressPolicy['mode'], trusted: new Set(addresses as string[])}
}
/** Only a verified socket peer can make XFF relevant. Never read Forwarded/X-Real-IP. */
export function resolveClientAddress(peer: string | undefined, forwarded: string | undefined, policy: ClientAddressPolicy): string | null {
  const direct = peer ? normalizeAddress(peer) : null
  if (!direct || policy.mode === 'direct' || !policy.trusted.has(direct)) return direct
  if (!forwarded || forwarded.length > 1024) throw Error('invalidForwardedClientAddress')
  const chain = forwarded.split(',').map(p => normalizeAddress(p.trim()))
  if (!chain.length || chain.length > 16 || chain.some(a => !a)) throw Error('invalidForwardedClientAddress')
  // Peel configured proxy hops from the right. Untrusted left prefixes cannot change the selected client.
  let address = direct
  for (let index = chain.length - 1; index >= 0 && policy.trusted.has(address); index--) address = chain[index]!
  return address
}
