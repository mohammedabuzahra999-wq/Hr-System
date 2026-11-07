// Format candidate inputs with the unchanged shared formatter; no inference.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {build} from '../generation/generate.mjs';import {exporter} from '../generation/prompt-export.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ex=await exporter();let maxPromptBytes=0,maxCompletionBytes=0;
for(const row of build()){const wire=ex.format(row);maxPromptBytes=Math.max(maxPromptBytes,Buffer.byteLength(JSON.stringify(wire.prompt)));maxCompletionBytes=Math.max(maxCompletionBytes,Buffer.byteLength(wire.completion[0].content));}
const status=Object.values(ex.privacy.flags).every(n=>n===0)?'PASS':'FAIL';
fs.writeFileSync(path.join(base,'validation/prompt-precheck.json'),JSON.stringify({status,checkedAt:new Date().toISOString(),identity:ex.identity,privacy:ex.privacy,maxPromptBytes,maxCompletionBytes,modelCalls:0,trainingStarted:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({promptPrecheck:status,messages:ex.privacy.checkedMessages,maxPromptBytes,maxCompletionBytes}));if(status!=='PASS')process.exitCode=1;
