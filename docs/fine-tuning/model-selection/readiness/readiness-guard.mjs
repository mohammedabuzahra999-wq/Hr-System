// Windows can inject profile/PATH variables even into an explicit child env.
// Remove their keys before any readiness entry point; never print values.
import '../../controlled-assets/generation/offline-guard.mjs'
const allowed=new Set(['NODE_ENV','TZ','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])
for(const key of Object.keys(process.env))if(!allowed.has(key))delete process.env[key]
