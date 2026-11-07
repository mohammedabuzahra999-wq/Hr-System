// Baseline-only preload. No production module or existing test is edited.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), tls = require('node:tls')
const { syncBuiltinESMExports } = require('node:module')
const cp = require('node:child_process')
const originalWrite = fs.writeFileSync, originalMkdir = fs.mkdirSync
const root = path.resolve(__dirname, '../../..')
const output = process.env.PHASE55_OUTPUT
if (!output || !path.resolve(output).startsWith(path.join(__dirname, 'runs') + path.sep)) throw Error('Baseline output must be under its isolated runs directory')
const counts = { socketConnectionsAllowed: 0, fetchCallsAllowed: 0, blockedExternalAttempts: 0, suppressedFixtureWrites: 0, suppressedScreenshots: 0 }
const ports = new Set((process.env.PHASE55_PORTS || '').split(',').filter(Boolean).map(Number))
const loopback = host => ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).toLowerCase())
function deny() { counts.blockedExternalAttempts++; throw Error('PHASE55_NETWORK_DENIED') }
function socketAllowed(args) {
  const a = Array.isArray(args[0]) ? args[0] : args
  const o = a[0]
  // Node/esbuild may use local named-pipe IPC. Never allow an arbitrary path/host.
  if (typeof o === 'string' && /^\\\\[.?]\\pipe\\/.test(o)) return true
  if (o && typeof o === 'object' && o.path && /^\\\\[.?]\\pipe\\/.test(o.path)) return true
  const host = o && typeof o === 'object' ? (o.host || 'localhost') : (typeof a[1] === 'string' ? a[1] : 'localhost')
  const port = o && typeof o === 'object' ? o.port : o
  return loopback(host) && ports.has(Number(port))
}
const socketConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) { if (!socketAllowed(args)) return deny(); counts.socketConnectionsAllowed++; return Reflect.apply(socketConnect, this, args) }
const tlsConnect = tls.connect
tls.connect = function (...args) { if (!socketAllowed(args)) return deny(); return Reflect.apply(tlsConnect, this, args) }
const realFetch = globalThis.fetch
globalThis.fetch = function (input, ...args) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!loopback(url.hostname) || !ports.has(Number(url.port || (url.protocol === 'https:' ? 443 : 80)))) return deny()
  counts.fetchCallsAllowed++; return realFetch(input, ...args)
}
const roots = ['ai-interviewer-phase3', 'ai-interviewer-phase4'].map(p => path.join(root, '.local-dev', p))
function redirect(file) {
  if (typeof file !== 'string') return file
  const abs = path.resolve(file)
  for (const old of roots) if (abs === old || abs.startsWith(old + path.sep)) return path.join(output, 'browser', process.env.PHASE55_SUITE, path.basename(old), path.relative(old, abs))
  return file
}
fs.mkdirSync = function (file, ...args) { return originalMkdir(redirect(file), ...args) }
fs.writeFileSync = function (file, data, ...args) {
  const next = redirect(file)
  if (next !== file && path.basename(next) === 'fixture.json') { counts.suppressedFixtureWrites++; return }
  // Screenshots are not needed for baseline assertions and can expose temporary credentials on failure.
  if (next !== file && path.extname(next) === '.png') { counts.suppressedScreenshots++; return }
  if (next !== file && path.basename(next) === 'browser-results.json') {
    const report = JSON.parse(data); report.screenshots = []; report.screenshotPolicy = 'Not persisted: baseline contains no credential-bearing images'
    data = JSON.stringify(report, null, 2) + '\n'
  }
  return originalWrite(next, data, ...args)
}
const spawn = cp.spawn
cp.spawn = function (command, args, options) {
  if (/chrome(?:\.exe)?$/i.test(command)) args = args.map(arg => arg.startsWith('--user-data-dir=')
    ? '--user-data-dir=' + path.join(process.env.PHASE55_TEMP, 'chrome-' + process.pid) : arg)
    .concat('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1')
  return spawn(command, args, options)
}
syncBuiltinESMExports()
process.on('exit', () => {
  originalMkdir(path.join(output, 'network'), { recursive: true })
  originalWrite(path.join(output, 'network', `${process.env.PHASE55_SUITE}-${process.pid}.json`), JSON.stringify({ suite: process.env.PHASE55_SUITE, ...counts }, null, 2) + '\n')
})
