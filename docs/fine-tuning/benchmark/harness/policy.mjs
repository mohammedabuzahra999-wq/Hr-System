import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '../../../..')
export const DATASET = 'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'
export const DATASET_HASH = 'b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05'
export const MANIFEST = 'docs/fine-tuning/pre-finetuning-file-hashes.sha256'
export const MANIFEST_HASH = 'cd490a4d777bee7c490e26c7e1d953f19239e65a1f497b7f08e07fd204d81b47'
const remediation = {
  'server/src/reports/build.ts': '94bc1e2992d34ab4ef5e2371db323027fff75c56ca49b7cd1862bf36ef973bdc',
  'server/src/mcp/server.ts': 'ad13911ffb1d6025f0c48975135b9ee7b2609b9cfcea6051430fa8cddfc73699',
}
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function verifyFrozen() {
  const manifest = fs.readFileSync(path.join(ROOT, MANIFEST))
  if (hash(manifest) !== MANIFEST_HASH) throw new Error('Historical manifest hash mismatch')
  const entries = manifest.toString('utf8').trim().split(/\r?\n/).map(line => line.split('\t'))
  if (entries.length !== 381) throw new Error('Historical manifest count mismatch')
  const sourceHashes = {}
  for (const [name, original] of entries) {
    const digest = hash(fs.readFileSync(path.join(ROOT, name)))
    if (digest !== (remediation[name] ?? original)) throw new Error(`Unreviewed baseline change: ${name}`)
    sourceHashes[name] = digest
  }
  const bytes = fs.readFileSync(path.join(ROOT, DATASET))
  if (hash(bytes) !== DATASET_HASH) throw new Error('Frozen benchmark hash mismatch')
  const rows = bytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse)
  if (rows.length !== 404 || rows.some(row => row.synthetic_data !== true)) throw new Error('Invalid frozen synthetic benchmark')
  return { rows, sourceHashes, datasetHash: DATASET_HASH, manifestHash: MANIFEST_HASH }
}

// Explicit reviewed import graph. New application imports fail until reviewed.
export const SOURCES = new Set([
  ...['actions','capabilities','context','conversation','conversationTraining','execute','forms','intents',
    'perform','personName','phrasebook','readPeriods','readRules','resolve','routingOutcome','teamPresence','training','validatePlan']
    .map(name => `server/src/copilot/${name}.ts`),
  ...['ollama','structured','structuredProvider'].map(name => `server/src/ai/${name}.ts`),
  ...['answer','helpRouting','pages','tasks','tour'].map(name => `server/src/guide/${name}.ts`),
  ...['build','employeeFile'].map(name => `server/src/reports/${name}.ts`),
  'server/src/db/schema.ts', 'server/src/domain/workdays.ts', 'server/src/middleware.ts',
  'server/src/permissions.ts', 'server/src/rateLimit.ts', 'server/src/routes/copilot.ts',
  ...['actions','assistantReview','attendance','auth','calendar','copilot','events','feed','guide','hrAttention',
    'index','jobDescriptions','knowledge','leave','lookup','navigation','payroll','people','primitives',
    'recruitment','reports','scorecard','screening','voice'].map(name => `shared/src/${name}.ts`),
])
export const TRAINING_SOURCE = 'server/src/copilot/data/hr_agent_intents_10000.jsonl'
export function sourcePath(name) {
  if (!SOURCES.has(name) && name !== TRAINING_SOURCE) throw new Error('ISOLATION: unapproved source path')
  const absolute = path.resolve(ROOT, name)
  if (fs.realpathSync(absolute) !== absolute) throw new Error('ISOLATION: redirected source path')
  return absolute
}
export function childEnvironment() {
  // No inherited NODE_OPTIONS, DB/session/API/MCP credentials, proxy settings,
  // cloud credentials, dotenv settings or user profile. OS execution essentials only.
  const result = { NODE_ENV: 'test', TZ: 'Asia/Riyadh' }
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) result[key] = process.env[key]
  return result
}
export function childArguments() {
  // Do not grant the whole node_modules tree: workspace junctions there can
  // point back to server/ and its .env. Only these third-party package roots.
  const dependencies = ['zod','hono','drizzle-orm','openai','typescript'].map(name => {
    const directory=path.join(ROOT,'node_modules',name)
    if(fs.realpathSync(directory)!==directory)throw new Error('Redirected harness dependency')
    return directory
  })
  const readable = [HERE, ...dependencies, path.join(ROOT, 'package.json'), path.join(ROOT, DATASET),
    ...[...SOURCES, TRAINING_SOURCE].map(sourcePath)]
  return ['--permission', ...readable.map(p => `--allow-fs-read=${p}`), '--experimental-vm-modules', path.join(HERE, 'child.mjs')]
}
export function validateConfig(config) {
  if (!['dry-run', 'mock', 'ollama'].includes(config.mode)) throw new Error('Unsupported harness mode; external cloud access is disabled')
  if (typeof config.model !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,100}$/.test(config.model)) throw new Error('Invalid model name')
  if (config.mode === 'ollama' && config.baseUrl !== 'http://127.0.0.1:11434') throw new Error('Only the approved loopback Ollama endpoint is allowed')
}
