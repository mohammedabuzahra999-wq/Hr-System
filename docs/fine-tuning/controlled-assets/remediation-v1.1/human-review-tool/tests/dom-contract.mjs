// Read-only client-script contract test. A tiny DOM double is NOT a browser/rendering test.
// The real workspace receives GET requests only. No profile or criterion decisions are submitted.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {HERE} from '../repository.mjs'
const nodes=new Map(),memory=new Map(),events=new Map(),results=[]
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners=new Map();this.dataset={};this.value='';this.hidden=false;this.disabled=false;this.required=false;this.checked=false;this._text=''}
 set id(v){this._id=v;nodes.set(v,this)}get id(){return this._id}
 set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text+this.children.map(c=>c.textContent??String(c)).join('')}
 append(...children){this.children.push(...children)}replaceChildren(...children){this._text='';this.children=children}
 get options(){return this.children.filter(c=>c.tagName==='option')}
 setAttribute(k,v){this[k]=v}addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn)}reportValidity(){return true}
 async dispatch(k){for(const fn of this.listeners.get(k)??[])await fn({preventDefault(){}})}
}
const html=fs.readFileSync(path.join(HERE,'public/index.html'),'utf8')
for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const e=new Element(m[1]);e.id=m[3];e.disabled=/\bdisabled\b/.test(m[2]);e.hidden=/\bhidden\b/.test(m[2]);e.value=m[2].match(/\bvalue="([^"]*)"/)?.[1]??'';if(m[1]==='select'){const content=html.slice(m.index+m[0].length).split('</select>')[0];for(const o of content.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)){const option=new Element('option');option.value=o[1];option.textContent=o[2];e.append(option)}}}
let reads=0
const context=vm.createContext({document:{getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag)},window:{confirm:()=>{throw Error('UNEXPECTED_DIRTY_PROMPT')},addEventListener:(k,fn)=>events.set(k,fn)},localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},fetch:async(url,options={})=>{if(!String(url).startsWith('/api/')||(options.method??'GET')!=='GET')throw Error('DOM_TEST_WRITES_OR_EXTERNAL_REQUESTS_DENIED');reads++;return fetch('http://127.0.0.1:5194'+url,{method:'GET'})},console,setTimeout,clearTimeout})
vm.runInContext(fs.readFileSync(path.join(HERE,'public/app.js'),'utf8'),context,{filename:'actual-review-client.js',timeout:5000})
async function waitFor(fn){const deadline=performance.now()+5000;while(!fn()){if(performance.now()>deadline)throw Error('CLIENT_CONTRACT_TIMEOUT');await new Promise(r=>setTimeout(r,10))}}
const check=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',safeCode:e.code??'CONTRACT_ASSERTION_FAILED'});throw e}}
try{
 await waitFor(()=>nodes.get('record-number').textContent.includes('Record 1 / 480'))
 await check('actual-client-loads-full-480-index',()=>{assert.ok(nodes.get('filter-count').textContent.includes('480 matching records'));assert.equal(nodes.get('runtime-progress').textContent,'0 / 320 reviewed');assert.equal(nodes.get('selection-progress').textContent,'0 / 160 reviewed')})
 await check('all-15-decisions-start-blank-and-profile-is-required',()=>{for(const[id,e]of nodes)if(id.startsWith('choice-'))assert.equal(e.value,'');assert.equal([...nodes.keys()].filter(k=>k.startsWith('choice-')).length,15);assert.equal(nodes.get('decision-fields').disabled,true);assert.equal(nodes.get('save').disabled,true);assert.equal(nodes.get('human-independent').checked,false)})
 await check('English-input-direction-is-LTR',()=>assert.equal(nodes.get('input-text').dir,'ltr'))
 await check('Arabic-filter-and-RTL-direction',async()=>{nodes.get('language-filter').value='ar-JO';await nodes.get('language-filter').dispatch('change');assert.ok(nodes.get('filter-count').textContent.includes('120 matching records'));assert.equal(nodes.get('input-text').dir,'rtl')})
 await check('asset-language-role-filter-intersection',async()=>{nodes.get('asset-filter').value='selection';await nodes.get('asset-filter').dispatch('change');nodes.get('role-filter').value='admin';await nodes.get('role-filter').dispatch('change');assert.ok(nodes.get('filter-count').textContent.includes('10 matching records'))})
 await check('global-jump-reaches-record-480-and-clears-filters',async()=>{nodes.get('jump').value='480';await nodes.get('jump-form').dispatch('submit');assert.equal(nodes.get('record-number').textContent,'Record 480 / 480');assert.equal(nodes.get('asset-filter').value,'');assert.equal(nodes.get('role-filter').value,'');assert.equal(nodes.get('language-filter').value,'');assert.equal(nodes.get('input-text').dir,'auto')})
 await check('previous-navigation-uses-real-record-index',async()=>{await nodes.get('previous').dispatch('click');assert.equal(nodes.get('record-number').textContent,'Record 479 / 480')})
 await check('no-phantom-reviewed-rows-in-status-filter',async()=>{nodes.get('status-filter').value='reviewed_pass';await nodes.get('status-filter').dispatch('change');assert.equal(nodes.get('workspace').hidden,true);assert.ok(nodes.get('filter-count').textContent.includes('0 matching records'))})
 await check('all-record-details-render-as-text-not-HTML',()=>{assert.ok(nodes.get('metadata').textContent.includes('assetSha256'));assert.ok(nodes.get('symbolic').textContent.includes('questionPlan'));assert.ok(nodes.get('wire').textContent.includes('inputText'));assert.ok(nodes.get('context').textContent.includes('referenceDate'));assert.ok(nodes.get('annotations').textContent.includes('executionPermitted'))})
 await check('real-workspace-remains-unreviewed-after-client-tests',async()=>{const s=await(await fetch('http://127.0.0.1:5194/api/bootstrap')).json();assert.equal(s.summary.total.reviewed,0);assert.equal(Object.keys(s.reviews).length,0);assert.equal(s.profile,null)})
}catch(e){if(!results.some(r=>r.status==='FAIL'))results.push({name:'client-contract-abort',status:'FAIL',safeCode:e.code??'CLIENT_CONTRACT_TIMEOUT'})}
if(results.some(r=>r.status==='FAIL'))console.log(JSON.stringify({diagnostic:{criterionCount:[...nodes.keys()].filter(k=>k.startsWith('choice-')).length,fieldsetDisabled:nodes.get('decision-fields').disabled,saveDisabled:nodes.get('save').disabled,humanChecked:nodes.get('human-independent').checked,saveMessage:nodes.get('save-message').textContent}}));
const report={version:'CEB-client-DOM-contract-v1',createdAt:new Date().toISOString(),status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',checks:results.length,passed:results.filter(r=>r.status==='PASS').length,results,method:'Actual public/app.js in VM with minimal DOM double and live GET-only localhost API; not browser rendering',browserRenderingVerified:false,localReads:reads,writeRequests:0,realHumanDecisionsCreated:0,externalCalls:0,modelCalls:0}
const n=fs.readdirSync(path.join(HERE,'evidence')).filter(p=>/^dom-contract-attempt-\d+\.json$/.test(p)).length+1,file=`dom-contract-attempt-${String(n).padStart(3,'0')}.json`;fs.writeFileSync(path.join(HERE,'evidence',file),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,checks:report.checks,passed:report.passed,failed:results.filter(r=>r.status==='FAIL'),writeRequests:0,reportFile:file}));if(report.status!=='PASS')process.exitCode=1
