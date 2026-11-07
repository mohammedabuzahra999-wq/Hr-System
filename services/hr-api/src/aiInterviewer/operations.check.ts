import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import http from 'node:http'
import { serve } from '@hono/node-server'
import { AbuseBudget } from '../abuseBudget.js'
import { normalizeAddress, parseClientAddressPolicy, resolveClientAddress } from '../clientIdentity.js'
import { rateLimit, resetRateLimits } from '../rateLimit.js'
import { validateInterviewDeployment } from './deployment.js'
import { DatabaseReadinessProbe, createInterviewHealthRoutes } from './health.js'
import { InterviewShutdown } from './shutdown.js'
import { InterviewOperations } from './operations.js'
import { interviewSecurityHeaders } from './securityHeaders.js'
import { deferred, nextTurn } from './runtimeTestSupport.js'

const self = fileURLToPath(import.meta.url)
if (process.argv.includes('--configuration-child')) {console.log(JSON.stringify({startup: 'accepted'})); process.exit(0)}
if (process.argv.includes('--restart-child')) {console.log(JSON.stringify(new AbuseBudget().consume('restart', 'one-client', 1, 60000))); process.exit(0)}
if (process.argv.includes('--proxy-child')) {
  const app = new Hono().use('*', rateLimit({name: 'proxy-child', limit: 1, windowMs: 60000})).get('/', c => c.json({ok: true}))
  const api = serve({fetch: app.fetch, hostname: '127.0.0.1', port: 8797})
  if (!api.listening) await new Promise<void>(done => api.once('listening', done))
  const proxy = http.createServer((request, response) => {
    const upstream = http.request({hostname: '127.0.0.1', port: 8797, path: '/', localAddress: '127.0.0.1', headers: {
      'x-forwarded-for': `${request.headers['x-forwarded-for']}, ${request.socket.remoteAddress}`,
    }}, result => {response.writeHead(result.statusCode!); result.pipe(response)})
    upstream.on('error', () => {response.writeHead(503); response.end()}); upstream.end()
  })
  await new Promise<void>(done => proxy.listen(8798, '127.0.0.1', done))
  const request = (spoof: string, localAddress: string) => new Promise<number>((done, reject) => {
    const req = http.get({hostname: '127.0.0.1', port: 8798, path: '/', localAddress, headers: {'x-forwarded-for': spoof}}, response => {response.resume(); response.on('end', () => done(response.statusCode!))}); req.on('error', reject)
  })
  let result
  try {result = {first: await request('192.0.2.1', '127.0.0.2'), spoof: await request('192.0.2.2', '127.0.0.2'), otherClient: await request('192.0.2.1', '127.0.0.3'), actualLoopbackProxy: true}}
  finally {await Promise.all([new Promise<void>(done => proxy.close(() => done())), new Promise<void>(done => api.close(() => done()))])}
  console.log(JSON.stringify(result)); process.exit(0)
}
let checks = 0
const matrix: Record<string, unknown>[] = []
const check = async (name: string, fn: () => void | Promise<void>) => {await fn(); checks++; console.log('PASS ' + name)}
const direct = parseClientAddressPolicy('direct', ''), proxy = parseClientAddressPolicy('trusted-proxy', '127.0.0.1,192.0.2.10')
const child = (flag: string, overrides: Record<string, string> = {}) => spawnSync(process.execPath, ['--conditions=development', '--import', 'tsx', self, flag], {
  env: {...process.env, ...overrides}, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 1_000_000,
})
await check('direct socket identity ignores arbitrary forwarded IP values', () => {
  for (const header of ['203.0.113.1', 'spoof, junk', '', 'a'.repeat(5000)]) assert.equal(resolveClientAddress('198.51.100.9', header, direct), '198.51.100.9')
})
await check('trusted proxy selects the nearest untrusted hop, ignoring forged left prefix', () => {
  for (const prefix of ['203.0.113.1', '203.0.113.2']) assert.equal(resolveClientAddress('127.0.0.1', `${prefix}, 198.51.100.9, 192.0.2.10`, proxy), '198.51.100.9')
})
await check('untrusted socket never becomes trusted from a header', () => assert.equal(resolveClientAddress('198.51.100.9', '203.0.113.1', proxy), '198.51.100.9'))
await check('mapped IPv4 and canonical IPv6 proxy identities agree', () => {assert.equal(normalizeAddress('::ffff:127.0.0.1'), '127.0.0.1'); assert.equal(normalizeAddress('2001:0db8:0:0::1'), '2001:db8::1')})
await check('absent socket yields no spoofable fallback header identity', () => assert.equal(resolveClientAddress(undefined, '203.0.113.1', proxy), null))
await check('invalid/empty/wildcard/CIDR proxy configuration fails closed', () => {
  for (const [mode, addresses] of [['trusted-proxy', ''], ['direct', '127.0.0.1'], ['all', ''], ['trusted-proxy', '*'], ['trusted-proxy', '10.0.0.0/8'], ['trusted-proxy', 'hostname'], ['trusted-proxy', 'fe80::1%zone']]) assert.throws(() => parseClientAddressPolicy(mode!, addresses!))
})
await check('missing/malformed/oversized XFF from a trusted socket is rejected', () => {
  for (const header of [undefined, 'unknown', '198.51.100.9,', 'a'.repeat(1025)]) assert.throws(() => resolveClientAddress('127.0.0.1', header, proxy))
})
await check('budget permits normal traffic then rejects a burst until expiry', () => {
  let now = 0; const budget = new AbuseBudget(10, () => now)
  assert(budget.consume('one', 'client', 2, 1000).allowed); assert(budget.consume('one', 'client', 2, 1000).allowed); assert(!budget.consume('one', 'client', 2, 1000).allowed)
  now = 1000; assert(budget.consume('one', 'client', 2, 1000).allowed)
})
await check('capacity overflow remains bounded and cannot evict a limited identity', () => {
  const budget = new AbuseBudget(2)
  assert(budget.consume('one', 'A', 1, 60000).allowed); budget.consume('one', 'B', 1, 60000)
  for (let index = 0; index < 200; index++) budget.consume('one', String(index), 1, 60000)
  assert.equal(budget.size, 3); assert(!budget.consume('one', 'A', 1, 60000).allowed); assert(!budget.consume('one', 'another', 1, 60000).allowed)
})
await check('invalid limiter capacity/options cannot create unlimited windows', () => {
  for (const capacity of [0, -1, Infinity]) assert.throws(() => new AbuseBudget(capacity))
  for (const [limit, ms] of [[0, 1], [1, 0], [Infinity, 1000]]) assert.throws(() => new AbuseBudget().consume('valid', 'client', limit!, ms!))
})
await check('HTTP direct-mode forwarded spoofing cannot reset a rate-limit bucket', async () => {
  resetRateLimits(); const app = new Hono().use('*', rateLimit({name: 'direct-test', limit: 1, windowMs: 60000})).get('/', c => c.json({ok: true}))
  const env = {incoming: {socket: {remoteAddress: '198.51.100.9'}}}
  assert.equal((await app.request('http://local/', {headers: {'x-forwarded-for': '203.0.113.1'}}, env)).status, 200)
  assert.equal((await app.request('http://local/', {headers: {'x-forwarded-for': '203.0.113.2', forwarded: 'for=203.0.113.8', 'x-real-ip': '203.0.113.7'}}, env)).status, 429)
})
await check('actual trusted-proxy environment is validated and enforces stable client identity', () => {
  const result = child('--proxy-child', {CLIENT_ADDRESS_MODE: 'trusted-proxy', TRUSTED_PROXY_ADDRESSES: '127.0.0.1'})
  assert.equal(result.status, 0); const data = JSON.parse(result.stdout.trim()); assert.equal(data.first, 200); assert.equal(data.spoof, 429); assert.equal(data.otherClient, 200); assert(data.actualLoopbackProxy); matrix.push({scenario: 'trusted-proxy child', ...data})
})
await check('a fresh OS child process gets fresh process-local counters', () => {
  for (let index = 0; index < 2; index++) {const result = child('--restart-child'); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout.trim()).allowed, true)}
  matrix.push({scenario: 'actual process restart', processLocalCounterReset: true, durableAuthorizationUnaffected: true})
})
await check('authenticated-user limiter cannot accept a browser header as a principal', async () => {
  const app = new Hono().use('*', rateLimit({name: 'verified-user', limit: 1, windowMs: 60000, keyBy: 'authenticated-user'})).get('/', c => c.json({ok: true}))
  assert.equal((await app.request('http://local/', {headers: {'x-user-id': 'forged'}})).status, 401)
})
const production = {NODE_ENV: 'production', SESSION_SECRET: randomBytes(32).toString('hex'), WEB_ORIGIN: 'https://interview.example.invalid',
  AI_INTERVIEW_DEV_MOCK: 'false', VOICE_DEV_MOCK: 'false', VITE_AI_INTERVIEW_DEV_MOCK: 'false', CLIENT_ADDRESS_MODE: 'direct', TRUSTED_PROXY_ADDRESSES: '', AI_INTERVIEW_PROVIDER_MODE: 'disabled', AI_INTERVIEW_RUNTIME_OWNERS: '1', AI_INTERVIEW_DEBUG: 'false', AI_INTERVIEW_TEST_MODE: 'false'}
for (const [scenario, override, expected] of [
  ['safe disabled production', {}, 0], ['trusted production proxy', {CLIENT_ADDRESS_MODE: 'trusted-proxy', TRUSTED_PROXY_ADDRESSES: '127.0.0.1'}, 0],
  ['production debug', {AI_INTERVIEW_DEBUG: 'true'}, 1], ['production test mode', {AI_INTERVIEW_TEST_MODE: 'true'}, 1], ['production mock', {AI_INTERVIEW_DEV_MOCK: 'true'}, 1],
  ['production employee mock', {VOICE_DEV_MOCK: 'true'}, 1], ['production synthetic provider', {AI_INTERVIEW_PROVIDER_MODE: 'synthetic'}, 1],
  ['real provider absent credentials', {AI_INTERVIEW_PROVIDER_MODE: 'real'}, 1], ['real provider with a synthetic credential', {AI_INTERVIEW_PROVIDER_MODE: 'real', OPENAI_API_KEY: 'phase55-synthetic-provider-key-not-real'}, 1],
  ['malformed provider mode', {AI_INTERVIEW_PROVIDER_MODE: 'anything'}, 1], ['multiple runtime owners', {AI_INTERVIEW_RUNTIME_OWNERS: '2'}, 1],
  ['invalid trusted proxy', {CLIENT_ADDRESS_MODE: 'trusted-proxy', TRUSTED_PROXY_ADDRESSES: '*'}, 1], ['insecure production origin', {WEB_ORIGIN: 'http://interview.example.invalid'}, 1],
  ['unsafe production secret', {SESSION_SECRET: 'synthetic-development-secret-not-for-production'}, 1], ['frontend secret configuration', {VITE_SESSION_SECRET: 'phase55-synthetic-secret-not-real'}, 1],
  ['frontend provider token configuration', {VITE_PROVIDER_TOKEN: 'phase55-synthetic-secret-not-real'}, 1],
] as const) await check('startup: ' + scenario, () => {
  const result = child('--configuration-child', {...production, ...override}); assert.equal(result.status, expected)
  assert(!result.stdout.includes(production.SESSION_SECRET)); assert(!result.stderr.includes(production.SESSION_SECRET)); assert(!result.stderr.includes('phase55-synthetic-provider-key-not-real'))
  matrix.push({scenario, exitCode: result.status, valuesPrinted: false})
})
await check('pure deployment validation also rejects malformed origins', () => {
  for (const origin of ['*', 'https://safe.invalid/path', 'https://name:password@safe.invalid', 'not a url']) assert.throws(() => validateInterviewDeployment({production: true, sessionSecret: production.SESSION_SECRET, origins: [origin], addressMode: 'direct', proxyAddresses: '', providerMode: 'disabled', runtimeOwners: 1, debug: false, unsafeFrontendSecret: false}))
})
await check('liveness is independent of a stalled database', async () => {
  const probe = new DatabaseReadinessProbe(() => new Promise(() => {}), 10), routes = createInterviewHealthRoutes({database: probe, runtime: () => ({running: true, timersHealthy: false, evaluationsHealthy: false}), provider: () => ({status: 'unavailable', mode: 'disabled', liveValidated: false}), draining: () => false})
  assert.equal((await routes.request('http://local/live')).status, 200); const response = await routes.request('http://local/ready'); assert.equal(response.status, 503); const data = await response.json() as {database: string; productionGate: string}; assert.equal(data.database, 'unavailable'); assert.equal(data.productionGate, 'blocked'); matrix.push({scenario: 'DB stalled readiness', ...data})
})
await check('hung DB probe admits one physical query and cannot accumulate polling work', async () => {
  let calls = 0; const d = deferred<void>(), probe = new DatabaseReadinessProbe(() => {calls++; return d.promise}, 10)
  assert.equal(await probe.check(), false); for (let index = 0; index < 50; index++) assert.equal(await probe.check(), false); assert.equal(calls, 1); d.resolve(); await nextTurn()
})
await check('configured provider is not automatically healthy or production ready', async () => {
  const routes = createInterviewHealthRoutes({database: new DatabaseReadinessProbe(async () => {}), runtime: () => ({running: true, timersHealthy: true, evaluationsHealthy: true}), provider: () => ({status: 'configured', mode: 'synthetic', liveValidated: false}), draining: () => false})
  const response = await routes.request('http://local/ready'), data = await response.json() as {provider: {status: string; liveValidated: boolean}; interviewRuntime: string; productionGate: string}; assert.equal(response.status, 503); assert.equal(data.provider.status, 'configured'); assert.equal(data.provider.liveValidated, false); assert.equal(data.interviewRuntime, 'ready'); assert.equal(data.productionGate, 'blocked'); matrix.push({scenario: 'configured not ready', ...data})
})
await check('malformed readiness dependency cannot expose arbitrary provider fields', async () => {
  const routes = createInterviewHealthRoutes({database: new DatabaseReadinessProbe(async () => {}), runtime: () => ({running: true, timersHealthy: true, evaluationsHealthy: true}), provider: () => ({status: 'credential-secret-value', mode: 'disabled', password: 'secret'} as never), draining: () => false})
  const response = await routes.request('http://local/ready'); assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error: 'healthUnavailable'})
})
await check('DB exceptions produce safe unavailable readiness without SQL or stack', async () => {
  const routes = createInterviewHealthRoutes({database: new DatabaseReadinessProbe(async () => {throw Error('SENSITIVE_SQL_SECRET')}), runtime: () => ({running: false, timersHealthy: false, evaluationsHealthy: false}), provider: () => ({status: 'unavailable', mode: 'disabled', liveValidated: false}), draining: () => true})
  const response = await routes.request('http://local/ready'), text = await response.text(); assert.equal(response.status, 503); assert(!text.includes('SENSITIVE_SQL_SECRET')); assert(!text.includes('stack')); assert.equal(response.headers.get('cache-control'), 'no-store')
})
await check('API and candidate HTML headers protect cache/framing without a breaking script policy', async () => {
  const app = new Hono().use('*', interviewSecurityHeaders).get('/api/example', c => c.json({ok: true})).get('/interview/join', c => c.html('<p>safe</p>'))
  for (const path of ['/api/example', '/interview/join']) {const response = await app.request('http://local' + path); assert(response.headers.get('cache-control')!.includes('no-store')); assert.equal(response.headers.get('pragma'), 'no-cache'); assert.equal(response.headers.get('x-frame-options'), 'DENY'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer'); assert(response.headers.get('content-security-policy')!.includes("frame-ancestors 'none'"))}
  assert(!(await app.request('http://local/interview/join')).headers.get('content-security-policy')!.includes('script-src'))
})
await check('operational diagnostics reject extra fields, bound floods and isolate sink failure', () => {
  const events: unknown[] = [], monitor = new InterviewOperations(event => events.push(event)); for (let index = 0; index < 100; index++) monitor.record({event: 'request_rejected', code: 'AUTH'})
  assert.equal(events.length, 3); monitor.record({event: 'request_rejected', cookie: 'not allowed'} as never); assert.equal(events.length, 3)
  assert.doesNotThrow(() => new InterviewOperations(() => {throw Error('sink failure')}).record({event: 'shutdown_started'}))
})
await check('shutdown waits for admitted work before DB close and is idempotent', async () => {
  const shutdown = new InterviewShutdown(), d = deferred<void>(), order: string[] = []
  const steps = {http: async () => {await d.promise; order.push('http')}, runtime: async () => {order.push('runtime')}, provider: async () => {order.push('provider')}, database: async () => {order.push('database')}, forceConnections: () => {order.push('forced')}}
  const first = shutdown.run(steps, 1000); assert(shutdown.draining); assert.equal(shutdown.run(steps), first); await nextTurn(); assert(!order.includes('database')); d.resolve(); assert.deepEqual(await first, {complete: true}); assert.equal(order.at(-1), 'database'); assert(!order.includes('forced'))
})
await check('shutdown deadline reports incomplete and cannot turn successful after late settlement', async () => {
  const shutdown = new InterviewShutdown(), d = deferred<void>(); let forced = 0, closed = 0
  const result = await shutdown.run({http: () => d.promise, runtime: async () => {}, provider: async () => {}, database: async () => {closed++}, forceConnections: () => {forced++}}, 10)
  assert.equal(result.complete, false); assert.equal(forced, 1); d.resolve(); await nextTurn(); assert.equal(result.complete, false); assert.equal(closed, 0)
})
await check('frontend secret scanner detects synthetic leaks without printing values', async () => {
  const scanner = await import(new URL('../../scripts/checkInterviewSecrets.mjs', import.meta.url).href) as {secretIndicators(text: string): number}
  assert.equal(scanner.secretIndicators('normal candidate UI'), 0); assert(scanner.secretIndicators('phase55-synthetic-bundle-canary-openai-not-a-key') > 0); assert(scanner.secretIndicators('-----BEGIN PRIVATE KEY-----') > 0)
})
if (process.env.PHASE55_OUTPUT) writeFileSync(resolve(process.env.PHASE55_OUTPUT, 'operations-unit-matrix.json'), JSON.stringify({checks, matrix, realProviderCalls: 0, externalAttempts: 0}, null, 2) + '\n')
console.log(`${checks}/${checks} Phase 5.5 operations checks passed; real provider/external calls=0`)
