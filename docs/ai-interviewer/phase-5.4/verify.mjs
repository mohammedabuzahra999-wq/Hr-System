import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256 } from './manifest.mjs'

const here = dirname(fileURLToPath(import.meta.url)), run = process.argv[2]
if (!run || !/^[a-zA-Z0-9_-]+$/.test(run)) throw Error('Usage: node verify.mjs RUN_ID')
const read = p => JSON.parse(readFileSync(p, 'utf8')), output = resolve(here, 'runs', run), summary = read(resolve(output, 'summary.json'))
assert.equal(summary.providerGateStatus, 'PASS'); assert.equal(summary.liveVoiceE2EStatus, 'BLOCKED'); assert.equal(summary.releaseStatus, 'BLOCKED')
assert.equal(summary.phase55Started, false); assert.equal(summary.network.guardedExternalAttempts, 0); assert.equal(summary.network.realModelCalls, 0); assert.equal(summary.network.realProviderCalls, 0)
assert.equal(summary.releaseBlockers.length, 2); for (const blocker of summary.releaseBlockers) assert.equal(blocker.status, 'OPEN / BLOCKED')
const specs = [
  ['phase-5.1-baseline', '3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67'],
  ['phase-5.2', 'c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342'],
  ['phase-5.3', '8e427a5393159a4c63cff039da95a2f2ecc9a00a146e2194a395af1fe1cfa900'], ['phase-5.4', null],
]
const verified = []
for (const [name, expected] of specs) {
  const bytes = readFileSync(resolve(root, 'docs/ai-interviewer', name, 'artifact-manifest.json')), data = JSON.parse(bytes), hash = sha256(bytes)
  if (expected) assert.equal(hash, expected, name + ' manifest')
  for (const file of data.files) {const path = resolve(root, file.path); assert.equal(statSync(path).size, file.bytes, file.path); assert.equal(sha256(readFileSync(path)), file.sha256, file.path)}
  verified.push({name, files: data.files.length, artifactManifestSHA256: hash, changes: 0})
}
const listed = new Set(read(resolve(here, 'artifact-manifest.json')).files.map(f => f.path))
let logs = 0, credentialShapedValues = 0, rawCredentialUrls = 0, leakedFixtureFiles = 0
function walk(folder) {
  for (const name of readdirSync(folder)) {
    const path = resolve(folder, name)
    if (statSync(path).isDirectory()) {walk(path); continue}
    if (path === resolve(here, 'artifact-manifest.json')) continue
    assert(listed.has(relative(root, path).replaceAll('\\', '/')), 'Unlisted artifact')
    if (name === 'fixture.json') leakedFixtureFiles++
    if (name.endsWith('.log')) {
      logs++; const text = readFileSync(path, 'utf8')
      credentialShapedValues += (text.match(/\b[A-Za-z0-9_-]{43}\b/g) || []).length
      rawCredentialUrls += (text.match(/postgres(?:ql)?:\/\/|[?&]token=(?!\[redacted\])/g) || []).length
      assert(!text.includes('SENSITIVE_SECRET'), 'Raw synthetic failure content leaked')
    }
  }
}
walk(here)
assert.equal(credentialShapedValues, 0); assert.equal(rawCredentialUrls, 0); assert.equal(leakedFixtureFiles, 0)
assert.equal(JSON.stringify(manifest()), JSON.stringify(read(resolve(output, 'source-final.json'))), 'Current source changed')
assert(summary.acceptedEvidencePreserved); assert(summary.source.stableDuringFinalRun); assert(summary.source.acceptedCopyMatches)
console.log(JSON.stringify({status: 'PASS', providerGate: 'PASS — synthetic scope', liveVoiceE2E: 'BLOCKED', releaseStatus: 'BLOCKED', verified,
  logPrivacy: {logs, credentialShapedValues, rawCredentialUrls, leakedFixtureFiles}, sourceMatchesTested: true, phase55Started: false}, null, 2))
