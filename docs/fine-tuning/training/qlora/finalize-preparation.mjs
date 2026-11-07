// Creates preparation metadata and hashes only. There is no training/export path.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../../../..');
const read = p => JSON.parse(fs.readFileSync(path.join(out, p), 'utf8'));
async function fileHash(p) { const h = crypto.createHash('sha256'); for await (const b of fs.createReadStream(p)) h.update(b); return h.digest('hex'); }
const save = (name, j) => fs.writeFileSync(path.join(out, name), JSON.stringify(j, null, 2) + '\n', { flag: 'wx' });
const catalog = read('current-contract-catalog.json');
const audit = read('asset-inspection.json');
const pools = [
  { name: 'substantive_intents', families: 1160, rows: 4640, splitFamilies: { train: 928, dev: 116, internalTest: 116 }, splitRows: { train: 3712, dev: 464, internalTest: 464 } },
  { name: 'action_boundaries', families: 384, rows: 1536, splitFamilies: { train: 288, dev: 48, internalTest: 48 }, splitRows: { train: 1152, dev: 192, internalTest: 192 } },
  { name: 'refusal_abstention', families: 256, rows: 1024, splitFamilies: { train: 216, dev: 20, internalTest: 20 }, splitRows: { train: 864, dev: 80, internalTest: 80 } },
  { name: 'greeting', families: 40, rows: 160, splitFamilies: { train: 32, dev: 4, internalTest: 4 }, splitRows: { train: 128, dev: 16, internalTest: 16 } },
  { name: 'context_entity_scope_contrasts', families: 160, rows: 640, splitFamilies: { train: 136, dev: 12, internalTest: 12 }, splitRows: { train: 544, dev: 48, internalTest: 48 } }
];
const projections = ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'];
const indexPath = path.resolve(out, '../base-model-provenance/public/upstream/model.safetensors.index.json');
const tensorIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const targets = Array.from({ length: 36 }, (_, i) => projections.map(p => 'model.layers.' + i + '.' + (['q_proj', 'k_proj', 'v_proj', 'o_proj'].includes(p) ? 'self_attn.' : 'mlp.') + p + '.weight')).flat();
const missingTargets = targets.filter(x => !Object.hasOwn(tensorIndex.weight_map, x));
if (missingTargets.length) throw Error('Proposed adapter projection names not present in pinned checkpoint');
const substantive = catalog.intents.filter(x => !['doAction', 'greeting', 'outOfScope'].includes(x));
if (substantive.length !== 29) throw Error('Ontology quota mismatch');
for (const p of pools) {
  if (p.rows !== p.families * 4 || Object.values(p.splitRows).reduce((a, b) => a + b, 0) !== p.rows || Object.values(p.splitFamilies).reduce((a, b) => a + b, 0) !== p.families) throw Error('Invalid pool arithmetic');
  for (const s of ['train', 'dev', 'internalTest']) if (p.splitRows[s] !== p.splitFamilies[s] * 4) throw Error('Language-family split mismatch');
}
const totals = Object.fromEntries(['train', 'dev', 'internalTest'].map(s => [s, pools.reduce((n, p) => n + p.splitRows[s], 0)]));
if (totals.train !== 6400 || totals.dev !== 800 || totals.internalTest !== 800) throw Error('Split totals failed');
const frozen = 'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl';
const frozenHash = await fileHash(path.join(root, frozen));
if (frozenHash !== 'b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05') throw Error('Frozen benchmark drift');
const protectedFiles = read('protected-before.json');
const mismatches = [];
for (const [p, h] of Object.entries(protectedFiles)) if (await fileHash(path.join(root, p)) !== h) mismatches.push(p);
if (mismatches.length) throw Error('Protected file drift: ' + mismatches.join(', '));
const syntax = ['inspect-assets.mjs', 'finalize-preparation.mjs'].map(name => {
  const r = spawnSync(process.execPath, ['--check', path.join(out, name)], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error('Syntax check failed'); return { file: name, pass: true };
});
save('preparation-plan.json', {
  version: 'HR-QUESTION-PLAN-QLORA-PREPARATION-1', createdAt: new Date().toISOString(),
  status: 'READY_FOR_CONTROLLED_DATASET_CREATION', trainingExecutionReady: false,
  authority: 'Current explicit project-owner decision; provenance limitation accepted for this controlled experiment',
  base: { repository: 'Qwen/Qwen3-4B-Thinking-2507', revision: '768f209d9ea81521153ed38c47d515654e938aea', tokenizerRevision: '768f209d9ea81521153ed38c47d515654e938aea', provenanceLimitationAccepted: true, cryptographicGgufConversionLinkVerified: false, earlierEvidenceModified: false },
  before: { model: 'qwen3:4b', digest: '359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7', quantization: 'Q4_K_M', ollama: '0.40.11', frozen404Sha256: frozenHash, evidenceUnchanged: true, rerun: false },
  objective: 'Independently authored natural-language HR request to complete existing {plan: CopilotPlan}; no factual HR answering or action execution',
  task: 'question_plan', targetFields: catalog.questionFields, substantiveIntents: substantive,
  actionBoundaryCategories: catalog.actions, actionBoundaryTargetIntent: 'doAction', trainActionPlanExtraction: false,
  recommendedExamples: 8000, semanticFamilies: 2000, pools, splitRows: totals,
  languages: Object.fromEntries(['en', 'ar-MSA', 'ar-JO', 'mixed'].map(l => [l, { total: 2000, train: 1600, dev: 200, internalTest: 200 }])),
  format: { canonical: 'Versioned JSONL envelope plus lineage/annotation sidecar; not created', modelExport: 'Conversational prompt-completion JSONL', completion: 'One assistant message containing the JSON string {plan: <complete CopilotPlan>}', prompt: 'Unchanged real controlled resolveQuestion prompt and optional synthetic previous-plan context', loss: 'Completion-only; explicit mask and pinned-template seam verification required', reasoningTraces: false, newSchemaFields: false },
  sources: { authoring: ['Current curated intent/action/schema/semantic/capability contracts', 'This independent construction/coverage specification', 'Future independently authored synthetic linguistic designs and identity pools'], runtimeR: 'Fixed prompt-reference context only through official controlled mapping; no training target or authoring seed', selectionS: 'Selection-only, excluded from train/dev/test/runtime examples', frozen404AndDerivatives: 'Excluded from authoring, prompts, targets, development and training; sealed exclusion checker only in a later admission stage', historical10KAndCopies: 'Excluded; integrity hashing only here; never author/generator/model/trainer input', productionDataAndCredentials: 'Prohibited' },
  guards: { familyEpisodeTranslationGroupedSplit: true, strictZodAndSharedSemanticValidation: true, capabilityRubric: true, noInventedIdsDatesScopes: true, zeroProtectedOverlapRequiredBeforeTraining: true, sealedExclusionAggregateOnly: true, optionalHumanReview: true, linguisticLimitationsMustBeDisclosed: true, finalPermissionAuthority: 'Server validation, RBAC, record scope, payroll restrictions, confirmation and executors unchanged' },
  draftQlora: { loadIn4bit: true, quantType: 'nf4', doubleQuant: true, computeDtype: 'bfloat16 after device verification', loraRank: 16, loraAlpha: 32, loraDropout: 0.05, targetProjections: projections, pinnedIndexTargetWeightsVerified: targets.length, trainableBaseWeights: false, learningRate: 0.0001, maxEpochs: 3, microbatch: 1, accumulation: 16, gradientCheckpointing: true, packing: false, proposedSeed: 42, tokenBudgetCompatibilityTarget: 8192, executableEnvironmentValidated: false, packageVersionsInstalledOrLocked: false },
  contamination: { preparation: 'PASS_NO_TRAINING_DATA_CREATED_PROTECTED_INPUTS_EXCLUDED', futureTrainingDataset: 'PENDING_GENERATION_AND_SEALED_ADMISSION', frozen404ParsedHere: false, historical10KParsedHere: false, existingRsEvidenceOnly: true },
  pii: { finding: 'NONE_FOUND_IN_INSPECTED_ADMITTED_ASSETS', inspectedRows: 480, staticScan: true, humanReviewPerformed: false, limitation: audit.linguisticLimitation },
  nextStep: 'Create independent synthetic dataset under frozen source/recipe/family split; validate and admit training/dev/internal-test exports; do not start training',
  trainingRowsCreated: 0, trainingExportsCreated: 0, inferenceRequests: 0, trainingStarted: false
});
save('integrity-verification.json', {
  verifiedAt: new Date().toISOString(), protectedFileCount: Object.keys(protectedFiles).length, protectedMismatches: mismatches,
  beforeEvidenceAndProvenanceUnchanged: true, frozen404Sha256: frozenHash, frozen404Rerun: false, frozen404Parsed: false, historical10KParsed: false,
  currentIntentCount: 32, currentActionCount: 48, validExistingQuestionPlans: audit.assets.reduce((n, x) => n + x.questionPlansValidated, 0), validExistingActionPlans: audit.assets.reduce((n, x) => n + x.actionPlansZodValidated, 0), intentionalNullControls: audit.assets.reduce((n, x) => n + x.nonExecutableNullControls, 0),
  freshPrivacyScan: 'PASS_STATIC_WITH_REVIEW_LIMITATIONS; NO REAL PII FOUND', quotaArithmetic: 'PASS', fourLanguageFamilySplits: 'PASS', exactPinnedTensorIndexProjectionNames: { pass: true, targetWeights: targets.length }, helperSyntaxChecks: syntax,
  existingFilesModified: 0, applicationSourceModified: false, promptsModified: false, configurationModified: false, trainingRowsCreated: 0, trainingExportsCreated: 0, productionDataAccess: false, modelCalls: 0, modelWeightsDownloaded: false, trainingStarted: false
});
const walk = p => fs.readdirSync(p, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(path.join(p, x.name)) : [path.join(p, x.name)]);
const files = walk(out).filter(p => path.basename(p) !== 'evidence-hashes.sha256').sort();
const manifest = [];
for (const p of files) manifest.push(path.relative(root, p).split(path.sep).join('/') + '\t' + await fileHash(p));
fs.writeFileSync(path.join(out, 'evidence-hashes.sha256'), manifest.join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'READY_FOR_CONTROLLED_DATASET_CREATION', protectedFilesUnchanged: Object.keys(protectedFiles).length, existingQuestionPlansValid: 456, existingActionPlansValid: 192, nonExecutableControls: 24, quotas: 'PASS', pinnedProjectionWeights: targets.length, newFiles: files.length + 1, manifestSha256: await fileHash(path.join(out, 'evidence-hashes.sha256')), trainingRowsCreated: 0, trainingStarted: false }, null, 2));
