import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import { getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { aiInterviewVersionedRequestSchema, candidateAiInterviewRequestSchema, createAiInterviewSchema } from '@hr/shared'
import { requireAuth, requireRole, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { rateLimit } from '../rateLimit.js'
import { InterviewDomainError } from './engine.js'
import { InterviewServiceError } from './repository.js'
import type { InterviewService } from './service.js'
import type { InterviewPrincipal } from './authorization.js'
import { InterviewReportService } from './reportService.js'
import { InterviewDeliveryGate } from './delivery.js'
import { interviewOperations } from './operations.js'
import { interviewSecurityHeaders } from './securityHeaders.js'
import { candidateAudioStatusSchema, candidateAudioUploadSchema } from '@hr/shared'
import type { CandidateAudioTransport } from './audioTransport.js'
import type { CandidateTtsDelivery } from './playbackTransport.js'
import type { InterviewLlmOrchestrator } from './llmOrchestrator.js'

export const CANDIDATE_COOKIE = 'ai_interview_session'
export const CANDIDATE_COOKIE_PATH = '/api/ai-interview'
const uuid = z.uuid()
export function createInterviewRoutes(service: InterviewService, options: { origins: string[]; secure: boolean; production?: boolean; developmentMock?: boolean; reports?: InterviewReportService; audio?: CandidateAudioTransport; playback?: CandidateTtsDelivery;model?:InterviewLlmOrchestrator }) {
  if (options.production === true && !options.secure) throw Error('insecureInterviewCookieConfiguration')
  const reports = options.reports ?? new InterviewReportService(service)
  const delivery = new InterviewDeliveryGate(service, { mode: 'disabled', production: options.production !== false })
  const mockEnabled = options.production === false && options.developmentMock === true
  const candidate = new Hono<AppEnv>(), staff = new Hono<AppEnv>()
  const jsonBody = async (c: { req: { json(): Promise<unknown> } }) => {
    try { return await c.req.json() } catch { throw new HTTPException(400, { message: 'invalidJson' }) }
  }
  for (const router of [candidate, staff]) {
    router.use('*', interviewSecurityHeaders)
    router.use('*', async (c, next) => {
      c.header('Cache-Control', 'private, no-store')
      c.header('Referrer-Policy', 'no-referrer')
      if (c.req.method !== 'GET' && !options.origins.includes(c.req.header('origin') ?? '')) throw new HTTPException(403, { message: 'interviewOriginDenied' })
      await next()
    })
    router.use('*', async (c, next) => router === candidate && c.req.method === 'POST' && c.req.path.endsWith('/audio/upload') ? next() : bodyLimit({ maxSize: router === candidate ? 70_000 : 1_000_000 })(c, next))
    router.onError((error, c) => {
      interviewOperations.record({event: 'request_rejected', code: error instanceof InterviewServiceError ? error.status === 429 ? 'THROTTLED' : error.status === 401 || error.status === 403 ? 'AUTH' : 'STALE' : error instanceof HTTPException ? error.status === 429 ? 'THROTTLED' : error.status >= 500 ? 'INTERNAL' : 'DENIED' : error instanceof z.ZodError ? 'INVALID' : 'INTERNAL'})
      if (router === candidate && error instanceof InterviewServiceError && error.code === 'interviewNotFound') return c.json({error: 'candidateSessionInvalid', message: 'candidateSessionInvalid'}, 401)
      if (error instanceof InterviewServiceError) return c.json({ error: error.code, message: error.code }, error.status)
      if (error instanceof InterviewDomainError) return c.json({ error: error.code, message: error.code }, 409)
      if (error instanceof z.ZodError) return c.json({ error: 'validationFailed', message: 'validationFailed' }, 422)
      if (error instanceof HTTPException) return c.json({ error: error.message, message: error.message }, error.status)
      // Do not pass transcript-bearing errors or SQL parameter values to general logs.
      return c.json({ error: 'aiInterviewInternal', message: 'aiInterviewInternal' }, 500)
    })
  }
  const actor = (userId: string): InterviewPrincipal => ({ kind: 'staff', userId })
  staff.use('*', rateLimit({name: 'ai-interview-staff-address', limit: 600, windowMs: 60000}), requireAuth, requireRole(...allowed('manageRecruitment')),
    rateLimit({name: 'ai-interview-staff-user', limit: 240, windowMs: 60000, keyBy: 'authenticated-user'}))
  const base = '/applications/:applicationId/ai-interviews'
  staff.get(base, async c => c.json(await service.list(actor(c.get('user').id), uuid.parse(c.req.param('applicationId')))))
  staff.get(`${base}/configuration`, async c => c.json(await service.configuration(actor(c.get('user').id), uuid.parse(c.req.param('applicationId')))))
  staff.get(`${base}/:interviewId/evaluation`, async c => {
    const version = c.req.query('reportVersion')
    return c.json(await reports.get(actor(c.get('user').id), uuid.parse(c.req.param('interviewId')), uuid.parse(c.req.param('applicationId')), version ? z.coerce.number().int().positive().parse(version) : undefined))
  })
  staff.post(`${base}/:interviewId/evaluation`, async c => {
    const id = uuid.parse(c.req.param('interviewId'))
    const result = await reports.request(actor(c.get('user').id), id, uuid.parse(c.req.param('applicationId')), await jsonBody(c))
    // The committed job survives response loss/restart. Maintenance also drains pending jobs.
    setTimeout(() => { void reports.runJob(id,result.reportVersion).catch(() => {}) }, 0)
    return c.json(result, 202)
  })
  staff.post(`${base}/:interviewId/evaluation/:reportVersion/review`, async c => c.json(await reports.review(actor(c.get('user').id), uuid.parse(c.req.param('interviewId')), uuid.parse(c.req.param('applicationId')), z.coerce.number().int().positive().parse(c.req.param('reportVersion')), await jsonBody(c))))
  staff.post(base, async c => c.json(await service.create(actor(c.get('user').id), uuid.parse(c.req.param('applicationId')), createAiInterviewSchema.parse(await jsonBody(c))), 201))
  staff.post(`${base}/:interviewId/generation`,rateLimit({name:'interview-model-plan',limit:12,windowMs:60000,keyExtra:c=>c.get('user').id}),async c=>c.json(await service.requestModelPlan(actor(c.get('user').id),uuid.parse(c.req.param('interviewId')),uuid.parse(c.req.param('applicationId')),await jsonBody(c))))
  staff.get(`${base}/:interviewId/generation`,async c=>c.json(await service.modelStatus(actor(c.get('user').id),uuid.parse(c.req.param('interviewId')),uuid.parse(c.req.param('applicationId')))))
  staff.post(`${base}/:interviewId/generation/approve`,async c=>c.json(await service.approveModelPlan(actor(c.get('user').id),uuid.parse(c.req.param('interviewId')),uuid.parse(c.req.param('applicationId')),await jsonBody(c))))
  staff.post(`${base}/:interviewId/generation/control`,rateLimit({name:'interview-model-control',limit:20,windowMs:60000,keyExtra:c=>c.get('user').id}),async c=>{const id=uuid.parse(c.req.param('interviewId')),body=await jsonBody(c),result=await service.controlModelJob(actor(c.get('user').id),id,uuid.parse(c.req.param('applicationId')),body);if(z.object({operation:z.string()}).passthrough().parse(body).operation==='CANCEL')options.model?.cancel(id);return c.json(result)})
  staff.get(`${base}/:interviewId`, async c => {
    const row = await service.load(actor(c.get('user').id), uuid.parse(c.req.param('interviewId')), uuid.parse(c.req.param('applicationId')))
    return c.json({ interviewId: row.id, applicationId: row.applicationId, attempt: row.attempt, version: row.version,
      snapshot: row.snapshot, frozenInputs: row.frozenInputs, consent: row.consent, lastSequence: row.lastSequence })
  })
  for (const name of ['ready', 'invitation', 'revoke-invitation', 'cancel'] as const) {
    staff.post(`${base}/:interviewId/${name}`, async c => {
      const principal = actor(c.get('user').id), id = uuid.parse(c.req.param('interviewId')), applicationId = uuid.parse(c.req.param('applicationId'))
      const request = aiInterviewVersionedRequestSchema.parse(await jsonBody(c))
      const result = name === 'ready' ? await service.ready(principal, id, request, applicationId)
        : name === 'invitation' ? await service.invite(principal, id, request, applicationId)
          : name === 'revoke-invitation' ? await service.revoke(principal, id, request, applicationId)
            : await service.execute(principal, id, request.expectedVersion, { type: 'CANCEL_INTERVIEW', commandId: request.commandId }, applicationId)
      return c.json({ interviewId: id, version: result.row.version, duplicate: result.duplicate,
        ...(name === 'invitation' ? { token: result.token, expiresAt: result.row.inviteExpiresAt } : {}) })
    })
  }
  candidate.use('*', rateLimit({ name: 'ai-interview-read', limit: 300, windowMs: 60_000 }))
  const principal = (credential: string | undefined): InterviewPrincipal => {
    if (!credential) throw new InterviewServiceError(401, 'candidateSessionInvalid')
    return { kind: 'candidate', credential }
  }
  const credential = (c: Parameters<typeof getCookie>[0]) => getCookie(c, CANDIDATE_COOKIE)
  const requestId = (requested: string | undefined, cookie: string | undefined) => uuid.parse(requested ?? cookie?.split('.')[0])
  candidate.get('/config', async c => {let modelEnabled=service.llm.enabled;const cookie=credential(c);if(cookie){try{const id=requestId(undefined,cookie);await service.load(principal(cookie),id);modelEnabled=await service.requiresModel(id)}catch{modelEnabled=false}}return c.json({ mockControlsEnabled: mockEnabled, provider: 'mock', audioCaptureEnabled: !!options.audio, playbackEnabled: !!options.playback,modelEnabled })})
  candidate.get('/orchestration/status',async c=>{const cookie=credential(c);return c.json(await service.modelStatus(principal(cookie),requestId(c.req.query('interviewId'),cookie)))})
  for(const action of ['prepare','status','audio','start','pulse','end','stop','cancel'] as const)candidate.post(`/playback/${action}`,rateLimit({name:`candidate-playback-${action}`,limit:action==='pulse'?90:action==='status'?90:action==='prepare'?12:30,windowMs:60000,keyExtra:c=>credential(c)?.split('.')[0]??null}),async c=>{
    const p=principal(credential(c)),body=await jsonBody(c),id=z.object({interviewId:uuid}).passthrough().parse(body).interviewId
    await service.load(p,id)
    if(!options.playback)throw new HTTPException(503,{message:'playbackUnavailable'})
    if(action==='audio'){const bytes=await options.playback.audio(p,body);c.header('Content-Type','audio/wav');c.header('Content-Length',String(bytes.length));return c.body(bytes as unknown as ArrayBuffer)}
    return c.json(await(action==='prepare'?options.playback.prepare(p,body):action==='status'?options.playback.status(p,body):action==='cancel'?options.playback.cancel(p,body):options.playback.action(p,action,body)))
  })
  candidate.get('/delivery/readiness', rateLimit({name: 'ai-interview-provider-readiness', limit: 60, windowMs: 60000}), c => c.json(delivery.readiness()))
  candidate.post('/session/exchange', rateLimit({ name: 'ai-interview-exchange', limit: 10, windowMs: 60_000 }), async c => {
    const body = z.object({ token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/), interviewId: uuid.optional() }).strict().parse(await jsonBody(c))
    const result = await service.exchange(body.token, body.interviewId)
    setCookie(c, CANDIDATE_COOKIE, result.credential, { httpOnly: true, secure: options.secure, sameSite: 'Lax',
      path: CANDIDATE_COOKIE_PATH, expires: result.expiresAt })
    return c.json({ interviewId: result.interviewId, expiresAt: result.expiresAt })
  })
  for (const path of ['/session', '/state']) candidate.get(path, async c => {
    const cookie = credential(c)
    const p = principal(cookie)
    return c.json(service.candidateState(await service.load(p, requestId(c.req.query('interviewId'), cookie))))
  })
  candidate.post('/commands', rateLimit({ name: 'ai-interview-command', limit: 120, windowMs: 60_000,
    keyExtra: c => getCookie(c, CANDIDATE_COOKIE)?.split('.')[0] ?? null }), async c => {
    const p = principal(credential(c))
    const body = candidateAiInterviewRequestSchema.parse(await jsonBody(c))
    if (!mockEnabled && ['CANDIDATE_SPEECH_STARTED', 'CANDIDATE_SPEECH_FINISHED', 'CANDIDATE_TRANSCRIPT_FINAL'].includes(body.command.type)) {
      await service.load(p, body.interviewId)
      throw new HTTPException(503, { message: 'interviewProviderUnavailable' })
    }
    if (body.command.type === 'START_INTERVIEW' && !mockEnabled) throw new HTTPException(503, { message: 'interviewProviderUnavailable' })
    const result = await service.execute(p, body.interviewId, body.expectedVersion, body.command)
    return c.json({ duplicate: result.duplicate, state: service.candidateState(result.row) })
  })
  for (const action of ['submit', 'status'] as const) candidate.post(`/answers/${action}`, rateLimit({ name: `ai-interview-answer-${action}`, limit: 120, windowMs: 60_000,
    keyExtra: c => getCookie(c, CANDIDATE_COOKIE)?.split('.')[0] ?? null }), async c => {
    const p = principal(credential(c)), body = await jsonBody(c)
    if (action === 'submit' && !mockEnabled) {
      const id = z.object({ interviewId: uuid }).passthrough().parse(body).interviewId
      await service.load(p, id)
      throw new HTTPException(503, { message: 'interviewProviderUnavailable' })
    }
    return c.json(action === 'submit' ? await service.submitAnswer(p, body) : await service.answerStatus(p, body))
  })
  candidate.get('/events', async c => {
    const cookie = credential(c), p = principal(cookie)
    const after = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(c.req.query('afterSequence') ?? '0')
    return c.json(await service.getEventsPage(p, requestId(c.req.query('interviewId'), cookie), after))
  })
  for (const action of ['begin', 'status', 'cancel'] as const) candidate.post(`/audio/${action}`, rateLimit({name: `candidate-audio-${action}`, limit: action === 'status' ? 60 : 20, windowMs: 60000,
    keyExtra: c => credential(c)?.split('.')[0] ?? null}), async c => {
    const p = principal(credential(c)), body = await jsonBody(c)
    const id = z.object({interviewId: uuid}).passthrough().parse(body).interviewId
    await service.load(p, id)
    if (!options.audio) throw new HTTPException(503, {message: 'audioUnavailable'})
    return c.json(await (action === 'begin' ? options.audio.begin(p, body) : action === 'status' ? options.audio.status(p, body) : options.audio.cancel(p, candidateAudioStatusSchema.parse(body))))
  })
  candidate.post('/audio/upload', rateLimit({name: 'candidate-audio-upload', limit: 6, windowMs: 60000, keyExtra: c => credential(c)?.split('.')[0] ?? null}), async c => {
    const p = principal(credential(c)), pairs = [...new URL(c.req.url).searchParams]
    if (pairs.length !== 3 || new Set(pairs.map(([key]) => key)).size !== 3) throw new HTTPException(422, {message: 'audioScopeInvalid'})
    const body = candidateAudioUploadSchema.parse(Object.fromEntries(pairs))
    await service.load(p, body.interviewId)
    if (!options.audio) throw new HTTPException(503, {message: 'audioUnavailable'})
    return c.json(await options.audio.receive(p, body, c.req.raw))
  })
  if (mockEnabled) candidate.post('/dev/mock', rateLimit({ name: 'ai-interview-dev-mock', limit: 120, windowMs: 60_000 }), async c => {
    const p = principal(credential(c))
    const result = await service.executeMock(p, await jsonBody(c))
    return c.json({ duplicate: result.duplicate, state: service.candidateState(result.row) })
  })
  return { candidate, staff, delivery, audio: options.audio }
}
