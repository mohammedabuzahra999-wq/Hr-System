import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import ts from 'typescript'
import type { ActionParams, CopilotActionPlan, CopilotPlan, Role, SessionUser } from '@hr/shared'
import { planFor, questionPlanFor } from './schemas.js'

// Exercise real MCP handlers and the real requireAuth/resolveSession boundary
// through an in-memory HTTP service. SDK transport, DB transport and business
// operations are test doubles; all non-fixture network access is forbidden.
function isolatedUrl(file: URL, overrides: Record<string, string>) {
  let code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText
  code = code.replace(/from (['"])([^'"]+)\1/g, (_match, _quote: string, specifier: string) => {
    const replacement = overrides[specifier]
    const url = replacement ? 'data:text/javascript;base64,' + Buffer.from(replacement).toString('base64')
      : specifier.startsWith('.') ? new URL(specifier.replace(/\.js$/, '.ts'), file).href : import.meta.resolve(specifier)
    return `from ${JSON.stringify(url)}`
  })
  return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
}
type ToolResult = { content: { text: string }[] }
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>
const key = Symbol.for('hr.check.mcp-authorization')
const globals = globalThis as unknown as Record<symbol, unknown>
assert.equal(globals[key], undefined)
const access = "globalThis[Symbol.for('hr.check.mcp-authorization')]"
const userId = randomUUID()
const user: SessionUser = {
  id: userId, role: 'hr', email: 'mcp-fixture@example.invalid', employeeNumber: 'SYN-MCP',
  fullName: { en: 'Synthetic MCP', ar: 'Synthetic MCP' }, department: { en: 'Test', ar: 'Test' },
  jobTitle: { en: 'Synthetic', ar: 'Synthetic' }, managerId: null, managerName: null, photoUrl: null,
}
const token = 'synthetic-session-token-for-in-memory-test-only'
const signingSecret = 'synthetic-cookie-signing-secret-for-security-test-only'
const tokenHash = createHash('sha256').update(token).digest('hex')
const tools = new Map<string, Handler>()
const calls = { resolve: 0, actionResolve: 0, execute: 0, propose: 0, run: 0, phrase: 0 }
const state = {
  tools, user: { ...user }, active: true, exists: true, expiresAt: new Date(Date.now() + 3_600_000),
  meFailure: false, malformed: false, substitutedIdentity: false, authChecks: 0,
  questionPlan: questionPlanFor('payrollInsights', {}), actionPlan: planFor('setSalary', { amount: 7 }),
  afterResolve: null as (() => void) | null, afterPropose: null as (() => void) | null,
  executedActors: [] as SessionUser[], proposedActors: [] as SessionUser[], runActors: [] as SessionUser[],
  resolveQuestion(_question: string, role: Role) {
    calls.resolve++; assert.equal(role, this.user.role, 'Model routing must receive the current role')
    this.afterResolve?.(); return { ok: true, plan: this.questionPlan }
  },
  resolveAction(_question: string, role: Role) {
    calls.actionResolve++; assert.equal(role, this.user.role)
    this.afterResolve?.(); return { ok: true, plan: this.actionPlan }
  },
  executeIntent(_plan: CopilotPlan, actor: SessionUser) {
    calls.execute++; this.executedActors.push(actor)
    return { result: { kind: 'stats', stats: [] }, periodLabel: null, empty: false }
  },
  proposeAction(plan: CopilotActionPlan, actor: SessionUser) {
    calls.propose++; this.proposedActors.push(actor); this.afterPropose?.()
    const params: ActionParams = { ...plan, targetId: randomUUID() }
    return { ok: true, proposal: { action: plan.action, params, summary: { en: 'Synthetic proposal', ar: 'Synthetic proposal' },
      details: [], caution: null, destructive: false } }
  },
  runAction(_params: ActionParams, actor: SessionUser) {
    calls.run++; this.runActors.push(actor)
    return { ok: true, message: { en: 'Synthetic success', ar: 'Synthetic success' }, messageKey: null, path: null }
  },
}
const dialect = new PgDialect()
const db = { select: () => ({ from: () => ({ innerJoin: () => ({ where: (condition: SQL) => ({ limit: async () => {
  const query = dialect.sqlToQuery(condition)
  assert.match(query.sql, /"expires_at" >/, 'Real session lookup must enforce expiry')
  // Drizzle encodes timestamp bind values as strings for PostgreSQL.
  const cutoff = new Date(query.params[1] as string | Date)
  assert.ok(Number.isFinite(cutoff.getTime()))
  if (!state.exists || query.params[0] !== tokenHash || state.expiresAt <= cutoff) return []
  return [{ sessions: { tokenHash, expiresAt: state.expiresAt }, users: { isActive: state.active, publicUser: { ...state.user } } }]
} }) }) }) }) }
// Keep state methods and fixture mutations on the same object exposed to modules.
globals[key] = state
Object.assign(state, { db })
const savedFetch = globalThis.fetch
const envNames = ['HR_API_URL', 'HR_MCP_EMAIL', 'HR_MCP_PASSWORD'] as const
const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
process.env.HR_API_URL = 'http://mcp-security.invalid/api'
process.env.HR_MCP_EMAIL = user.email
process.env.HR_MCP_PASSWORD = 'synthetic-password-only'
let checks = 0
function pass(label: string) { checks++; console.log(`PASS: ${label}`) }
function reset() {
  state.user = { ...user }; state.active = true; state.exists = true
  state.expiresAt = new Date(Date.now() + 3_600_000)
  state.meFailure = state.malformed = state.substitutedIdentity = false
  state.afterResolve = state.afterPropose = null
  state.questionPlan = questionPlanFor('payrollInsights', {})
  state.actionPlan = planFor('setSalary', { amount: 7 })
}
async function invoke(name: string, args: Record<string, unknown> = {}) {
  const handler = tools.get(name)
  assert.ok(handler, `Registered fixture tool ${name}`)
  const before = state.authChecks
  const result = await handler(args)
  assert.ok(state.authChecks > before, 'Every tool must consult the HTTP authorization boundary')
  return JSON.parse(result.content[0]!.text) as { ok?: boolean; reason?: string; token?: string; pending?: boolean }
}
try {
  const authUrl = isolatedUrl(new URL('../auth/session.ts', import.meta.url), {
    '../db/client.js': `export const db=${access}.db`,
    '../env.js': `export const env={SESSION_SECRET:${JSON.stringify(signingSecret)}};export const isProduction=false`,
    '../mappers.js': 'export const toSessionUser=row=>row.publicUser',
  })
  const middlewareUrl = isolatedUrl(new URL('../middleware.ts', import.meta.url), {
    './auth/session.js': `export {resolveSession} from ${JSON.stringify(authUrl)}`,
    './copilot/audit.js': 'export const auditCopilot=async()=>{}',
  })
  const { requireAuth } = await import(middlewareUrl) as typeof import('../middleware.js')
  const auth = new Hono()
  auth.post('/api/auth/login', async c => {
    await setSignedCookie(c, 'hr_session', token, signingSecret, { httpOnly: true, path: '/' })
    return c.json({ user })
  })
  auth.get('/api/auth/me', requireAuth, c => {
    if (state.malformed) return c.json({ user: { role: 'admin' } })
    return c.json({ user: state.substitutedIdentity ? { ...state.user, id: randomUUID() } : state.user })
  })
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    assert.equal(url.origin, 'http://mcp-security.invalid', 'Real network access forbidden')
    assert.ok(['/api/auth/login', '/api/auth/me'].includes(url.pathname), 'Only in-memory auth routes are allowed')
    if (url.pathname === '/api/auth/me') {
      state.authChecks++
      if (state.meFailure) throw new Error('Synthetic auth transport failure')
    }
    return auth.fetch(request)
  }
  const serverUrl = isolatedUrl(new URL('./server.ts', import.meta.url), {
    '@modelcontextprotocol/sdk/server/mcp.js': `export class McpServer {registerTool(name,_config,handler){${access}.tools.set(name,handler)}async connect(){}}`,
    '@modelcontextprotocol/sdk/server/stdio.js': 'export class StdioServerTransport {}',
    '../copilot/resolve.js': `export const resolveQuestion=(...args)=>${access}.resolveQuestion(...args);
      export const resolveAction=(...args)=>${access}.resolveAction(...args);export const phraseAnswer=async()=>null`,
    '../copilot/execute.js': `export const executeIntent=(...args)=>${access}.executeIntent(...args)`,
    '../copilot/perform.js': `export const proposeAction=(...args)=>${access}.proposeAction(...args);
      export const runAction=(...args)=>${access}.runAction(...args)`,
  })
  const server = await import(serverUrl) as typeof import('./server.js')
  await server.startMcpServer()

  assert.equal((await invoke('hr_payrollInsights')).ok, true)
  assert.equal(state.executedActors.at(-1)?.role, 'hr')
  pass('valid active authorized session succeeds')
  assert.equal((await invoke('hr_ask', { question: 'Synthetic company payroll request' })).ok, true)
  pass('normal authorized question route still works')

  for (const invalid of ['expired', 'revoked', 'disabled', 'transport', 'malformed', 'identity'] as const) {
    reset()
    if (invalid === 'expired') state.expiresAt = new Date(0)
    if (invalid === 'revoked') state.exists = false
    if (invalid === 'disabled') state.active = false
    if (invalid === 'transport') state.meFailure = true
    if (invalid === 'malformed') state.malformed = true
    if (invalid === 'identity') state.substitutedIdentity = true
    const before = { ...calls }
    for (const name of tools.keys()) assert.equal((await invoke(name)).reason, 'notAuthenticated', `${invalid}/${name}`)
    assert.deepEqual(calls, before, 'Invalid auth must prevent classification, proposals, reads and writes')
    pass(`${invalid}: every registered tool fails closed before protected work`)
  }

  reset(); state.user.role = 'employee'
  const before = calls.execute
  assert.equal((await invoke('hr_payrollInsights', { role: 'admin', actorId: randomUUID() })).reason, 'notPermitted')
  assert.equal((await invoke('hr_ask', { question: 'Synthetic protected request' })).reason, 'notPermitted')
  assert.equal(calls.execute, before)
  assert.equal((await invoke('hr_setSalary', { amount: 7 })).reason, 'notPermitted')
  const capabilities = await invoke('hr_capabilities')
  assert.ok(!JSON.stringify(capabilities).includes('payrollInsights'))
  pass('role downgrade takes effect without restart; stale tools and caller role hints cannot retain access')
  state.questionPlan = questionPlanFor('myAttendance', {})
  assert.equal((await invoke('hr_myAttendance', { role: 'admin' })).ok, true)
  assert.equal(state.executedActors.at(-1)?.role, 'employee')
  assert.equal(state.executedActors.at(-1)?.id, userId)
  pass('still-authorized self access uses fresh downgraded identity')

  reset(); state.user.role = 'manager'
  assert.equal((await invoke('hr_teamAttendance')).ok, true)
  assert.equal(state.executedActors.at(-1)?.role, 'manager')
  pass('fresh manager role reaches existing team-scoped executor')

  for (const revoked of ['role', 'session'] as const) {
    reset()
    state.afterResolve = () => { if (revoked === 'role') state.user.role = 'employee'; else state.exists = false }
    const before = calls.execute
    assert.equal((await invoke('hr_ask', { question: 'Synthetic delayed classification' })).reason,
      revoked === 'role' ? 'notPermitted' : 'notAuthenticated')
    assert.equal(calls.execute, before)
    pass(`${revoked} revoked during classification: rechecked before direct read`)
    const proposedBefore = calls.propose
    reset(); state.afterResolve = () => { if (revoked === 'role') state.user.role = 'employee'; else state.exists = false }
    assert.equal((await invoke('hr_propose', { instruction: 'Synthetic delayed action classification' })).reason,
      revoked === 'role' ? 'notPermitted' : 'notAuthenticated')
    assert.equal(calls.propose, proposedBefore)
    pass(`${revoked} revoked during action classification: rechecked before proposal`)
  }

  reset()
  const proposal = await invoke('hr_setSalary', { amount: 7 })
  assert.ok(proposal.pending && proposal.token)
  const runs = calls.run
  state.user.role = 'employee'
  assert.equal((await invoke('hr_confirm', { token: proposal.token })).reason, 'notPermitted')
  assert.equal(calls.run, runs)
  state.user.role = 'hr'
  assert.equal((await invoke('hr_confirm', { token: proposal.token })).reason, 'unknownOrExpiredToken')
  const authorizedProposal = await invoke('hr_setSalary', { amount: 7 })
  assert.ok(authorizedProposal.token)
  assert.equal((await invoke('hr_confirm', { token: authorizedProposal.token })).ok, true)
  assert.equal(state.runActors.at(-1)?.role, 'hr')
  assert.equal((await invoke('hr_confirm', { token: authorizedProposal.token })).reason, 'unknownOrExpiredToken')
  pass('pending action requires current permission; authorized confirmation and one-time token still work')

  reset(); state.afterPropose = () => { state.user.role = 'employee' }
  const runBefore = calls.run
  assert.equal((await invoke('hr_postAnnouncement', { title: 'Synthetic', text: 'Synthetic body' })).reason, 'notPermitted')
  assert.equal(calls.run, runBefore)
  pass('permission revoked during proposal: typed automatic action rechecks before execution')
  reset()
  assert.equal((await invoke('hr_postAnnouncement', { title: 'Synthetic', text: 'Synthetic body' })).ok, true)
  pass('normal authorized typed action continues to work')
  console.log(`PASS: ${checks} MCP authorization lifecycle scenarios; ${tools.size} tools checked for each invalid-auth state; no real network/DB/model access`)
} finally {
  globalThis.fetch = savedFetch
  for (const name of envNames) { if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name] }
  delete globals[key]
}
