import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export async function runAnswerBrowserChecks({hr,browser,ready,interviewId,check,control}) {
  const saved=(await hr.api(`/api/recruitment/applications/${ready.applicationId}/ai-interviews/${interviewId}`)).body
  const key='ai-interview:answer:v1'
  const matrix=[]
  const phase=p=>p.evaluate(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase`)
  async function close(f) {
    const {targetInfo}=await f.p.send('Target.getTargetInfo')
    await browser.send('Target.disposeBrowserContext',{browserContextId:targetInfo.browserContextId})
  }
  async function record(label,f,p=f.p,commandId) {
    const stored=await p.evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(key)}) || 'null')`)
    const db=await control('answer-state',{interviewId:f.id,commandId:commandId??stored?.submission?.commandId})
    const {id:_ipc,...database}=db
    matrix.push({scenario:label,browserState:await phase(p),recoveryCopyPresent:!!stored,recoveryTextLength:stored?.text.length??0,
      database,candidateUx:await phase(p)==='COMMITTED'?'Server-confirmed committed answer':await phase(p)==='DRAFT'?'Local draft only':'Submission confirmation/recovery required'})
    writeFileSync(resolve(process.env.PHASE52_OUTPUT,'answer-browser-matrix.json'),JSON.stringify({syntheticOnly:true,matrix},null,2)+'\n')
    return database
  }
  async function fresh(oneQuestion=false) {
    const seed=await control('seed-other'),base=`/api/recruitment/applications/${seed.applicationId}/ai-interviews`
    const plan=structuredClone(saved.snapshot.plan)
    for(const q of plan.questions){q.answerTimeLimitSec=1200;q.warningAtSec=0;q.silenceThresholdSec=0}
    if(oneQuestion)plan.questions=plan.questions.slice(0,1).map(q=>({...q,maxFollowUps:0,maxClarifications:0,followUps:[],clarifications:[],silenceAction:'NEXT_QUESTION'}))
    const created=await hr.api(base,{commandId:crypto.randomUUID(),plan,rubric:saved.frozenInputs.rubric});assert.equal(created.status,201)
    const id=created.body.interviewId
    const r=await hr.api(`${base}/${id}/ready`,{commandId:crypto.randomUUID(),expectedVersion:created.body.version});assert.equal(r.status,200)
    const invitation=await hr.api(`${base}/${id}/invitation`,{commandId:crypto.randomUUID(),expectedVersion:r.body.version});assert.equal(invitation.status,200)
    const p=await browser.page()
    await p.goto(`http://localhost:5179/interview/join?token=${encodeURIComponent(invitation.body.token)}`)
    await p.click('[data-testid="accept-consent"]');await p.click('[data-testid="confirm-language"]');await p.click('[data-testid="check-readiness"]');await p.click('[data-testid="start-interview"]')
    await p.wait(`document.querySelector('[data-testid="interview-status"]')?.dataset.phase==='LISTENING'`)
    return {p,id,base,read:async()=>{const response=await hr.api(`${base}/${id}`);assert.equal(response.status,200);return response.body}}
  }
  async function sameContextTab(p) {
    const {targetInfo}=await p.send('Target.getTargetInfo')
    const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId:targetInfo.browserContextId})
    const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true})
    const tab=new p.constructor(browser,sessionId)
    await tab.send('Page.enable');await tab.send('Runtime.enable');await tab.send('Network.enable');await tab.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]})
    await tab.send('Page.addScriptToEvaluateOnNewDocument',{source:"sessionStorage.setItem('hr-app:lang','en')"})
    browser.listeners.add(event=>{
      if(event.sessionId!==sessionId)return
      if(event.method==='Fetch.requestPaused')void tab.intercept(event.params)
      if(event.method==='Page.javascriptDialogOpening')void tab.send('Page.handleJavaScriptDialog',{accept:true})
    })
    await tab.goto('http://localhost:5179/interview/session')
    await tab.wait(`!document.querySelector('[data-testid="mock-answer"]')?.disabled && !!document.querySelector('[data-testid="mock-answer"]')`)
    return tab
  }
  let f
  await check('Phase 5.2: refresh before submit restores DRAFT and leaves zero durable answers',async()=>{
    f=await fresh();await f.p.fill('[data-testid="mock-answer"]','Synthetic draft survives a refresh.')
    assert.equal(await phase(f.p),'DRAFT');assert.equal((await f.read()).snapshot.answers.length,0)
    await f.p.goto('http://localhost:5179/interview/session')
    await f.p.wait(`document.querySelector('[data-testid="mock-answer"]')?.value==='Synthetic draft survives a refresh.'`)
    assert.equal(await phase(f.p),'DRAFT');assert.equal((await f.read()).snapshot.answers.length,0)
    assert(!(await f.p.evaluate(`document.querySelector('[data-testid="answer-recovery"]').innerText`)).includes('received and saved'))
    await record('refresh before submit',f)
  })
  await check('Phase 5.2: disconnect before request shows recovery and preserves frozen submission identity',async()=>{
    await f.p.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    await f.p.click('[data-testid="submit-answer"]')
    await f.p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='RECOVERY_REQUIRED'`)
    assert.equal((await f.read()).snapshot.answers.length,0)
    const envelope=await f.p.evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(key)}))`)
    assert(envelope.submission.commandId);f.identity=envelope.submission.commandId
    assert(!(await f.p.evaluate(`document.querySelector('[data-testid="answer-recovery"]').innerText`)).includes('received and saved'))
    await record('disconnect before request',f)
  })
  await check('Phase 5.2: reconnect plus refresh retries the identical envelope and confirms one commit',async()=>{
    await f.p.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    await f.p.goto('http://localhost:5179/interview/session')
    await f.p.wait(`!!document.querySelector('[data-testid="retry-answer"]')`)
    assert.equal(await f.p.evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(key)})).submission.commandId`),f.identity)
    await f.p.click('[data-testid="retry-answer"]')
    await f.p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='COMMITTED'`)
    assert.equal((await f.read()).snapshot.answers.length,1);assert.equal(await f.p.evaluate(`sessionStorage.getItem(${JSON.stringify(key)})`),null)
    await record('reconnect refresh and identical retry',f,f.p,f.identity)
    await close(f)
  })
  await check('Phase 5.2: refresh while request is in flight before commit preserves the exact pending identity',async()=>{
    const f=await fresh(),p=f.p,original=p.intercept.bind(p);let held
    p.intercept=async params=>{if(!held&&new URL(params.request.url).pathname.endsWith('/answers/submit')){held=params;return}return original(params)}
    await p.fill('[data-testid="mock-answer"]','Synthetic in-flight answer.')
    await p.click('[data-testid="submit-answer"]');await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='SUBMITTING'`)
    const body=JSON.parse(held.request.postData);await record('in-flight before commit',f,p,body.commandId)
    await p.goto('http://localhost:5179/interview/session');await p.wait(`!!document.querySelector('[data-testid="retry-answer"]')`)
    assert.equal(await p.evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(key)})).submission.commandId`),body.commandId)
    assert.equal((await f.read()).snapshot.answers.length,0);await record('refresh in-flight before commit',f,p,body.commandId)
    await p.click('[data-testid="retry-answer"]');await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='COMMITTED'`)
    assert.equal((await f.read()).snapshot.answers.length,1);await record('same in-flight identity committed on retry',f,p,body.commandId)
    await close(f)
  })
  await check('Phase 5.2: disconnect during an in-flight request preserves text and identity for reconnect',async()=>{
    const f=await fresh(),p=f.p,original=p.intercept.bind(p);let held
    p.intercept=async params=>{if(!held&&new URL(params.request.url).pathname.endsWith('/answers/submit')){held=params;return}return original(params)}
    await p.fill('[data-testid="mock-answer"]','Synthetic disconnect during request.')
    await p.click('[data-testid="submit-answer"]');await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='SUBMITTING'`)
    const body=JSON.parse(held.request.postData)
    await p.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    await p.send('Fetch.failRequest',{requestId:held.requestId,errorReason:'ConnectionClosed'})
    await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='RECOVERY_REQUIRED'`)
    assert.equal((await f.read()).snapshot.answers.length,0);await record('disconnect during request',f,p,body.commandId)
    await p.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    await p.goto('http://localhost:5179/interview/session');await p.wait(`!!document.querySelector('[data-testid="retry-answer"]')`)
    assert.equal(await p.evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(key)})).submission.commandId`),body.commandId)
    await p.click('[data-testid="retry-answer"]');await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='COMMITTED'`)
    const db=await record('reconnect after in-flight disconnect',f,p,body.commandId);assert.equal(db.answerCount,1);assert.equal(db.receiptCount,1);await close(f)
  })
  await check('Phase 5.2: refresh after server commit but before original ACK recovers without another submit',async()=>{
    const f=await fresh(),p=f.p,original=p.intercept.bind(p)
    let held
    p.intercept=async params=>{
      if(!held&&new URL(params.request.url).pathname.endsWith('/answers/submit')){held=params;return}
      return original(params)
    }
    await p.fill('[data-testid="mock-answer"]','Synthetic durable answer before acknowledgement.')
    await p.click('[data-testid="submit-answer"]')
    await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='SUBMITTING'`)
    assert(held)
    const body=JSON.parse(held.request.postData),response=await p.api('/api/ai-interview/answers/submit',body)
    assert.equal(response.status,200);assert.equal(response.body.outcome,'COMMITTED');assert.equal((await f.read()).snapshot.answers.length,1)
    await record('server committed, original ACK held',f,p,body.commandId)
    await p.goto('http://localhost:5179/interview/session')
    await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='COMMITTED'`)
    assert.equal((await f.read()).snapshot.answers.length,1);assert.equal(await p.evaluate(`sessionStorage.getItem(${JSON.stringify(key)})`),null)
    await record('refresh after commit before original ACK',f,p,body.commandId)
    await close(f)
  })
  let failed
  await check('Phase 5.2: real database rollback cannot produce saved UI, partial answer or advancement',async()=>{
    failed=await fresh();const p=failed.p,before=await failed.read()
    await control('answer-failure',{interviewId:failed.id,enabled:true})
    try {
      await p.fill('[data-testid="mock-answer"]','Synthetic rollback recovery.')
      await p.click('[data-testid="submit-answer"]');await p.wait(`!!document.querySelector('[data-testid="retry-answer"]')`)
      const r=await record('database rollback before commit',failed),after=await failed.read()
      assert.equal(r.answerCount,0);assert.equal(r.receiptCount,0);assert.equal(after.version,before.version);assert.deepEqual(after.snapshot,before.snapshot)
      assert.equal(await phase(p),'RECOVERY_REQUIRED');failed.identity=await p.evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(key)})).submission.commandId`)
    } finally {await control('answer-failure',{interviewId:failed.id,enabled:false})}
  })
  await check('Phase 5.2: retry after rollback commits the preserved identity once',async()=>{
    await failed.p.click('[data-testid="retry-answer"]');await failed.p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='COMMITTED'`)
    const r=await record('same-identity retry after database rollback',failed,failed.p,failed.identity);assert.equal(r.answerCount,1);assert.equal(r.receiptCount,1)
    await close(failed)
  })
  for(const conflict of [false,true])await check(`Phase 5.2: real two-tab ${conflict?'conflicting answers retain losing copy':'same answer different identities reconcile'} with one committed answer`,async()=>{
    console.log(`Phase 5.2 two-tab ${conflict?'conflicting':'identical'}: creating isolated room`)
    const f=await fresh(),p=f.p,q=await sameContextTab(p),holds=[]
    console.log(`Phase 5.2 two-tab ${conflict?'conflicting':'identical'}: both tabs ready`)
    for(const tab of [p,q]){
      const original=tab.intercept.bind(tab)
      tab.intercept=async params=>{if(new URL(params.request.url).pathname.endsWith('/answers/submit')){holds.push({tab,id:params.requestId,body:JSON.parse(params.request.postData)});return}return original(params)}
    }
    await p.fill('[data-testid="mock-answer"]','Synthetic answer from tab one.')
    await q.fill('[data-testid="mock-answer"]',conflict?'Different answer from tab two.':'Synthetic answer from tab one.')
    await Promise.all([p.click('[data-testid="submit-answer"]'),q.click('[data-testid="submit-answer"]')])
    console.log('Phase 5.2 two-tab after clicks',JSON.stringify({p:await phase(p),q:await phase(q),held:holds.length}))
    await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='SUBMITTING'`)
    await q.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='SUBMITTING'`)
    assert.equal(holds.length,2)
    console.log('Phase 5.2 two-tab: releasing both requests')
    await Promise.all(holds.map(h=>h.tab.send('Fetch.continueRequest',{requestId:h.id})))
    await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase!=='SUBMITTING'`)
    await q.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase!=='SUBMITTING'`)
    assert.equal((await f.read()).snapshot.answers.length,1)
    // RECOVERY_REQUIRED can briefly mean "checking" after 409. Require the final
    // server-confirmed message instead of asserting against that transient view.
    const settled = conflict
      ? `document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='COMMITTED' || document.querySelector('[data-testid="answer-recovery"]')?.innerText.includes('different answer')`
      : `document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='COMMITTED'`
    await Promise.all([p.wait(settled),q.wait(settled)])
    const phases=await Promise.all([phase(p),phase(q)])
    if(conflict){assert.deepEqual(phases.sort(),['COMMITTED','RECOVERY_REQUIRED']);const losing=(await phase(p))==='RECOVERY_REQUIRED'?p:q;assert(await losing.evaluate(`document.querySelector('[data-testid="recovery-answer"]').value.length>0`));assert((await losing.evaluate(`document.querySelector('[data-testid="answer-recovery"]').innerText`)).includes('different answer'))}
    else assert.deepEqual(phases,['COMMITTED','COMMITTED'])
    for(const h of holds)await record(conflict?'two-tab conflicting submission':'two-tab same answer different identity',f,h.tab,h.body.commandId)
    await close(f)
  })
  await check('Phase 5.2: storage failure is explicit and blocks sending an unrecoverable answer',async()=>{
    const f=await fresh(),p=f.p;let posts=0;const original=p.intercept.bind(p)
    p.intercept=async params=>{if(new URL(params.request.url).pathname.endsWith('/answers/submit'))posts++;return original(params)}
    await p.evaluate(`Storage.prototype.setItem=function(){throw Error('Synthetic storage unavailable')}`)
    await p.fill('[data-testid="mock-answer"]','Keep a copy of this synthetic draft.')
    await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.innerText.includes('only in memory')`)
    await p.click('[data-testid="submit-answer"]')
    assert.equal(posts,0);assert.equal((await f.read()).snapshot.answers.length,0);assert.equal(await phase(p),'DRAFT')
    await record('storage unavailable: no submission sent',f)
    await close(f)
  })
  await check('Phase 5.2: completion cannot claim an unsubmitted local answer was received',async()=>{
    const f=await fresh(true),p=f.p
    await p.fill('[data-testid="mock-answer"]','Synthetic local answer not sent before deadline.')
    await control('advance',{ms:1200001})
    await p.wait(`!!document.querySelector('[data-testid="interview-completion"]')`,30000)
    await p.wait(`document.querySelector('[data-testid="answer-recovery"]')?.dataset.answerPhase==='RECOVERY_REQUIRED'`)
    const text=await p.evaluate(`document.querySelector('[data-testid="interview-completion"]').innerText`)
    assert(text.includes('local answer still needs confirmation'));assert(!text.includes('answers have been received'))
    assert.equal(await p.evaluate(`document.querySelector('[data-testid="recovery-answer"]').value`),'Synthetic local answer not sent before deadline.')
    const db=await record('completion with unsubmitted local copy',f);assert.equal(db.receiptCount,0);assert.equal(db.status,'COMPLETED')
    const r=await f.read();assert.equal(r.snapshot.answers[0].text,'');await close(f)
  })
}
