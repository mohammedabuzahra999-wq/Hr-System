import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './manifest.mjs'

// Copy only the harness; every original assertion, wait and command is unchanged.
// Record only method/path/status/version/speaking/phase/error, never bodies or credentials.
let source=readFileSync(resolve(root,'services/hr-api/scripts/checkAiInterviewBrowser.mjs'),'utf8')
source=source.replace('const children = [], replies', 'const diagnosticTrace=[], diagnosticRequests=new Map();\nconst children = [], replies')
source=source.replace("if (value.method === 'Page.javascriptDialogOpening')",`if(value.method==='Network.requestWillBeSent') {
        const p=value.params,u=new URL(p.request.url);if(u.pathname.startsWith('/api/ai-interview/')){let b;try{b=JSON.parse(p.request.postData||'{}')}catch{};const row={at:Date.now(),method:p.request.method,path:u.pathname,command:b?.command?.type,expectedVersion:b?.expectedVersion};diagnosticRequests.set(p.requestId,row);diagnosticTrace.push(row)}
      }
      if(value.method==='Network.responseReceived'){const row=diagnosticRequests.get(value.params.requestId);if(row)row.httpStatus=value.params.response.status}
      if(value.method==='Network.loadingFinished'&&diagnosticRequests.has(value.params.requestId)){const row=diagnosticRequests.get(value.params.requestId);void page.send('Network.getResponseBody',{requestId:value.params.requestId}).then(r=>{let b;try{b=JSON.parse(r.body)}catch{return};const s=b.state||b;row.error=b.error;row.version=s.version;row.speaking=s.speaking;row.phase=s.phase}).catch(()=>{})}
      if (value.method === 'Page.javascriptDialogOpening')`)
source=source.replace("writeFileSync(resolve(evidence,'browser-results.json')", "writeFileSync(resolve(evidence,'metadata-trace.json'),JSON.stringify({assertionsUnchanged:true,trace:diagnosticTrace},null,2));\n  writeFileSync(resolve(evidence,'browser-results.json')")
writeFileSync(new URL('./browser-diagnostics.mjs',import.meta.url),source)
console.log('Prepared diagnostic harness; original assertions and application sources unchanged')
