import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(dir,'..'),root=path.resolve(base,'../../../../..');
const excluded=[
 'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl','server/src/copilot/data/hr_agent_intents_10000.jsonl',
 'docs/fine-tuning/controlled-assets/runtime-reference-v1.jsonl','docs/fine-tuning/controlled-assets/model-selection-v1.jsonl',
 'docs/fine-tuning/controlled-assets/remediation-v1.1/runtime-reference-v1.1.jsonl','docs/fine-tuning/controlled-assets/remediation-v1.1/model-selection-v1.1.jsonl'];
const p=JSON.parse(fs.readFileSync(path.join(base,'protected-before.json'),'utf8'));
const build=Object.keys(p).filter(x=>/hr_agent_intents_10000\.jsonl$/.test(x)&&x!==excluded[1]);
const allowed=[base,path.join(root,'node_modules'),path.join(root,'package.json'),path.join(root,'docs/fine-tuning/controlled-assets/remediation-v1.1/validation/core.mjs'),path.join(root,'docs/fine-tuning/controlled-assets/validation/contracts.mjs'),...excluded.map(x=>path.join(root,x)),...build.map(x=>path.join(root,x))];
const args=['--permission',...allowed.map(x=>'--allow-fs-read='+x),'--allow-fs-write='+dir,path.join(dir,'sealed-exclusion.mjs'),'--sealed-native'];
const child=spawn(process.execPath,args,{cwd:root,env:{SystemRoot:process.env.SystemRoot,PATH:path.dirname(process.execPath)},stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('SEALED_CHILD_START_FAILED');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
