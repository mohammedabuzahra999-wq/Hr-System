// Same fixed thresholds as the existing checker, with safe size prefilters.
// No protected-corpus reads occur in this module. Only aggregate counts are returned.
import { prepare, compare as originalCompare } from '../../../../controlled-assets/remediation-v1.1/validation/core.mjs';
export { prepare };
const intersect=(a,b)=>{let n=0;const small=a.size<b.size?a:b,big=a.size<b.size?b:a;for(const v of small)if(big.has(v))n++;return n;};
function edit(a,b,k){if(Math.abs(a.length-b.length)>k)return false;let prior=new Int32Array(b.length+1),next=new Int32Array(b.length+1);for(let j=0;j<=b.length;j++)prior[j]=j;
 for(let i=1;i<=a.length;i++){next.fill(k+1);next[0]=i;let min=k+1;for(let j=Math.max(1,i-k);j<=Math.min(b.length,i+k);j++){next[j]=Math.min(prior[j]+1,next[j-1]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));min=Math.min(min,next[j]);}if(min>k)return false;[prior,next]=[next,prior];}return prior[b.length]<=k;}
function near(a,b){
 const short=Math.max(a.tokens.length,b.tokens.length)<=5;
 if(!short){const max=Math.max(a.ts.size,b.ts.size),min=Math.min(a.ts.size,b.ts.size);if(max>0&&min/max>=.8){const ti=intersect(a.ts,b.ts),union=a.ts.size+b.ts.size-ti;if(union&&ti/union>=.8)return true;}}
 const max=Math.max(a.chars.length,b.chars.length),k=Math.floor(max*.1+1e-9),canEdit=Math.abs(a.chars.length-b.chars.length)<=k;
 const canDice=short&&(a.cs.size+b.cs.size)>0&&2*Math.min(a.cs.size,b.cs.size)/(a.cs.size+b.cs.size)>=.9;
 if(!canEdit&&!canDice)return false;
 const ci=intersect(a.cs,b.cs);
 if(canDice&&2*ci/(a.cs.size+b.cs.size)>=.9)return true;
 if(!canEdit||ci<Math.max(a.cs.size,b.cs.size)-3*k)return false;
 return edit(a.chars,b.chars,k);
}
export function compare(candidate,reference,onProgress){
 const out={candidateRows:candidate.length,referenceUniqueTexts:reference.length,exactCandidateRows:0,normalizedCandidateRows:0,entityMaskedExactCandidateRows:0,strongNearCandidateRows:0,flaggedCandidateRows:0};
 const exact=new Set(reference.map(x=>x.text)),norm=new Set(reference.map(x=>x.n)),masked=new Set(reference.map(x=>x.masked));
 for(let i=0;i<candidate.length;i++){
  const item=candidate[i],variants=[item,...(item.alternates??[])],e=variants.some(v=>exact.has(v.text)),n=variants.some(v=>norm.has(v.n)),m=variants.some(v=>masked.has(v.masked));let strong=false;
  if(!e&&!n&&!m){outer:for(const v of variants)for(const ref of reference)if(near(v,ref)||near(v.maskedView,ref.maskedView)){strong=true;break outer;}}
  out.exactCandidateRows+=+e;out.normalizedCandidateRows+=+n;out.entityMaskedExactCandidateRows+=+m;out.strongNearCandidateRows+=+strong;out.flaggedCandidateRows+=+(e||n||m||strong);
  if(i%1000===999)onProgress?.(i+1);
 }
 return out;
}
export function selfTest(){
 const samples=['a b c d e f g','a b c d e f X','abcdefghij','abcdefghiX','zzzzzzzzzz','employee <EMPLOYEE_NAME_1> attendance this month','employee <EMPLOYEE_NAME_8> attendance this month','قسم <DEPARTMENT_1> وحضور الموظفين','قسم <DEPARTMENT_7> وحضور الموظفين','مرحبا كيف الحال','مرحبا كيف الحال اليوم','tiny','a lengthy completely distinct sentence about another topic'];
 let checks=0;for(const a of samples)for(const b of samples){const ca=prepare(a),rb=prepare(b),x=originalCompare([ca],[rb]),y=compare([ca],[rb]);if(JSON.stringify(x)!==JSON.stringify(y))throw Error('FIXED_COMPARISON_PARITY_FAILURE');checks++;}
 return{status:'PASS',parityChecks:checks,thresholds:'exact/normalized/entity-mask; long token-3-shingle Jaccard>=0.80; short char-3-shingle Dice>=0.90; Unicode edit similarity>=0.90; unchanged'};
}
