// Offline evidence finalization. Never invokes inference, benchmarks or training.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { output, root, store, json, hashFile } from './capture-local.mjs';

const read = p => JSON.parse(fs.readFileSync(path.join(output, p), 'utf8'));
const tokenizer = read('tokenizer-and-config-comparison.json');
const history = read('upstream-release-history-comparison.json');
const fresh = read('fresh-loopback-metadata.json');
const model = fresh.requests.find(x => x.endpoint === '/api/tags')?.data?.models?.[0];
const version = fresh.requests.find(x => x.endpoint === '/api/version')?.data?.version;
const expectedDigest = '359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7';
if (!tokenizer.allChecksPass || !history.allWeightConfigTokenizerFilesUnchangedSinceFirstUpload || model?.digest !== expectedDigest || version !== '0.40.11') throw Error('Evidence compatibility checks failed');
const syntax = ['capture-local.mjs', 'capture-public.mjs', 'capture-release-history.mjs', 'compare-evidence.mjs', 'finalize-evidence.mjs'].map(file => {
  const result = spawnSync(process.execPath, ['--check', path.join(output, file)], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw Error('Inspection helper syntax check failed: ' + file);
  return { file, pass: true };
});
const protectedFiles = read('protected-before.json');
const mismatches = [];
for (const [file, expected] of Object.entries(protectedFiles)) if (await hashFile(path.join(root, file)) !== expected) mismatches.push(file);
if (mismatches.length) throw Error('Protected files changed: ' + mismatches.join(', '));
const frozenHash = await hashFile(path.join(root, 'docs/fine-tuning/benchmark/pre-finetuning-benchmark-v1.jsonl'));
if (frozenHash !== 'b6a6a9f74e76edcf783ad3a2f47f2fa493ac0444e2ca8bf239439229e14a2b05') throw Error('Frozen benchmark changed');
const publicCaptures = read('public-capture-index.json');
for (const r of publicCaptures.records) if (r.name && await hashFile(path.join(output, r.name)) !== r.sha256) throw Error('Public capture changed');
if (await hashFile(path.join(output, 'public/upstream-first-upload-model-api.json')) !== history.responseSha256) throw Error('First-upload response changed');
const manifest = read('before-serving-manifest.json');
let artifactCount = 0;
for (const item of [manifest.config, ...manifest.layers]) {
  if ('sha256:' + await hashFile(path.join(store, 'blobs', item.digest.replace(':', '-'))) !== item.digest) throw Error('Installed model artifact changed');
  artifactCount++;
}
json('provenance-decision.json', {
  version: 'PRE-FINETUNING-EXACT-BASE-PROVENANCE-1', assessedAt: new Date().toISOString(),
  matchingTrainableModel: 'NOT VERIFIED', safeToPrepareQLoRATraining: false,
  before: { localTag: 'qwen3:4b', manifestSha256: expectedDigest, modelBlobSha256: '3e4cb14174460404e7a233e531675303b2fbf7749c02f91864fe311ab6344e4f', actualRelease: 'Qwen3-4B-Thinking-2507', architecture: 'qwen3', parameters: 4022468096, quantization: 'Q4_K_M', contextCapacity: 262144, ollamaVersion: version },
  upstream: { repository: 'Qwen/Qwen3-4B-Thinking-2507', immutableCandidateRevision: '768f209d9ea81521153ed38c47d515654e938aea', firstWeightUploadRevision: 'a847ed9e9f50a0cdd07e38aba12f9e6755e3c141', dtype: 'bfloat16', tokenizerRevision: '768f209d9ea81521153ed38c47d515654e938aea', tokenizerClass: 'Qwen2Tokenizer', tokenizerJsonSha256: 'aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4', exactOllamaConversionSourceRevision: null },
  verified: ['Installed BEFORE manifest and five content-addressed blobs', 'Official Ollama alias and explicit release manifests are byte-identical to BEFORE', 'Embedded GGUF release is Thinking-2507', 'Publisher checkpoint snapshot exists and all weight/config/tokenizer IDs are unchanged since first upload', 'Tokenizer vocabulary, added tokens, merges and embedded Jinja template match', 'Architecture/configuration and model parameter count match'],
  notVerified: ['Publisher-to-converter chain binding exact GGUF weight blob to upstream checkpoint revision and original weight hashes', 'Converter version, conversion command and quantization build provenance'],
  gateReason: 'Release and tokenizer compatibility are verified; exact upstream weight-conversion ancestry is not attested in the inspected sources. A candidate immutable upstream snapshot must not be presented as the proven original conversion revision.',
  nextEvidenceNeeded: 'Publisher conversion/build provenance binding GGUF SHA-256 to immutable upstream revision and weight hashes, or a separately authorized controlled conversion/weight verification.',
  modelChanged: false, inferenceRequests: 0, frozenBenchmarkRerun: false, weightDownloads: 0, trainingDataCreated: false, fineTuningStarted: false
});
json('integrity-verification.json', {
  verifiedAt: new Date().toISOString(), protectedFileCount: Object.keys(protectedFiles).length,
  protectedMismatches: mismatches, frozen404Sha256: frozenHash, frozen404Unchanged: true,
  installedArtifactsRehashedAfterInspection: artifactCount, installedArtifactsUnchanged: true,
  offlineComparisonChecks: { passed: tokenizer.checks.filter(x => x.pass).length, total: tokenizer.checks.length },
  helperSyntaxChecks: syntax, publicCaptureHashesValid: true,
  existingFilesModified: 0, applicationSourceModified: false, configurationModified: false,
  secretsReadOrCopied: false, productionServicesAccessed: false, inferenceRequests: 0, frozen404Executed: false, fineTuningStarted: false
});
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const files = walk(output).filter(x => path.basename(x) !== 'evidence-hashes.sha256').sort();
const lines = [];
for (const file of files) lines.push(path.relative(root, file).split(path.sep).join('/') + '\t' + await hashFile(file));
fs.writeFileSync(path.join(output, 'evidence-hashes.sha256'), lines.join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ decision: 'NOT VERIFIED', safeToPrepareQLoRATraining: false, protectedFilesUnchanged: Object.keys(protectedFiles).length, tokenizerConfigChecks: '30/30 PASS', helperSyntaxChecks: '5/5 PASS', artifactsUnchanged: artifactCount, evidenceFilesHashed: files.length, evidenceManifestSha256: await hashFile(path.join(output, 'evidence-hashes.sha256')), frozen404Unchanged: true, inferenceRequests: 0, fineTuningStarted: false }, null, 2));
