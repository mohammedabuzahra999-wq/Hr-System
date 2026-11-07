import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/voice/localQueue.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
const { LocalVoiceQueue, LocalVoiceBusyError } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const tick = () => new Promise(resolve => setImmediate(resolve))

const queue = new LocalVoiceQueue(), gate = deferred(), order = []
let active = 0, maximum = 0
const first = queue.run(async () => { order.push('stt'); maximum = Math.max(maximum, ++active); await gate.promise; active-- })
const second = queue.run(async () => { order.push('tts'); maximum = Math.max(maximum, ++active); active-- })
const third = queue.run(async () => { order.push('next-stt'); maximum = Math.max(maximum, ++active); active-- })
await tick()
assert.deepEqual(order, ['stt'])
gate.resolve(); await Promise.all([first, second, third])
assert.deepEqual(order, ['stt', 'tts', 'next-stt']); assert.equal(maximum, 1)
console.log('PASS FIFO admission across local STT/TTS; only one audio operation runs')

await assert.rejects(queue.run(async () => { throw Error('Synthetic engine failure') }), /Synthetic engine failure/)
assert.equal(await queue.run(async () => 'released'), 'released')
console.log('PASS engine failure releases the audio slot')

const bounded = new LocalVoiceQueue({ maxPending: 1 }), hold = deferred()
const running = bounded.run(() => hold.promise)
const waiting = bounded.run(async () => 'waiting')
let overflowCalls = 0
await assert.rejects(bounded.run(async () => { overflowCalls++ }), LocalVoiceBusyError)
assert.equal(overflowCalls, 0)
hold.resolve(); await Promise.all([running, waiting])
console.log('PASS bounded queue rejects excess work without submitting or retrying it')

const expiring = new LocalVoiceQueue({ waitMs: 15 }), blocked = deferred()
const long = expiring.run(() => blocked.promise)
let expiredCalls = 0
await assert.rejects(expiring.run(async () => { expiredCalls++ }), LocalVoiceBusyError)
blocked.resolve(); await long
assert.equal(expiredCalls, 0)
assert.equal(await expiring.run(async () => 'next'), 'next')
console.log('PASS expired queued work is removed and never executed later')

const residual = new LocalVoiceQueue({ pollMs: 1 })
let healthCalls = 0, submissions = 0
assert.equal(await residual.run(async () => { submissions++; return 'reply' }, async () => ++healthCalls <= 3), 'reply')
assert.equal(healthCalls, 4); assert.equal(submissions, 1)
console.log('PASS wait for previous worker activity polls metadata only; user request is submitted once')

const stuck = new LocalVoiceQueue({ waitMs: 10, pollMs: 1 })
let stuckCalls = 0
await assert.rejects(stuck.run(async () => { stuckCalls++ }, async () => true), LocalVoiceBusyError)
assert.equal(stuckCalls, 0)
assert.equal(await stuck.run(async () => 'recovered'), 'recovered')
console.log('PASS permanently busy worker has bounded admission wait and no hidden POST retry')
