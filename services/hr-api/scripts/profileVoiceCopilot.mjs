import './runtimePreload.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'
import { Hono } from 'hono'
import { env } from '../src/env.ts'
import { voiceAuditSignature } from '../src/voice/audit.ts'
import { questionTrainingExamples } from '../src/copilot/training.ts'
import { closeDb } from '../src/db/client.ts'

// Diagnostic process only: unchanged routing/services, real local model, no
// confirmed action or audit/training writes, no prompt/record/credential logs.
if (env.AI_PROVIDER !== 'ollama' || !['localhost', '127.0.0.1'].includes(new URL(env.OLLAMA_BASE_URL).hostname)) throw Error('Requires the configured local Ollama provider')
if (env.OPENAI_API_KEY) throw Error('This diagnostic requires cloud AI disabled; no key value was inspected or printed')
const base = 'http://localhost:5175'
const loginSource = ts.createSourceFile('LoginPage.tsx', readFileSync(new URL('../../../apps/hr-web/src/pages/LoginPage.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let email = '', password = ''
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(loginSource) === 'DEMO_PASSWORD' && node.initializer && ts.isStringLiteral(node.initializer)) password = node.initializer.text
  if (ts.isVariableDeclaration(node) && node.name.getText(loginSource) === 'demoAccounts' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
    for (const item of node.initializer.elements) if (ts.isObjectLiteralExpression(item)) for (const property of item.properties) {
      if (ts.isPropertyAssignment(property) && property.name.getText(loginSource) === 'email' && ts.isStringLiteral(property.initializer) && property.initializer.text.includes('employee')) email = property.initializer.text
    }
  }
  ts.forEachChild(node, visit)
}
visit(loginSource)
if (!email || !password) throw Error('Development sign-in unavailable')
const originalFetch = globalThis.fetch
const response = await originalFetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10_000) })
email = ''; password = ''
let cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
if (!response.ok || !cookie) throw Error('Development authentication failed')
const actor = (await response.json()).user
const state = { actor, spans: [], provider: [] }
const symbol = Symbol.for('hr.voice.performance')
globalThis[symbol] = state
state.measure = async (name, operation) => {
  const started = performance.now()
  try { return await operation() } finally { state.spans.push({ stage: name, ms: +(performance.now() - started).toFixed(2) }) }
}
const access = "globalThis[Symbol.for('hr.voice.performance')]"
async function isolated(file, overrides) {
  let code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
  code = code.replaceAll('import.meta.url', JSON.stringify(file.href)).replace(/from (['"])([^'"]+)\1/g, (_match, _quote, specifier) => {
    const url = overrides[specifier] ? 'data:text/javascript;base64,' + Buffer.from(overrides[specifier]).toString('base64')
      : specifier.startsWith('.') ? new URL(specifier.replace(/\.js$/, '.ts'), file).href : import.meta.resolve(specifier)
    return `from ${JSON.stringify(url)}`
  })
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}
const url = path => JSON.stringify(new URL(path, import.meta.url).href)
const seconds = ns => typeof ns === 'number' ? +(ns / 1e9).toFixed(4) : null
const streaming = process.argv.includes('--stream-metrics')
globalThis.fetch = async (resource, init) => {
  const endpoint = new URL(typeof resource === 'string' || resource instanceof URL ? resource : resource.url)
  if (endpoint.origin !== new URL(env.OLLAMA_BASE_URL).origin) throw Error('Non-Ollama network forbidden in profiling process')
  const body = init?.body ? JSON.parse(String(init.body)) : null
  const started = performance.now()
  const record = { path: endpoint.pathname, model: body?.model,
    messageCount: body?.messages?.length ?? 0, promptCharacters: body?.messages?.reduce((sum, m) => sum + m.content.length, 0) ?? 0,
    schemaCharacters: body?.format ? JSON.stringify(body.format).length : 0, think: body?.think,
    keepAlive: body?.keep_alive ?? 'Ollama default', retries: 0 }
  state.provider.push(record)
  try {
    let result = await originalFetch(resource, streaming && body?.messages ? { ...init, body: JSON.stringify({ ...body, stream: true }) } : init)
    let data
    if (streaming && body?.messages && result.ok) {
      record.diagnosticStreaming = true
      let pending = '', content = '', thinkingCharacters = 0
      const decoder = new TextDecoder()
      for await (const chunk of result.body) {
        pending += decoder.decode(chunk, { stream: true })
        let newline
        while ((newline = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
          if (!line.trim()) continue
          const part = JSON.parse(line)
          if (part.message?.content && record.firstContentMs == null) record.firstContentMs = Math.round(performance.now() - started)
          content += part.message?.content ?? ''; thinkingCharacters += part.message?.thinking?.length ?? 0
          record.outputCharactersSoFar = content.length; record.thinkingCharacters = thinkingCharacters
          if (part.done) data = { ...part, message: { role: 'assistant', content } }
        }
      }
      if (!data) throw Error('Incomplete stream')
      result = new Response(JSON.stringify(data), { status: result.status, headers: { 'Content-Type': 'application/json' } })
    } else data = await result.clone().json()
    record.wallSeconds = +((performance.now() - started) / 1000).toFixed(4)
    record.httpStatus = result.status
    for (const name of ['total_duration', 'load_duration', 'prompt_eval_duration', 'eval_duration']) record[name] = seconds(data[name])
    record.promptTokens = data.prompt_eval_count ?? null; record.outputTokens = data.eval_count ?? null
    record.thinkingCharacters ??= data.message?.thinking?.length ?? 0
    record.unattributedSeconds = data.total_duration == null ? null : seconds(Math.max(0, data.total_duration - (data.load_duration ?? 0) - (data.prompt_eval_duration ?? 0) - (data.eval_duration ?? 0)))
    return result
  } catch (error) {
    record.wallSeconds = +((performance.now() - started) / 1000).toFixed(4)
    record.error = error.name === 'TimeoutError' || init?.signal?.aborted ? 'timeout' : 'connection'
    throw error
  }
}
const rows = []
try {
  const route = await isolated(new URL('../src/routes/copilot.ts', import.meta.url), {
    '../middleware.js': `export const requireAuth=async(c,next)=>{c.set('user',${access}.actor);await next()};export const validateBody=schema=>async(c,next)=>{const p=schema.safeParse(await c.req.json());if(!p.success)return c.json({error:'invalid'},422);c.set('body',p.data);await next()}`,
    '../copilot/resolve.js': `import * as actual from ${url('../src/copilot/resolve.ts')};${['resolveQuestion', 'resolveAction', 'continueTask', 'phraseAnswer'].map(name => `export const ${name}=(...args)=>${access}.measure('${name}',()=>actual.${name}(...args));`).join('')}`,
    '../knowledge/service.js': `export * from ${url('../src/knowledge/service.ts')};import {answerFromKnowledge as actual} from ${url('../src/knowledge/service.ts')};export const answerFromKnowledge=(...args)=>${access}.measure('knowledgeReply',()=>actual(...args))`,
    '../copilot/execute.js': `export * from ${url('../src/copilot/execute.ts')};import {executeIntent as actual} from ${url('../src/copilot/execute.ts')};export const executeIntent=(...args)=>${access}.measure('existingReadService',()=>actual(...args))`,
    '../copilot/perform.js': `export {proposeAction} from ${url('../src/copilot/perform.ts')};export const runAction=async()=>{throw Error('Confirmed writes forbidden in profiler')}`,
    '../copilot/audit.js': 'export const auditCopilot=async()=>{}',
    '../copilot/unanswered.js': 'export const saveUnansweredQuestion=async()=>{}',
  })
  const app = new Hono().route('/copilot', route.copilotRoutes)
  const ps = await originalFetch(env.OLLAMA_BASE_URL + '/api/ps').then(r => r.json())
  const before = { loaded: ps.models?.map(m => ({ model: m.name, expiresAt: m.expires_at, contextLength: m.context_length, sizeVRAM: m.size_vram })) }
  // Warm only when explicitly requested, so cold/warm comparisons are visible.
  let warmup = null
  if (process.argv.includes('--warm')) {
    const started = performance.now()
    const loaded = await originalFetch(env.OLLAMA_BASE_URL + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env.OLLAMA_MODEL, keep_alive: '30m', stream: false }), signal: AbortSignal.timeout(120_000) }).then(r => r.json())
    warmup = { wallMs: Math.round(performance.now() - started), loadSeconds: seconds(loaded.load_duration) }
  }
  const cases = [
    ['arabic-transcript', 'ورجين رصيد إجازاتي'],
    ['jordanian-transcript', 'كديش ضيل إلي إجازة'],
    ['mixed-transcript', 'ورجين يتندس تبعيها الشهر'],
    ['ambiguous', 'شو وضع الموارد البشرية؟'],
    ['local-control', 'What is the weather on Mars?'],
  ]
  const selected = process.argv.find(arg => arg.startsWith('--cases='))?.slice(8).split(',')
  for (const [index, [id, question]] of cases.entries()) {
    if (selected && !selected.includes(id)) continue
    state.spans = []; state.provider = []
    const voiceId = randomUUID(), started = performance.now()
    const result = await app.request('/copilot/ask', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'x-copilot-channel': 'voice', 'x-voice-session': voiceId, 'x-voice-audit': voiceAuditSignature(voiceId) },
      body: JSON.stringify({ question, lang: 'ar', path: index % 2 ? '/home' : '/assistant', context: { currentPage: index % 2 ? '/home' : '/assistant' } }) })
    const data = await result.json()
    const row = { id, syntheticTranscript: question, trainingExamples: questionTrainingExamples(question, actor.role).length,
      totalMs: Math.round(performance.now() - started), status: result.status, intent: data.answer?.intent,
      resultKind: data.answer?.result.kind, refusal: data.answer?.refusal, error: data.error ?? null,
      spans: state.spans, providerCalls: state.provider }
    rows.push(row); console.log(JSON.stringify(row))
    writeFileSync(`local-voice-copilot-profile${process.argv.includes('--warm') ? '-warm' : ''}${streaming ? '-stream' : ''}.json`, JSON.stringify({ mode: 'isolated unchanged route profiling; authenticated actor; no audit/training writes', before, warmup, rows }, null, 2))
  }
} finally {
  globalThis.fetch = originalFetch; delete globalThis[symbol]
  await originalFetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie }, signal: AbortSignal.timeout(5000) }).catch(() => undefined)
  cookie = ''; await closeDb()
}
