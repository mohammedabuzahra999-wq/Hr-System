/** Local, synthetic browser fixture. Never imports the retained production .env. */
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { is, eq } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import pg from 'pg'
import net from 'node:net'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import * as schema from '../db/schema.js'

const connection = process.env.AI_INTERVIEW_TEST_DATABASE_URL
if (!connection) throw new Error('AI_INTERVIEW_TEST_DATABASE_URL must name a LOCAL test PostgreSQL server')
const url = new URL(connection)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Browser fixture refuses a remote database')
let externalAttempts = 0
const denyNetwork = () => { externalAttempts++; throw new Error('External network forbidden in UI fixture') }
globalThis.fetch = denyNetwork
const socketConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function(this: net.Socket, ...args: unknown[]) {
  const a = Array.isArray(args[0]) ? args[0] as unknown[] : args
  const o = typeof a[0] === 'object' ? a[0] as { host?: string; port?: number } : { port: a[0], host: a[1] }
  if (!['localhost', '127.0.0.1', '::1'].includes(String(o?.host)) || Number(o?.port) !== Number(url.port || 5432)) return denyNetwork()
  return Reflect.apply(socketConnect, this, args)
} as typeof socketConnect
const databaseName = `ai_interview_phase3_${randomUUID().replaceAll('-', '')}`
const admin = new pg.Pool({ connectionString: connection })
await admin.query(`CREATE DATABASE "${databaseName}"`)
url.pathname = `/${databaseName}`
process.env.DATABASE_URL = url.toString()
process.env.SESSION_SECRET = 'phase3-synthetic-local-browser-fixture-secret'
process.env.NODE_ENV = 'development'
process.env.WEB_ORIGIN = process.env.PHASE3_WEB_ORIGIN ?? 'http://localhost:5179'
process.env.VOICE_PROVIDER = 'openai'
process.env.VOICE_ENABLED = 'false'
process.env.VOICE_SHARE_AUDIO = 'false'
process.env.AI_SHARE_DATA = 'false'
process.env.AI_INTERVIEW_DEV_MOCK = 'true'
for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[key]
const pool = new pg.Pool({ connectionString: url.toString(), max: 6 })
const database = drizzle(pool, { schema })
for (const table of Object.values(schema)) {
  if (!is(table, PgTable)) continue
  const config = getTableConfig(table)
  if (config.name.startsWith('ai_interview')) continue
  const columns = config.columns.map(column => {
    let type = column.getSQLType()
    if (!/^(uuid|text|integer|boolean|date|timestamp|numeric|jsonb|varchar|double precision|real|bigint|smallint)/.test(type)) type = 'text'
    const value = column.primary && type === 'uuid' ? ' DEFAULT gen_random_uuid()'
      : type.startsWith('timestamp') ? ' DEFAULT now()' : type === 'date' ? ' DEFAULT CURRENT_DATE'
        : type === 'boolean' ? ' DEFAULT false' : type === 'integer' ? ' DEFAULT 0' : type === 'text' ? " DEFAULT ''" : ''
    return `"${column.name}" ${type}${value}${column.primary ? ' PRIMARY KEY' : ''}`
  })
  await pool.query(`CREATE TABLE "${config.name}" (${columns.join(',')})`)
}
await pool.query(readFileSync(new URL('../../drizzle/0026_ai_interviewer.sql', import.meta.url), 'utf8'))
const { hashPassword } = await import('../auth/password.js')
const password = 'Synthetic-Demo-3!'
const roles = ['hr', 'admin', 'manager', 'employee'] as const
for (const role of roles) await database.insert(schema.users).values({ id: randomUUID(), email: `${role}.interview@example.invalid`,
  employeeNumber: `DEMO-${role}`, fullNameEn: `${role.toUpperCase()} Demo`, fullNameAr: 'حساب تجريبي', role, isActive: true,
  passwordHash: await hashPassword(password), jobTitleEn: 'Demo', jobTitleAr: 'تجريبي', departmentEn: 'People', departmentAr: 'الموارد البشرية' })
const openingId = randomUUID(), candidateId = randomUUID(), applicationId = randomUUID()
await database.insert(schema.jobOpenings).values({ id: openingId, titleEn: 'AI Engineer · Mock Interview', titleAr: 'مهندس ذكاء اصطناعي · مقابلة تجريبية',
  departmentEn: 'Engineering', departmentAr: 'الهندسة', status: 'open', openedOn: '2026-11-01', locationEn: 'Amman', locationAr: 'عمّان' })
await database.insert(schema.candidates).values({ id: candidateId, fullName: 'Demo Candidate', email: 'candidate.interview@example.invalid',
  notes: 'INTERNAL_HR_NOTE_DO_NOT_EXPOSE', skills: 'RAG, Problem solving' })
await database.insert(schema.applications).values({ id: applicationId, candidateId, openingId, status: 'new', source: 'manual' })
const L = (en: string, ar = en) => ({ en, ar }), list = (en: string[]) => ({ en, ar: en })
await database.insert(schema.jobDescriptions).values({ id: randomUUID(), openingId, status: 'approved', titleEn: 'AI Engineer', titleAr: 'مهندس ذكاء اصطناعي',
  approvedAt: new Date(), content: { title: L('AI Engineer'), summary: L('Build reliable AI products'), responsibilities: list([]), requiredQualifications: list([]),
    requiredSkills: list(['RAG', 'problem-solving', 'systems']), preferredSkills: list([]), softSkills: list([]), experience: L(''), education: L(''), workingConditions: null },
  scorecard: { weights: [{ key: 'RAG', weight: 50 }, { key: 'problem-solving', weight: 30 }, { key: 'systems', weight: 20 }] } })

const { InterviewService } = await import('./service.js')
const { InterviewRepository } = await import('./repository.js')
const { createInterviewRoutes } = await import('./routes.js')
const { startInterviewMaintenance } = await import('./runtime.js')
const { authRoutes } = await import('../routes/auth.js')
const { recruitmentRoutes } = await import('../routes/recruitment.js')
const { jobDescriptionRoutes } = await import('../routes/jobDescriptions.js')
const { cvRoutes } = await import('../routes/cv.js')
const { feedRoutes } = await import('../routes/feed.js')
const { streamRoutes } = await import('../routes/stream.js')
const { voiceRoutes } = await import('../routes/voice.js')
const { closeDb } = await import('../db/client.js')
let clockOffset = 0
const service = new InterviewService(new InterviewRepository(database), { now: () => Date.now() + clockOffset }, randomUUID(),{enabled:process.env.LLM_BROWSER_TESTS==='true',maxAttempts:2})
const { InterviewReportService } = await import('./reportService.js')
const { MockReportEvaluator } = await import('./report.js')
let reportScenario = 'normal'
const reportEvaluator = new MockReportEvaluator()
const {createRegisteredEvaluationProvider}=await import('./evaluationProviders.js'),{syntheticEvaluationConfig}=await import('./evaluationTestSupport.js')
const syntheticReportEvaluator=createRegisteredEvaluationProvider(syntheticEvaluationConfig())
const reports = new InterviewReportService(service, {providerSnapshot:process.env.EVALUATION_BROWSER_TESTS==='true'?syntheticReportEvaluator.providerSnapshot:undefined,async evaluateReport(input, identity,context) {
  if (reportScenario === 'failure') throw new Error('Synthetic evaluation failure')
  const result = input.evaluatorVersion==='llm-report-v1'?await syntheticReportEvaluator.evaluateReport(input,identity,context) as import('@hr/shared').AiInterviewReport:reportEvaluator.evaluateReport(input, identity)
  if (reportScenario === 'invalid') result.criteriaResults.flatMap(c=>c.evidence)[0]!.quote = 'I deployed Kubernetes at scale.'
  return result
} })
const browserOrigins = [process.env.WEB_ORIGIN!, 'http://localhost:5180']
const {CandidateAudioTransport} = await import('./audioTransport.js')
let audioScenario = 'normal', audioSttCalls = 0
const audioPending: Array<(value: {text: string; uncertain: boolean}) => void> = []
const audioTranscript = {text: 'I measured recall@5 on labeled queries and reviewed incorrect retrievals.', uncertain: false}
const audioTransport = process.env.CANDIDATE_AUDIO_BROWSER_TESTS === 'true' ? new CandidateAudioTransport(service, {async transcribe() {
  audioSttCalls++
  if (audioScenario === 'error') throw Error('Synthetic STT failure')
  if (['timeout', 'hold'].includes(audioScenario)) return new Promise<{text: string; uncertain: boolean}>(resolve => audioPending.push(resolve))
  return audioTranscript
}}) : undefined
const {CandidateTtsDelivery}=await import('./playbackTransport.js')
let ttsScenario='normal',ttsCalls=0
function ttsWav(ms=900){const bytes=Buffer.alloc(44+ms*32);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);for(let i=0;i<ms*16;i++)bytes.writeInt16LE(Math.round(Math.sin(i/16000*440*Math.PI*2)*1500),44+i*2);return bytes}
const ttsPending:Array<(value:{bytes:Uint8Array;mimeType:'audio/wav'})=>void>=[]
const playbackTransport=process.env.TTS_PLAYBACK_BROWSER_TESTS==='true'?new CandidateTtsDelivery(service,{async synthesize(){ttsCalls++;if(ttsScenario==='error')throw Error('Synthetic TTS error');if(['hold','timeout'].includes(ttsScenario))return new Promise(resolve=>ttsPending.push(resolve));return {bytes:ttsWav(ttsScenario==='long'?10000:900),mimeType:'audio/wav'}}}):undefined
const {InterviewLlmOrchestrator}=await import('./llmOrchestrator.js')
const {createInterviewLlmProvider}=await import('./llmProviders.js'),{parseInterviewLlmConfiguration}=await import('./llmConfiguration.js')
const syntheticModel=createInterviewLlmProvider(parseInterviewLlmConfiguration({AI_INTERVIEW_LLM_ENABLED:'true',AI_INTERVIEW_LLM_PROVIDER:'synthetic'}))
let modelScenario='normal',modelCalls=0
const modelPending:Array<{resolve:(value:unknown)=>void;input:Parameters<typeof syntheticModel.generate>[0]}>=[]
const modelRunner=process.env.LLM_BROWSER_TESTS==='true'?new InterviewLlmOrchestrator(service,{async generate(input,signal){modelCalls++;if(modelScenario==='hold')return new Promise(resolve=>modelPending.push({resolve,input}));if(modelScenario==='invalid')return {decision:{type:'CANCEL_INTERVIEW'},permissions:['admin']};if(modelScenario==='next')return {decision:{type:'NEXT_QUESTION'}};if(modelScenario==='clarification')return {decision:input.choices.find(c=>c.type==='CLARIFICATION')};return syntheticModel.generate(input,signal)}}):undefined
modelRunner?.start()
const routes = createInterviewRoutes(service, { origins: browserOrigins, secure: false, production: false, developmentMock: true, reports, audio: audioTransport, playback:playbackTransport,model:modelRunner })
// A production policy probe, not exposed by the application entry point.
const production = createInterviewRoutes(service, { origins: browserOrigins, secure: true, production: true, developmentMock: true })
const app = new Hono()
app.route('/api/auth', authRoutes)
app.route('/api/recruitment', recruitmentRoutes)
app.route('/api/recruitment', routes.staff)
app.route('/api/ai-interview/production', production.candidate)
app.route('/api/ai-interview', routes.candidate)
app.route('/api/job-descriptions', jobDescriptionRoutes)
app.route('/api/cv', cvRoutes)
app.route('/api/feed', feedRoutes)
app.route('/api/stream', streamRoutes)
app.route('/api/voice', voiceRoutes)
app.get('/health', c => c.json({ ok: true }))
app.onError((error, c) => {
  if ('status' in error && typeof error.status === 'number' && [400,401,403,404,409,410,422,429].includes(error.status)) return c.json({ error: error.message }, error.status as 401)
  console.error('[fixture] request failed', error.message)
  return c.json({ error: 'fixtureRequestFailed' }, 500)
})
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 8793 })
try {
  await new Promise<void>((resolve, reject) => { server.once('listening', () => resolve()); server.once('error', reject) })
} catch (error) {
  await closeDb(); await pool.end(); await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); await admin.end()
  throw error
}
const stopMaintenance = startInterviewMaintenance(service, reports)
const info = { api: 'http://127.0.0.1:8793', web: process.env.WEB_ORIGIN, databaseName, applicationId,
  hrEmail: 'hr.interview@example.invalid', password, syntheticOnly: true }
const evidenceRoot = resolve('../../.local-dev/ai-interviewer-phase3')
mkdirSync(evidenceRoot, { recursive: true })
writeFileSync(resolve(evidenceRoot, 'fixture.json'), JSON.stringify(info, null, 2))
console.log(`PHASE3_READY ${JSON.stringify(info)}`)
let closing = false
async function shutdown() {
  if (closing) return
  closing = true;await modelRunner?.close();for(const pending of modelPending.splice(0))pending.resolve({decision:{type:'NEXT_QUESTION'}}); audioTransport?.close();await playbackTransport?.close();for(const finish of ttsPending.splice(0))finish({bytes:ttsWav(),mimeType:'audio/wav'}); for (const finish of audioPending.splice(0)) finish(audioTranscript); await stopMaintenance()
  if ('closeAllConnections' in server) server.closeAllConnections()
  server.close()
  await closeDb(); await pool.end()
  if (!/^ai_interview_phase3_[a-f0-9]{32}$/.test(databaseName)) throw new Error('Unsafe database cleanup target')
  await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); await admin.end()
}
// Test-only local process IPC, NOT an HTTP clock endpoint or frontend authority.
const input = createInterface({ input: process.stdin })
input.on('line', line => {
  void (async () => {
    const command = JSON.parse(line) as { id: string; op: 'advance' | 'stop' | 'seed-other' | 'stats' | 'report-scenario' | 'seed-report-case' | 'answer-state' | 'answer-failure' | 'audio-scenario' | 'audio-state' | 'tts-scenario' | 'tts-state' | 'model-scenario' | 'model-state'; ms?: number; scenario?: string; interviewId?: string; commandId?: string; enabled?: boolean }
    if(command.op==='model-scenario'){
      if(!modelRunner||!['normal','hold','invalid','next','clarification','release'].includes(command.scenario!))throw Error('Model test scenario unavailable')
      if(command.scenario==='release'){modelScenario='normal';for(const p of modelPending.splice(0))p.resolve(await syntheticModel.generate(p.input,new AbortController().signal))}else modelScenario=command.scenario!
      console.log(`PHASE3_REPLY ${JSON.stringify({id:command.id,ok:true})}`)
    }else if(command.op==='model-state'){
      if(!modelRunner||!/^[a-f0-9-]{36}$/.test(command.interviewId??''))throw Error('Model test scenario unavailable')
      const row=await service.load({kind:'system'},command.interviewId!),events=await database.select().from(schema.aiInterviewEvents).where(eq(schema.aiInterviewEvents.interviewId,row.id))
      console.log(`PHASE3_REPLY ${JSON.stringify({id:command.id,calls:modelCalls,answers:row.snapshot.answers.length,finalized:events.filter(e=>e.eventType==='CANDIDATE_ANSWER_FINALIZED').length,decisions:events.filter(e=>e.eventType==='ANSWER_EVALUATED').length,status:row.snapshot.status,phase:row.snapshot.phase})}`)
    }else if(command.op==='tts-scenario'){
      if(!playbackTransport||!['normal','long','hold','timeout','error','release'].includes(command.scenario!))throw Error('TTS test scenario unavailable')
      if(command.scenario==='release'){for(const finish of ttsPending.splice(0))finish({bytes:ttsWav(),mimeType:'audio/wav'});ttsScenario='normal'}else ttsScenario=command.scenario!
      console.log(`PHASE3_REPLY ${JSON.stringify({id:command.id,ok:true})}`)
    }else if(command.op==='tts-state'){
      if(!playbackTransport)throw Error('TTS test scenario unavailable')
      console.log(`PHASE3_REPLY ${JSON.stringify({id:command.id,calls:ttsCalls,cached:playbackTransport.cachedAudio,physical:playbackTransport.physicalCalls})}`)
    }else if (command.op === 'audio-scenario') {
      if (!audioTransport || !['normal','error','timeout','hold','release'].includes(command.scenario!)) throw Error('Audio test scenario unavailable')
      if (command.scenario === 'release') {for (const finish of audioPending.splice(0)) finish(audioTranscript); audioScenario = 'normal'} else audioScenario = command.scenario!
      console.log(`PHASE3_REPLY ${JSON.stringify({id: command.id, ok: true})}`)
    } else if (command.op === 'audio-state') {
      if (!audioTransport || !/^[a-f0-9-]{36}$/.test(command.interviewId ?? '')) throw Error('Audio test scenario unavailable')
      const current = await service.load({kind: 'system'}, command.interviewId!), events = await database.select().from(schema.aiInterviewEvents).where(eq(schema.aiInterviewEvents.interviewId, command.interviewId!))
      console.log(`PHASE3_REPLY ${JSON.stringify({id: command.id, answers: current.snapshot.answers.length, finalized: events.filter(e => e.eventType === 'CANDIDATE_ANSWER_FINALIZED').length,
        commits: events.filter(e => e.recordType === 'COMMAND' && e.commandId?.startsWith('audio:') && e.commandId.endsWith(':commit')).length,
        captures: events.filter(e => e.recordType === 'COMMAND' && e.commandId?.startsWith('audio:') && e.commandId.endsWith(':begin')).length, sttCalls: audioSttCalls, phase: current.snapshot.phase,
        rawAudioPersisted: JSON.stringify(events.map(e => e.payload)).includes('RIFF')})}`)
    } else if (command.op === 'advance') {
      if (!Number.isSafeInteger(command.ms) || command.ms! < 0 || command.ms! > 172_800_000) throw new Error('Invalid test clock step')
      clockOffset += command.ms!
      console.log(`PHASE3_REPLY ${JSON.stringify({ id: command.id, ok: true, serverNow: service.clock.now() })}`)
    } else if (command.op === 'seed-other') {
      const participant = randomUUID(), application = randomUUID()
      await database.insert(schema.candidates).values({ id: participant, fullName: 'Other Demo Candidate', email: `${participant}@example.invalid` })
      await database.insert(schema.applications).values({ id: application, candidateId: participant, openingId, status: 'new', source: 'manual' })
      console.log(`PHASE3_REPLY ${JSON.stringify({ id: command.id, applicationId: application })}`)
    } else if (command.op === 'report-scenario') {
        if ((process.env.PHASE4_REPORT_TESTS !== 'true'&&process.env.EVALUATION_BROWSER_TESTS!=='true') || !['normal','failure','invalid'].includes(command.scenario!)) throw Error('Test scenario unavailable')
      reportScenario=command.scenario!; console.log(`PHASE3_REPLY ${JSON.stringify({id:command.id,ok:true})}`)
    } else if (command.op === 'seed-report-case') {
      if(process.env.PHASE4_REPORT_TESTS!=='true')throw Error('Test scenario unavailable')
      const { phase1Plan }=await import('./fixtures.js')
      const { aiInterviewDimensionSchema }=await import('@hr/shared')
      const participant=randomUUID(),application=randomUUID()
      await database.insert(schema.candidates).values({id:participant,fullName:'Unicode Evidence Candidate',email:`${participant}@example.invalid`})
      await database.insert(schema.applications).values({id:application,candidateId:participant,openingId,status:'new',source:'manual'})
      const staff=(await database.select().from(schema.users)).find(u=>u.role==='hr')!,actor={kind:'staff' as const,userId:staff.id}
      const plan=structuredClone(phase1Plan);plan.language='mixed';plan.questions=plan.questions.map((q,i)=>({...q,criterionKey:i===0?'RAG':'problem-solving',maxFollowUps:0,maxClarifications:0,followUps:[],clarifications:[]}))
      const created=await service.create(actor,application,{commandId:randomUUID(),plan,rubric:{version:'unicode-mock-v1',dimensions:aiInterviewDimensionSchema.options.map(dimension=>({dimension,anchors:['Absent','Basic','Partial','Applied','Explained trade-offs']}))}})
      const load=()=>service.load({kind:'system'},created.interviewId)
      const send=async(command: Record<string,unknown>,principal:Parameters<typeof service.execute>[0]={kind:'system'})=>service.execute(principal,created.interviewId,(await load()).version,{...command,commandId:randomUUID()} as Parameters<typeof service.execute>[3])
      await service.ready(actor,created.interviewId,{commandId:randomUUID(),expectedVersion:(await load()).version})
      const invite=await service.invite(actor,created.interviewId,{commandId:randomUUID(),expectedVersion:(await load()).version})
      const joined=await service.exchange(invite.token!),candidate={kind:'candidate' as const,credential:joined.credential}
      await send({type:'ACCEPT_CONSENT',policyVersion:'ai-interview-v1'},candidate);await send({type:'START_INTERVIEW'},candidate)
      while((await load()).snapshot.status!=='COMPLETED'){
        const current=await load(),playback=current.snapshot.playback
        if(playback){await send({type:'AI_PLAYBACK_STARTED',playbackId:playback.id});await send({type:'AI_PLAYBACK_FINISHED',playbackId:playback.id})}
        else if(current.snapshot.phase==='LISTENING'){
          const turnId=current.snapshot.draft!.turnId,text=current.snapshot.currentQuestion!.baseQuestionId===plan.questions[0]!.id?'نفذت hybrid retrieval وقست recall@5 على أسئلة معلّمة.':'I checked some results.'
          await send({type:'CANDIDATE_SPEECH_STARTED',turnId},candidate);await send({type:'CANDIDATE_TRANSCRIPT_FINAL',turnId,text,uncertain:false},candidate);await send({type:'CANDIDATE_SPEECH_FINISHED',turnId},candidate)
        }else if(current.snapshot.phase==='PROCESSING')await send({type:'PROCESS_ANSWER'})
        else throw Error('Unexpected test interview phase')
      }
      console.log(`PHASE3_REPLY ${JSON.stringify({id:command.id,applicationId:application,interviewId:created.interviewId})}`)
    } else if (command.op === 'answer-state' || command.op === 'answer-failure') {
      if (process.env.PHASE52_ANSWER_TESTS !== 'true' || !/^[a-f0-9-]{36}$/.test(command.interviewId ?? '')) throw Error('Answer test scenario unavailable')
      if (command.op === 'answer-failure') {
        await pool.query('DROP TRIGGER IF EXISTS phase52_browser_fail ON ai_interview_events')
        await pool.query('DROP FUNCTION IF EXISTS phase52_browser_fail()')
        if (command.enabled) {
          await pool.query(`CREATE FUNCTION phase52_browser_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.interview_id::text='${command.interviewId}' AND NEW.record_type='COMMAND' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$`)
          await pool.query('CREATE TRIGGER phase52_browser_fail BEFORE INSERT ON ai_interview_events FOR EACH ROW EXECUTE FUNCTION phase52_browser_fail()')
        }
        console.log(`PHASE3_REPLY ${JSON.stringify({ id: command.id, ok: true })}`)
      } else {
        const current = await service.load({kind:'system'},command.interviewId!)
        const events = await database.select().from(schema.aiInterviewEvents).where(eq(schema.aiInterviewEvents.interviewId,command.interviewId!))
        console.log(`PHASE3_REPLY ${JSON.stringify({ id: command.id, version: current.version, status: current.snapshot.status, phase: current.snapshot.phase,
          answerCount: current.snapshot.answers.length, finalizedEvents: events.filter(e=>e.eventType==='CANDIDATE_ANSWER_FINALIZED').length,
          receiptCount: command.commandId ? events.filter(e=>e.recordType==='COMMAND' && e.commandId===command.commandId).length : 0,
          pendingEffects: current.pendingEffects.length, answerDeadlineAt: current.snapshot.timer?.answerDeadlineAt ?? null })}`)
      }
    } else if (command.op === 'stats') {
      console.log(`PHASE3_REPLY ${JSON.stringify({ id: command.id, externalAttempts })}`)
    } else if (command.op === 'stop') {
      await shutdown(); console.log(`PHASE3_REPLY ${JSON.stringify({ id: command.id, ok: true })}`); process.exit(0)
    }
  })().catch(error => console.error('[fixture] control failed', error.message))
})
process.on('SIGINT', () => { void shutdown().finally(() => process.exit(0)) })
process.on('SIGTERM', () => { void shutdown().finally(() => process.exit(0)) })
