import assert from 'node:assert/strict'

export async function runReportBrowserChecks({hr,candidate,browser,ready,interviewId,check,control}){
  const endpoint=`/api/recruitment/applications/${ready.applicationId}/ai-interviews/${interviewId}/evaluation`
  const url=`http://localhost:5179/hr/recruitment/applications/${ready.applicationId}/ai-interviews/${interviewId}/report`
  let firstReport,firstHash,firstTrace
  await check('Phase 4: completed browser interview retains PENDING evaluation until HR requests it',async()=>{
    const pending=await hr.api(endpoint);assert.equal(pending.body.interviewStatus,'COMPLETED');assert.equal(pending.body.evaluation.status,'PENDING')
    await hr.click('[data-testid="open-evaluation-report"]');await hr.wait(`document.querySelector('[data-testid="run-evaluation"]')`);await hr.screenshot('evaluation-pending')
  })
  await check('Phase 4: HR runs and renders persisted mock evaluation with coverage and criterion scores',async()=>{
    await hr.click('[data-testid="run-evaluation"]');await hr.wait(`document.querySelector('[data-testid="evaluation-status"]')?.dataset.status==='COMPLETED'`)
    await hr.wait(`document.querySelector('[data-testid="criterion-result"]')`)
    const v=(await hr.api(endpoint)).body;firstReport=v.evaluation.report;firstHash=v.evaluation.inputHash;firstTrace=v.trace
    assert(firstReport);assert.equal(firstReport.mode,'MOCK');assert.equal(firstReport.overallScore,null)
    assert((await hr.evaluate('document.body.innerText')).includes('Coverage is not a performance score.'));await hr.screenshot('evaluation-overview')
  })
  await check('Phase 4: untested criterion renders Not Assessed and dash, never zero',async()=>{
    assert(firstReport.criteriaResults.some(c=>c.status==='NOT_ASSESSED'&&c.score===null))
    assert.equal(await hr.evaluate(`document.querySelector('[data-assessment="NOT_ASSESSED"] [data-testid="criterion-score"]').textContent`),'—')
    await hr.evaluate(`document.querySelector('[data-assessment="NOT_ASSESSED"]').scrollIntoView({block:'center',behavior:'instant'})`);await hr.screenshot('not-assessed',true)
  })
  await check('Phase 4: evidence opens correct question and finalized answer with exact highlighted quote',async()=>{
    const e=firstReport.criteriaResults.flatMap(c=>c.evidence)[0];assert(e)
    await hr.click('[data-testid="report-evidence"]');await hr.wait(`document.querySelector('[data-testid="evidence-detail"] mark')`)
    assert.equal(await hr.evaluate(`document.querySelector('[data-testid="evidence-detail"] mark').textContent`),e.quote)
    assert((await hr.evaluate(`document.querySelector('[data-testid="evidence-detail"]').innerText`)).includes(e.turnId));await hr.screenshot('verified-evidence')
    await hr.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await hr.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await hr.wait(`!document.querySelector('dialog[open]')`)
  })
  await check('Phase 4: strengths, concerns, limitations, trace and mock label are visible',async()=>{
    const text=await hr.evaluate('document.body.innerText');for(const label of ['Strengths','Concerns','Limitations','Question / answer trace','SIMULATED / MOCK EVALUATION'])assert(text.includes(label))
    assert(!/\b(?:Hire|Reject|Accept|Pass|Fail) candidate\b/i.test(text));assert.equal(firstReport.aggregationRule,'NONE_APPROVED_FOR_0_4')
  })
  await check('Phase 4: human review and note persist after browser refresh',async()=>{
    await hr.click('[data-testid="reviewed-checkbox"]');await hr.fill('[data-testid="review-note"]','Reviewed the exact finalized evidence. Human decision remains separate.')
    await hr.click('[data-testid="save-review"]');await hr.wait(`document.querySelector('[data-testid="review-status"]')?.textContent.startsWith('REVIEWED')`)
    await hr.goto(url);await hr.wait(`document.querySelector('[data-testid="review-status"]')?.textContent.startsWith('REVIEWED')`)
    assert.equal(await hr.evaluate(`document.querySelector('[data-testid="review-note"]').value`),'Reviewed the exact finalized evidence. Human decision remains separate.')
    await hr.evaluate(`document.querySelector('[data-testid="human-review"]').scrollIntoView({block:'center',behavior:'instant'})`);await hr.screenshot('human-review-saved',true)
  })
  await check('Phase 4: intentional v2 preserves completed v1 and its human review',async()=>{
    await hr.click('[data-testid="reevaluate"]');await hr.wait(`document.querySelector('[data-testid="evaluation-status"]')?.dataset.status==='COMPLETED'&&document.querySelector('[aria-label="Report version"]').options.length===3`)
    const latest=(await hr.api(endpoint)).body;assert.equal(latest.evaluation.reportVersion,2);assert.notEqual(latest.evaluation.inputHash,firstHash)
    const old=(await hr.api(endpoint+'?reportVersion=1')).body;assert.deepEqual(old.evaluation.report,firstReport);assert.equal(old.evaluation.humanReview.status,'REVIEWED')
    await hr.fill('[aria-label="Report version"]','1');await hr.wait(`document.body.innerText.includes('mock-report-v1')&&document.querySelector('[data-testid="human-review"]')`)
    assert((await hr.evaluate('document.body.innerText')).includes('mock-report-v1'))
    await hr.fill('[aria-label="Report version"]','');await hr.wait(`document.querySelector('[data-testid="reevaluate"]')`)
  })
  await check('Phase 4: evaluator failure preserves COMPLETED interview and exposes safe retry',async()=>{
    await control('report-scenario',{scenario:'failure'});await hr.click('[data-testid="reevaluate"]')
    await hr.wait(`document.querySelector('[data-testid="retry-evaluation"]')`)
    const v=(await hr.api(endpoint)).body;assert.equal(v.interviewStatus,'COMPLETED');assert.equal(v.evaluation.status,'FAILED');assert.equal(v.evaluation.failureCode,'MOCK_EVALUATOR_FAILED');assert.deepEqual(v.trace,firstTrace)
    await hr.screenshot('evaluation-failed')
  })
  await check('Phase 4: retry uses same frozen hash and retains failed attempt',async()=>{
    const hash=(await hr.api(endpoint)).body.evaluation.inputHash;await control('report-scenario',{scenario:'normal'});await hr.click('[data-testid="retry-evaluation"]')
    await hr.wait(`document.querySelector('[data-testid="evaluation-status"]')?.dataset.status==='COMPLETED'`)
    const v=(await hr.api(endpoint)).body;assert.equal(v.evaluation.reportVersion,3);assert.equal(v.evaluation.inputHash,hash);assert.equal(v.evaluation.attempts[0].failureCode,'MOCK_EVALUATOR_FAILED');assert.equal(v.evaluation.attempts.length,2)
  })
  await check('Phase 4: invented Kubernetes quote is rejected and never rendered as trusted evidence',async()=>{
    await control('report-scenario',{scenario:'invalid'});await hr.click('[data-testid="reevaluate"]');await hr.wait(`document.querySelector('[data-testid="retry-evaluation"]')`)
    const v=(await hr.api(endpoint)).body;assert.equal(v.evaluation.failureCode,'EVIDENCE_VALIDATION_FAILED');assert.equal(v.evaluation.report,null)
    assert.equal(await hr.evaluate(`!!document.querySelector('[data-testid="report-evidence"]')`),false)
    const text=await hr.evaluate('document.body.innerText');assert(!text.includes('I deployed Kubernetes at scale.'));assert(text.includes('Evidence validation rejected'))
    await hr.screenshot('invalid-evidence-rejected')
    await control('report-scenario',{scenario:'normal'});await hr.click('[data-testid="retry-evaluation"]');await hr.wait(`document.querySelector('[data-testid="evaluation-status"]')?.dataset.status==='COMPLETED'`)
  })
  await check('Phase 4: candidate report, evidence and review access denied, candidate DTO stays private',async()=>{
    assert.equal((await candidate.api(endpoint)).status,401)
    assert.equal((await candidate.api(endpoint+'/1/review',{commandId:crypto.randomUUID(),expectedVersion:0,status:'REVIEWED',note:''})).status,401)
    const dto=await candidate.state();const text=JSON.stringify(dto);for(const key of ['criteriaResults','inputHash','strengths','concerns','humanReview','weights','rubric'])assert(!text.includes(`"${key}"`))
    assert.equal((await candidate.api('/api/ai-interview/evaluation')).status,404)
  })
  await check('Phase 4: manager and employee cannot fetch detailed reports',async()=>{
    for(const role of ['manager','employee']){
      const p=await browser.page();await p.goto('http://localhost:5179/login');await p.wait(`document.querySelector('input[type="email"]')`)
      await p.fill('input[type="email"]',`${role}.interview@example.invalid`);await p.fill('input[type="password"]',ready.password);await p.click('button[type="submit"]');await p.wait(`!['/login','/'].includes(location.pathname)`)
      assert.equal((await p.api(endpoint)).status,403)
    }
  })
  let unicodeEndpoint,unicodeUrl
  await check('Phase 4: strong mixed answer and weak fixture produce grounded findings plus coverage gap',async()=>{
    const seeded=await control('seed-report-case');unicodeEndpoint=`/api/recruitment/applications/${seeded.applicationId}/ai-interviews/${seeded.interviewId}/evaluation`;unicodeUrl=`http://localhost:5179/hr/recruitment/applications/${seeded.applicationId}/ai-interviews/${seeded.interviewId}/report`
    await hr.goto(unicodeUrl);await hr.wait(`document.querySelector('[data-testid="run-evaluation"]')`);await hr.click('[data-testid="run-evaluation"]');await hr.wait(`document.querySelector('[data-testid="criterion-result"]')`)
    const v=(await hr.api(unicodeEndpoint)).body;assert(v.evaluation.report.strengths.length);assert(v.evaluation.report.concerns.length);assert(v.evaluation.report.criteriaResults.some(c=>c.status==='NOT_ASSESSED'&&c.score===null));assert(v.evaluation.report.criteriaResults.some(c=>c.status==='PARTIALLY_ASSESSED'))
  })
  await check('Phase 4: Arabic/mixed evidence remains exact with RTL and mobile layout',async()=>{
    // Use the existing topbar locale control so React and persistence stay synchronized.
    await hr.evaluate(`sessionStorage.setItem('hr-app:lang','ar')`)
    await hr.send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('hr-app:lang','ar')`})
    await hr.goto(unicodeUrl);await hr.wait(`document.querySelector('[data-testid="evaluation-page"]')?.getAttribute('dir')==='rtl'&&document.querySelector('[data-testid="report-evidence"]')`)
    assert.equal(await hr.evaluate(`document.querySelector('[data-testid="report-coverage"] bdi').getAttribute('dir')`),'ltr')
    assert.equal(await hr.evaluate(`document.querySelector('[data-testid="report-coverage"] bdi').textContent`),'2 / 3')
    assert.equal(await hr.evaluate(`document.querySelector('[data-testid="criterion-score"]').getAttribute('dir')`),'ltr')
    await hr.click('[data-testid="report-evidence"]');await hr.wait(`document.querySelector('[data-testid="evidence-detail"] mark')`)
    assert.equal(await hr.evaluate(`document.querySelector('[data-testid="evidence-detail"] mark').textContent`),'نفذت hybrid retrieval وقست recall@5 على أسئلة معلّمة.')
    await hr.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    assert.equal(await hr.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await hr.screenshot('arabic-mixed-evidence-mobile')
    await hr.send('Emulation.clearDeviceMetricsOverride')
  })
}
