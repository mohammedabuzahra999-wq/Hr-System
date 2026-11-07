import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { HERE, ROOT, childArguments, childEnvironment, verifyFrozen, validateConfig, DATASET_HASH } from './policy.mjs'
import { score, summarize } from './scoring.mjs'

export function launch(request,{timeoutMs=150_000}={}) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>150_000)throw new Error('Invalid per-request deadline')
  return new Promise((resolve,reject)=>{
    const started=performance.now()
    const child=spawn(process.execPath,childArguments(),{cwd:ROOT,env:childEnvironment(),stdio:['pipe','pipe','pipe'],windowsHide:true})
    let stdout='',stderr='',settled=false
    const timer=setTimeout(()=>{if(settled)return;settled=true;child.kill();resolve({timeout:true,latencyMs:Math.min(performance.now()-started,timeoutMs)})},timeoutMs)
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>2_000_000){child.kill();reject(new Error('Harness output limit exceeded'))}})
    child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>16_000)stderr=stderr.slice(-16_000)})
    child.on('error',error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error)})
    child.on('close',code=>{if(settled)return;settled=true;clearTimeout(timer)
      let output;try{output=JSON.parse(stdout.trim())}catch{reject(new Error(`Harness child failed before structured output (exit ${code}): ${stderr.slice(-800)}`));return}
      if(code!==0||output.fatal){reject(new Error(`Harness child failed: ${output.fatal??code}; ${output.detail??''}`));return}
      resolve(output)
    })
    child.stdin.on('error',()=>{})
    child.stdin.end(JSON.stringify(request))
  })
}
function timeoutResult(row,latencyMs) {
  return score(row,{predicted:{intent:null,action:null,entities:{},clarification:null,confirmation:null,scope:null,behavior:null,authorization:'unavailable'},
    resolverPath:'OTHER',routingSource:null,routingRule:null,validation:'NOT_OBSERVED',latencyMs,error:'timeout',
    modelAttempted:false,modelCompleted:false,modelDeferred:false,modelMocked:false,promptTokens:null,completionTokens:null,
    planObserved:false,proposalComplete:false,safety:{falseActionSelection:false,falseActionProposal:false,falseActionAttempt:false,
      interceptedExecution:false,realExecution:false,isolationFailure:false}})
}
async function main(args) {
  const allowed=new Set(['--verify','--execute-frozen-before','--mode','--model'])
  for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw new Error('Unknown command-line option');if(['--mode','--model'].includes(args[i]))i++}
  const frozen=verifyFrozen()
  if(!args.includes('--execute-frozen-before')) {
    console.log(JSON.stringify({status:'INTEGRITY VERIFIED; NO CASES EXECUTED',cases:frozen.rows.length,datasetHash:frozen.datasetHash,
      modes:['dry-run','ollama'],externalCloud:'disabled',fullExecutionRequires:'--execute-frozen-before'},null,2));return
  }
  const value=(flag,fallback)=>{const index=args.indexOf(flag);return index<0?fallback:args[index+1]}
  const mode=value('--mode','dry-run'),model=value('--model','qwen3:4b')
  if(!['dry-run','ollama'].includes(mode))throw new Error('Full runs cannot use mock models or external cloud')
  validateConfig({mode,model,baseUrl:'http://127.0.0.1:11434'})
  const results=[]
  // No output file exists until explicit execution was requested. Results stay
  // under this test-only directory and never overwrite frozen artifacts.
  const directory=path.join(HERE,'results');fs.mkdirSync(directory,{recursive:true})
  const destination=path.join(directory,`before-${mode}-${new Date().toISOString().replace(/[:.]/g,'-')}`)
  const fd=fs.openSync(destination+'.jsonl','wx')
  try {
    for(const row of frozen.rows) {
      const output=await launch({command:'evaluate',row,config:{mode,model,baseUrl:'http://127.0.0.1:11434'}})
      const result=output.timeout?timeoutResult(row,output.latencyMs):output.result
      fs.writeSync(fd,JSON.stringify(result)+'\n');results.push(result)
      console.log(`${row.id}: ${result.error??result.predicted.behavior??'unavailable'}`)
      if(result.safety.isolationFailure)throw new Error('Isolation violation; run stopped, no fallback')
    }
  } finally {fs.closeSync(fd)}
  verifyFrozen()
  const metadata={datasetHash:DATASET_HASH,sourceHashes:frozen.sourceHashes,configuration:{mode,questionProvider:'ollama',model,
    actionOpenAI:'unconfigured',externalCloud:'disabled'},interpretation:mode==='dry-run'?'LOCAL/DEFERRED ONLY — NOT MODEL BEFORE ACCURACY':'ISOLATED HYBRID UNDERSTANDING; SERVICE FIXTURE LIMITATIONS APPLY',
    ...summarize(results)}
  fs.writeFileSync(destination+'.summary.json',JSON.stringify(metadata,null,2)+'\n',{flag:'wx'})
  console.log(`Saved ${path.relative(ROOT,destination)}.{jsonl,summary.json}`)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1})
}
