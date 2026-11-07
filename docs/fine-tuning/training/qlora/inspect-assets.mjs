// Offline preparation audit only. No generators, application startup, model calls or training.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { contracts } from '../../controlled-assets/validation/contracts.mjs';
import { privacy } from '../../controlled-assets/remediation-v1.1/validation/core.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../../../..');
const prior = path.resolve(out, '../base-model-provenance');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function fileHash(p) { const h = crypto.createHash('sha256'); for await (const b of fs.createReadStream(p)) h.update(b); return h.digest('hex'); }
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
function save(name, value) { fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
const priorManifest = path.join(prior, 'evidence-hashes.sha256');
if (await fileHash(priorManifest) !== '3dcd18841334ffeb276904fe510f85d1e57196e0a8e13d294879a96e6d80a238') throw Error('Provenance evidence changed');
const protectedFiles = JSON.parse(fs.readFileSync(path.join(prior, 'protected-before.json'), 'utf8'));
for (const line of fs.readFileSync(priorManifest, 'utf8').trim().split(/\r?\n/)) { const [p, h] = line.split('\t'); protectedFiles[p] = h; }
protectedFiles[path.relative(root, priorManifest).split(path.sep).join('/')] = await fileHash(priorManifest);
const mismatch = [];
for (const [p, h] of Object.entries(protectedFiles)) if (await fileHash(path.join(root, p)) !== h) mismatch.push(p);
if (mismatch.length) throw Error('Protected artifact drift: ' + mismatch.join(', '));
save('protected-before.json', protectedFiles);
const K = await contracts();
if (K.catalog.intents.length !== 32 || K.catalog.actions.length !== 48) throw Error('Unexpected ontology drift');
save('current-contract-catalog.json', K.catalog);
const admissionPath = 'docs/fine-tuning/controlled-assets/remediation-v1.1/admission/automated-policy-v1/admission-decision.json';
const validationPath = 'docs/fine-tuning/controlled-assets/remediation-v1.1/admission/automated-policy-v1/validation-results.json';
const admission = readJson(admissionPath), previousValidation = readJson(validationPath);
const counts = values => values.reduce((o, v) => { o[v] = (o[v] || 0) + 1; return o; }, {});
const reports = [];
for (const [kind, expectedRows, expectedHash] of [
  ['runtime', 320, 'f66937264beeb823ea5106aa7689deb18fd50963e9df9312dd772c3ee5f56736'],
  ['selection', 160, '09cd5561686fd77d24f78a9f6036947425d9fc7973652b8b808c9ea907da5986']
]) {
  const rel = 'docs/fine-tuning/controlled-assets/remediation-v1.1/' + (kind === 'runtime' ? 'runtime-reference' : 'model-selection') + '-v1.1.jsonl';
  const bytes = fs.readFileSync(path.join(root, rel));
  if (digest(bytes) !== expectedHash || admission.assets[kind].sha256 !== expectedHash || previousValidation[kind].sha256 !== expectedHash || admission.assets[kind].admission !== 'ADMITTED') throw Error('Asset not bound to admission');
  const rows = bytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
  if (rows.length !== expectedRows || !rows.every(x => x.synthetic === true)) throw Error('Asset envelope mismatch');
  const freshPrivacy = privacy(rows);
  if (freshPrivacy.status === 'FAIL' || freshPrivacy.realFactsDetected !== 0 || Object.values(freshPrivacy.flaggedRowsByCategory).some(Boolean)) throw Error('Privacy scan failed');
  let questionPlans = 0, actionPlans = 0, nullControls = 0;
  for (const row of rows) {
    const q = row.wireProjection.questionPlan, a = row.wireProjection.actionPlan;
    if (q) { if (!K.validatePlan(q, 'model').ok) throw Error('Question plan invalid'); questionPlans++; } else nullControls++;
    if (a) { if (!K.shared.copilotActionPlanSchema.safeParse(a).success) throw Error('Action plan invalid'); actionPlans++; }
  }
  const questionRows = rows.filter(x => x.task === 'question-reference');
  const populated = Object.fromEntries(K.catalog.questionFields.map(field => [field, questionRows.filter(x => x.wireProjection.questionPlan?.[field] != null).length]));
  reports.push({ kind, file: rel, sha256: expectedHash, rows: rows.length, admissionPurpose: admission.assets[kind].purpose,
    reusableAsTrainingTargets: false, languages: counts(rows.map(x => x.language)), tasks: counts(rows.map(x => x.task)), families: new Set(rows.map(x => x.familyId)).size,
    roles: counts(rows.map(x => x.input.trustedRole)), questionPlansValidated: questionPlans, actionPlansZodValidated: actionPlans, nonExecutableNullControls: nullControls,
    questionReferencePopulatedFields: populated, questionPeriods: counts(questionRows.map(x => x.wireProjection.questionPlan?.period ?? 'null')),
    questionIntents: counts(questionRows.map(x => x.wireProjection.questionPlan?.intent ?? 'terminal-control')),
    privacy: { status: freshPrivacy.status, realFactsDetected: freshPrivacy.realFactsDetected, flaggedRowsByCategory: freshPrivacy.flaggedRowsByCategory, independentHumanReviewPerformed: false },
    priorContaminationEvidence: previousValidation[kind].contamination, priorContaminationRecomputed: false,
    generationSourceUsedHere: false, exportedForTraining: false });
}
const frozen = 'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl';
const frozenHash = await fileHash(path.join(root, frozen));
if (frozenHash !== 'b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05') throw Error('Frozen benchmark changed');
save('asset-inspection.json', { auditedAt: new Date().toISOString(), purpose: 'Dataset design only; no training rows created', ontology: { intents: K.catalog.intents.length, actions: K.catalog.actions.length, planFields: K.catalog.questionFields, periods: K.catalog.periods }, assets: reports,
  admissionPolicy: admission.policy, admissionDecisionFile: admissionPath, admissionDecisionSha256: await fileHash(path.join(root, admissionPath)), priorValidationFile: validationPath, priorValidationSha256: await fileHash(path.join(root, validationPath)),
  linguisticLimitation: admission.linguisticLimitation, priorProtectedFilesUnchanged: Object.keys(protectedFiles).length,
  frozen404: { sha256: frozenHash, contentParsed: false, casesExecuted: 0, usedForTraining: false },
  historical10K: { usedForTraining: false, parsed: false, access: 'integrity hashing only, never a source for the dataset or authoring' },
  realPiiFound: false, noRealDataSourcesAccessed: true, inferenceRequests: 0, trainingRowsCreated: 0, trainingStarted: false });
save('environment-readiness.json', { capturedAt: new Date().toISOString(), platform: os.platform(), cpu: os.cpus()[0]?.model, logicalProcessors: os.cpus().length, totalRamBytes: os.totalmem(),
  reportedMachineClass: 'CPU-only Windows per project owner', cudaTrainingEnvironmentValidated: false, trainingDependenciesInstalledByThisTask: false,
  hardwareProbeLimitation: 'CIM inventory denied by sandbox; no elevation requested. NVIDIA CLI was not found on PATH. GPU capability is not independently certified by this preparation.',
  preparationScopeReady: 'Dataset and procedure specification, not an executable GPU training environment', trainingStarted: false });
console.log(JSON.stringify({ protectedFilesUnchanged: Object.keys(protectedFiles).length, intents: K.catalog.intents.length, actions: K.catalog.actions.length, inspectedSyntheticRows: reports.reduce((n, x) => n + x.rows, 0), privacy: 'NO REAL PII FOUND; STATIC LIMITATIONS APPLY', trainingRowsCreated: 0, frozen404Parsed: false, historical10KParsed: false, trainingStarted: false }, null, 2));
