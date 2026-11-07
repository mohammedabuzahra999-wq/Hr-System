import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { secretIndicators } from '../../../services/hr-api/scripts/checkInterviewSecrets.mjs'
import { root, writeJson } from './manifest.mjs'

const files = [], walk = dir => {for (const name of readdirSync(dir)) {const path = resolve(dir, name); if (statSync(path).isDirectory()) walk(path); else if (/\.(js|css|html|ts|tsx|map)$/.test(name)) files.push(path)}}
const indicators = value => secretIndicators(value) + (value.match(/phase56-synthetic-bundle-canary-(?:openai|anthropic)-not-a-key|speech-layer-synthetic-bundle-canary-not-a-key|VITE_AI_INTERVIEW_SPEECH_API_KEY/g) ?? []).length
assert(indicators('speech-layer-synthetic-bundle-canary-not-a-key') > 0)
assert(indicators('phase56-synthetic-bundle-canary-openai-not-a-key') > 0)
assert(indicators('VITE_AI_INTERVIEW_SPEECH_API_KEY') > 0)
walk(resolve(root, 'apps/hr-web/src')); walk(resolve(root, 'apps/hr-web/dist'))
const violations = files.filter(path => indicators(readFileSync(path, 'utf8')) > 0).length
writeJson(resolve(process.env.SPEECH_LAYER_OUTPUT, 'speech-secret-proof.json'), {status: violations ? 'FAIL' : 'PASS', checkedFiles: files.length, offendingFiles: violations, valuesPrinted: 0, dedicatedSpeechCanaryDetected: true, originalDetectorIncluded: true})
console.log(`${violations ? 'FAIL' : 'PASS'} STT/TTS frontend/build secret verification; files=${files.length}; violations=${violations}; valuesPrinted=0`)
assert.equal(violations, 0)
