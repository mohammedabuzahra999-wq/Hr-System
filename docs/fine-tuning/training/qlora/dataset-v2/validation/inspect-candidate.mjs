// Candidate-only authoring diagnostics. No protected corpus imports or reads.
import {build} from '../generation/generate.mjs';
import {prepare} from './compare.mjs';
import {patterns,strings} from '../../../../controlled-assets/remediation-v1.1/validation/core.mjs';
const rows=build(),seen=new Map(),dups=[];
for(const r of rows){const k=prepare(r.input.question).masked;if(seen.has(k))dups.push([seen.get(k),r]);else seen.set(k,r);}
console.log(JSON.stringify({duplicates:dups.slice(0,16).map(pair=>pair.map(r=>({id:r.recordId,language:r.language,pool:r.pool,text:r.input.question}))),privacy:rows.flatMap(r=>strings(r).map(s=>s.replace(/<[A-Z][A-Z_]*_\d+>/g,'<TYPED_PLACEHOLDER>')).filter(s=>patterns.ibanBank.test(s)).map(s=>({id:r.recordId,text:s}))).slice(0,12)},null,2));
