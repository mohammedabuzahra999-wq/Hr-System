import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, root, sha256 } from './manifest.mjs'

const here = dirname(fileURLToPath(import.meta.url)), runId = process.argv[2]
if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw Error('Usage: node verify.mjs RUN_ID')
const read = path => JSON.parse(readFileSync(path, 'utf8')), output = resolve(here, 'runs', runId)
const summary = read(resolve(output, 'summary.json'))
assert.equal(summary.status, 'PASS'); assert.equal(summary.releaseStatus, 'BLOCKED'); assert.equal(summary.phase54Started, false)
assert.equal(summary.releaseBlockers.length, 2)
for (const blocker of summary.releaseBlockers) assert.equal(blocker.status, 'OPEN / BLOCKED')
assert.equal(summary.network.blockedExternalAttempts, 0); assert.equal(summary.network.realModelCalls, 0)
const packages = [
  ['phase-5.1-baseline', '3b01f58e0cddec15899ec91651fe6486c5b232b01c09af5168597014b451de67'],
  ['phase-5.2', 'c5d85704933ccba6e5b804c5d4a7caf613a2d39daf8ad2f2fe7c537a0f146342'],
  ['phase-5.3', null]
]
const verified = []
for (const [name, acceptedHash] of packages) {
  const path = resolve(root, 'docs/ai-interviewer', name, 'artifact-manifest.json'), bytes = readFileSync(path), data = JSON.parse(bytes)
  const hash = sha256(bytes)
  if (acceptedHash) assert.equal(hash, acceptedHash, name + ' accepted artifact manifest')
  for (const file of data.files) {
    const item = resolve(root, file.path)
    assert(existsSync(item), file.path); assert.equal(statSync(item).size, file.bytes, file.path)
    assert.equal(sha256(readFileSync(item)), file.sha256, file.path)
  }
  verified.push({ name, files: data.files.length, artifactManifestSHA256: hash, changes: 0 })
}
const artifacts = read(resolve(here, 'artifact-manifest.json')), listed = new Set(artifacts.files.map(file => file.path))
let logs = 0, credentialShapedValues = 0, rawCredentialUrls = 0, leakedFixtureFiles = 0
function walk(folder) {
  for (const name of readdirSync(folder)) {
    const path = resolve(folder, name)
    if (statSync(path).isDirectory()) { walk(path); continue }
    if (path === resolve(here, 'artifact-manifest.json')) continue
    assert(listed.has(relative(root, path).replaceAll('\\', '/')), 'Unlisted Phase 5.3 artifact')
    if (name === 'fixture.json') leakedFixtureFiles++
    if (name.endsWith('.log')) {
      logs++
      const text = readFileSync(path, 'utf8')
      credentialShapedValues += (text.match(/\b[A-Za-z0-9_-]{43}\b/g) || []).length
      rawCredentialUrls += (text.match(/postgres(?:ql)?:\/\/|[?&]token=(?!\[redacted\])/g) || []).length
    }
  }
}
walk(here)
assert.equal(credentialShapedValues, 0); assert.equal(rawCredentialUrls, 0); assert.equal(leakedFixtureFiles, 0)
assert.equal(JSON.stringify(manifest()), JSON.stringify(read(resolve(output, 'source-final.json'))), 'Current source differs from tested source')
assert(summary.packagesPreserved); assert(summary.source.acceptedCopyMatches)
console.log(JSON.stringify({ status: 'PASS', phase53Status: summary.status, releaseStatus: summary.releaseStatus, verified,
  logPrivacy: { logs, credentialShapedValues, rawCredentialUrls, leakedFixtureFiles }, currentSourceMatchesFinal: true,
  releaseBlockersOpen: summary.releaseBlockers.map(row => row.id), phase54Started: false }, null, 2))
