// Pending review package only: never creates a reviewer signature or an admission.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const BASE=path.dirname(path.dirname(fileURLToPath(import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex')
const criteria=['languageMeaning','dialectNaturalness','privacyPIIAllFields','secretsAllFields','placeholderCorrectness','intentActionCorrectness','entityParameterCorrectness','roleScopeCorrectness','clarificationUnsupportedBehavior','confirmationNoExecutionBoundary','lineageIndependence','sourceRights']
const rows=[],assets={}
for(const name of ['runtime-reference-v1.1.jsonl','model-selection-v1.1.jsonl']){const b=fs.readFileSync(path.join(BASE,name)),data=b.toString('utf8').trim().split('\n').map(JSON.parse);assets[name]={sha256:hash(b),rows:data.length};for(const r of data)rows.push({asset:name,assetSha256:hash(b),recordId:r.recordId,rowSha256:hash(JSON.stringify(r)),language:r.language,trustedRole:r.input.trustedRole,status:'HUMAN_REVIEW_REQUIRED',reviewerId:null,reviewedAt:null,criteria:Object.fromEntries(criteria.map(k=>[k,{status:'PENDING',rationale:null}])),notes:null})}
const validation=fs.readFileSync(path.join(BASE,'validation/validation-results.json'))
const register={version:'CEB-independent-review-register-v1.1',created:new Date().toISOString(),assets,validationSha256:hash(validation),reviewerRequirements:{independentOfGenerator:true,humanBilingual:true,allFourLanguageStylesCovered:true,privacyAndScopeCompetence:true,accountableReviewerIdRequired:true},creator:'Codex assistant template author; cannot self-sign independent review',reviewers:[],rows,admission:{runtime:'REJECTED_PENDING_HUMAN_REVIEW',selection:'REJECTED_PENDING_HUMAN_REVIEW',approvalId:null,approvedBy:null,approvedAt:null,signatureEvidence:null}}
fs.writeFileSync(path.join(BASE,'review/review-register.json'),JSON.stringify(register,null,2)+'\n',{flag:'wx'})
const summary={version:register.version,created:register.created,assets,reviewRows:rows.length,criteriaPerRow:criteria.length,completedHumanRows:0,pendingHumanRows:rows.length,independentReview:'HUMAN_REVIEW_REQUIRED',admitted:false,modelExecutionCleared:false}
fs.writeFileSync(path.join(BASE,'review/review-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(summary))
