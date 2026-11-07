import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { registerInternalApi } from './internalApi.js'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { pruneExpiredSessions } from './auth/session.js'
import { allowedOrigins, env, isProduction, interviewLlmConfiguration } from './env.js'
import { closeDb, pool } from './db/client.js'
import type { AppEnv } from './middleware.js'
import { attendanceRoutes } from './routes/attendance.js'
import { assistantReviewRoutes } from './routes/assistantReview.js'
import { authRoutes } from './routes/auth.js'
import { calendarRoutes } from './routes/calendar.js'
import { careerRoutes } from './routes/careers.js'
import { interviewRoutes } from './routes/interview.js'
import { copilotRoutes } from './routes/copilot.js'
import { cvRoutes } from './routes/cv.js'
import { employeeRoutes } from './routes/employees.js'
import { feedRoutes } from './routes/feed.js'
import { hrAttentionRoutes } from './routes/hrAttention.js'
import { jobDescriptionRoutes } from './routes/jobDescriptions.js'
import { knowledgeRoutes } from './routes/knowledge.js'
import { payrollRoutes } from './routes/payroll.js'
import { recruitmentRoutes } from './routes/recruitment.js'
import { requestRoutes } from './routes/requests.js'
import { statsRoutes } from './routes/stats.js'
import { streamRoutes } from './routes/stream.js'
import { voiceRoutes } from './routes/voice.js'
import { createInterviewRoutes } from './aiInterviewer/routes.js'
import { interviewService, startInterviewMaintenance } from './aiInterviewer/runtime.js'
import { DatabaseReadinessProbe, createInterviewHealthRoutes } from './aiInterviewer/health.js'
import { InterviewShutdown } from './aiInterviewer/shutdown.js'
import { interviewSpeechProviders } from './aiInterviewer/speechRuntime.js'
import { CandidateAudioTransport } from './aiInterviewer/audioTransport.js'
import { CandidateTtsDelivery } from './aiInterviewer/playbackTransport.js'
import { InterviewLlmOrchestrator } from './aiInterviewer/llmOrchestrator.js'
import { interviewLlmProvider } from './aiInterviewer/llmRuntime.js'
import { interviewEvaluationProvider } from './aiInterviewer/evaluationRuntime.js'
import { InterviewReportService } from './aiInterviewer/reportService.js'
import { interviewOperations } from './aiInterviewer/operations.js'
import { interviewSecurityHeaders, isInterviewPath } from './aiInterviewer/securityHeaders.js'

/**
 * Walks up from a starting directory until it finds the built web app.
 *
 * Throws rather than returning a guess: a production server that silently
 * serves no interface looks alive to a health check and broken to every human,
 * and failing at boot with the path it searched is far easier to diagnose.
 */
function findWebRoot(from: string): string {
  let dir = from
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, 'apps', 'hr-web', 'dist')
    if (existsSync(join(candidate, 'index.html'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`could not find apps/hr-web/dist above ${from} — run "npm run build" before starting`)
}

const app = new Hono<AppEnv>()
const interviewShutdown = new InterviewShutdown()

app.use('*', async (c, next) => {
  if (!isInterviewPath(c.req.path)) return next()
  return interviewSecurityHeaders(c, async () => {
    if (interviewShutdown.draining && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) throw new HTTPException(503, {message: 'serverDraining'})
    await next()
  })
})

app.use('*', async (c, next) => {
  // Candidate URLs must never copy an accidentally supplied invite into logs.
  if (isInterviewPath(c.req.path) || c.req.path === '/health' || c.req.path.startsWith('/health/')) return next()
  return logger()(c, next)
})
app.use('*', secureHeaders())

/**
 * Credentials are on, so the origin list must be exact — a wildcard is rejected
 * by browsers for cookie-bearing requests, and would be wrong here anyway.
 */
app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]!),
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

const healthQuery = {text: 'select 1', query_timeout: 1500}
const databaseReadiness = new DatabaseReadinessProbe(() => pool.query(healthQuery))
app.route('/health', createInterviewHealthRoutes({database: databaseReadiness, runtime: () => stopInterviewMaintenance.health(),
  provider: () => aiInterviewRoutes.delivery.readiness(), draining: () => interviewShutdown.draining}))

app.route('/api/auth', authRoutes)
app.route('/api/attendance', attendanceRoutes)
app.route('/api/assistant-review', assistantReviewRoutes)
app.route('/api/requests', requestRoutes)
app.route('/api/employees', employeeRoutes)
app.route('/api/payroll', payrollRoutes)
app.route('/api/feed', feedRoutes)
app.route('/api/hr-attention', hrAttentionRoutes)
app.route('/api/calendar', calendarRoutes)
app.route('/api/recruitment', recruitmentRoutes)
const aiInterviewAudio = env.AI_INTERVIEW_AUDIO_UPLOAD_ENABLED ? new CandidateAudioTransport(interviewService, interviewSpeechProviders) : undefined
const aiInterviewPlayback = env.AI_INTERVIEW_TTS_PLAYBACK_ENABLED ? new CandidateTtsDelivery(interviewService, interviewSpeechProviders) : undefined
const aiInterviewModel=new InterviewLlmOrchestrator(interviewService,interviewLlmProvider,interviewLlmConfiguration.timeoutMs)
aiInterviewModel.start()
const aiInterviewReports=new InterviewReportService(interviewService,interviewEvaluationProvider)
const aiInterviewRoutes = createInterviewRoutes(interviewService, { origins: allowedOrigins, secure: isProduction, production: isProduction, developmentMock: env.AI_INTERVIEW_DEV_MOCK, audio: aiInterviewAudio, playback: aiInterviewPlayback,model:aiInterviewModel,reports:aiInterviewReports })
app.route('/api/recruitment', aiInterviewRoutes.staff)
app.route('/api/ai-interview', aiInterviewRoutes.candidate)
/**
 * The only routes in this server that do not require a session.
 * See `routes/careers.ts` for the rules that apply because of it.
 */
app.route('/api/careers', careerRoutes)
/*
 * Also public, for the same reason and under the same rules: the person
 * answering a written interview has no account. See `routes/interview.ts`.
 */
app.route('/api/interview', interviewRoutes)
app.route('/api/job-descriptions', jobDescriptionRoutes)
app.route('/api/knowledge', knowledgeRoutes)
app.route('/api/cv', cvRoutes)
app.route('/api/copilot', copilotRoutes)
app.route('/api/voice', voiceRoutes)
app.route('/api/stats', statsRoutes)
app.route('/api/stream', streamRoutes)

/**
 * One error shape for every failure.
 *
 * A thrown HTTPException carries a machine-readable code the web app translates;
 * anything else is logged in full and reported as a bare 500, so an internal
 * message or a stack never reaches the browser.
 */
app.onError((err, c) => {
  if (isInterviewPath(c.req.path) && !(err instanceof HTTPException)) {
    interviewOperations.record({event: 'request_rejected', code: 'INTERNAL'})
    return c.json({error: 'aiInterviewInternal', message: 'aiInterviewInternal'}, 500)
  }
  if (err instanceof HTTPException) {
    const res = err.getResponse()
    if (res.headers.get('content-type')?.includes('application/json')) return res
    return c.json({ error: err.message, message: err.message }, err.status)
  }

  console.error('[error]', err)
  return c.json(
    {
      error: 'internal',
      message: isProduction ? 'Something went wrong.' : String(err instanceof Error ? err.stack : err),
    },
    500,
  )
})

/**
 * In production this server also serves the web app.
 *
 * One deployment instead of two, one URL to configure, one set of environment
 * variables, and no CORS involved in the app's own requests — there is no
 * second origin.
 *
 * The session cookie still goes out as `SameSite=None`, and that is not an
 * oversight: the Android shell loads from `capacitor://` and talks to this
 * server across origins, so a stricter setting would sign that app out. The
 * browser simply stops depending on it.
 *
 * In development this block does nothing: Vite serves the app on 5173 with hot
 * reloading, and `dist/` does not exist.
 */
if (isProduction) {
  /**
   * Found by walking up, not by counting `../`.
   *
   * The compiled file lands at `services/hr-api/dist/services/hr-api/src/index.js`, so the number
   * of levels back to the repository root is a property of the build layout
   * rather than of this file — and it is wrong the first time anybody changes
   * `outDir`. Walking up until `apps/hr-web/dist` appears cannot drift.
   */
  const webRoot = findWebRoot(dirname(fileURLToPath(import.meta.url)))
  console.log(`[api] serving the web app from ${webRoot}`)

  app.use('/assets/*', serveStatic({ root: relative(process.cwd(), webRoot) }))
  app.get('/favicon.ico', serveStatic({ path: relative(process.cwd(), join(webRoot, 'favicon.ico')) }))

  /**
   * Anything that is not an API route is the single-page app.
   *
   * It has to be a catch-all rather than a file lookup: `/careers/jobs/some-slug`
   * is a route React knows and the filesystem does not, and a visitor who
   * follows that link from LinkedIn must land on the page, not on a 404.
   */
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next()
    const html = await readFile(join(webRoot, 'index.html'), 'utf8').catch(() => null)
    if (!html) return next()
    return c.html(html)
  })
}

app.notFound((c) => c.json({ error: 'notFound', message: 'No such endpoint.' }, 404))

/*
 * The assistant reaches the routes above through this, as a client rather than
 * as a second implementation — see `internalApi.ts`. Registered after every
 * route is mounted and after the error handler, so an internal call gets the
 * same shaped failure a browser would.
 */
registerInternalApi(app.fetch)

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
  console.log(`[api] cors origins: ${allowedOrigins.join(', ')}`)
})

// Sessions that can no longer authenticate anyone are cleared hourly.
const pruneTimer = setInterval(() => {
  pruneExpiredSessions()
    .then((n) => n > 0 && console.log(`[api] pruned ${n} expired sessions`))
    .catch(() => console.error('[api] session pruning unavailable'))
}, 60 * 60 * 1000)
pruneTimer.unref()
const stopInterviewMaintenance = startInterviewMaintenance(interviewService,aiInterviewReports)

async function shutdown(signal: string) {
  console.log(`\n[api] ${signal} — closing`)
  clearInterval(pruneTimer)
  const result = await interviewShutdown.run({
    http: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(Error('httpDrainFailed')) : resolve())),
    runtime: async () => {await aiInterviewModel.close();await stopInterviewMaintenance.shutdown()}, provider: async () => {aiInterviewAudio?.close(); await aiInterviewPlayback?.close(); interviewSpeechProviders.close(); await aiInterviewRoutes.delivery.close()}, database: closeDb,
    forceConnections: () => {if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') server.closeAllConnections()},
  })
  process.exit(result.complete ? 0 : 1)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
