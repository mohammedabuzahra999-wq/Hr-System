import { parseClientAddressPolicy } from '../clientIdentity.js'

export function validateInterviewDeployment(input: {
  production: boolean; sessionSecret: string; origins: string[]; addressMode: string; proxyAddresses: string;
  providerMode: string; runtimeOwners: number; debug: boolean; unsafeFrontendSecret: boolean;
}) {
  const addressPolicy = parseClientAddressPolicy(input.addressMode, input.proxyAddresses)
  if (input.runtimeOwners !== 1) throw Error('interviewSingleProcessRequired')
  if (!['disabled', 'synthetic', 'real'].includes(input.providerMode)) throw Error('invalidInterviewProviderMode')
  // No real adapter is registered in this phase, regardless of keys present in the environment.
  if (input.providerMode === 'real') throw Error('realInterviewProviderNotRegistered')
  if (!input.origins.length || input.origins.some(origin => {
    if (origin === 'capacitor://localhost') return false
    try { const u = new URL(origin); return !['http:', 'https:'].includes(u.protocol) || u.origin !== origin || !!u.username || !!u.password || origin.includes('*') || (input.production && u.protocol !== 'https:') }
    catch { return true }
  })) throw Error('invalidWebOriginConfiguration')
  if (input.production && (input.debug || input.providerMode !== 'disabled')) throw Error('productionInterviewTestAuthorityDenied')
  if (input.unsafeFrontendSecret) throw Error('frontendSecretConfigurationDenied')
  if (input.production && (new Set(input.sessionSecret).size < 8 || /change.?me|replace.?me|example|development|offline|synthetic/i.test(input.sessionSecret))) throw Error('unsafeProductionSessionSecret')
  return addressPolicy
}
