// Offline comparisons only. Does not import application code or run a model.
import fs from 'node:fs';
import path from 'node:path';
import { output, store, before, json, sha, readGguf } from './capture-local.mjs';

const read = p => JSON.parse(fs.readFileSync(path.join(output, p), 'utf8'));
const modelHash = '3e4cb14174460404e7a233e531675303b2fbf7749c02f91864fe311ab6344e4f';
const g = readGguf(path.join(store, 'blobs/sha256-' + modelHash)).metadata;
const upstream = read('public/upstream-pinned-model-api.json');
const config = read('public/upstream/config.json');
const tokenizer = read('public/upstream/tokenizer.json');
const tokenizerConfig = read('public/upstream/tokenizer_config.json');
const tree = read('public/upstream-pinned-tree.json');
const checks = [];
const check = (name, pass, details = {}) => checks.push({ name, pass, ...details });
const actualTokenizerHash = sha(fs.readFileSync(path.join(output, 'public/upstream/tokenizer.json')));
check('Downloaded tokenizer matches publisher LFS SHA-256', actualTokenizerHash === upstream.siblings.find(x => x.rfilename === 'tokenizer.json').lfs.sha256, { sha256: actualTokenizerHash });

const tokens = g['tokenizer.ggml.tokens'];
const types = g['tokenizer.ggml.token_type'];
const vocab = Object.entries(tokenizer.model.vocab);
const baseErrors = vocab.filter(([token, id]) => tokens[id] !== token).map(([, id]) => id);
const addedErrors = tokenizer.added_tokens.filter(x => tokens[x.id] !== x.content).map(x => x.id);
const realTokenCount = Math.max(vocab.reduce((max, [, id]) => Math.max(max, id), -1), tokenizer.added_tokens.reduce((max, x) => Math.max(max, x.id), -1)) + 1;
const paddingErrors = [];
for (let i = realTokenCount; i < tokens.length; i++) if (tokens[i] !== '[PAD' + i + ']' || types[i] !== 5) paddingErrors.push(i);
const hfMerges = tokenizer.model.merges.map(x => Array.isArray(x) ? x.join(' ') : x);
const localMerges = g['tokenizer.ggml.merges'];
const mergeErrors = hfMerges.map((v, i) => v === localMerges[i] ? -1 : i).filter(i => i !== -1);
check('All base vocabulary token IDs and strings match', baseErrors.length === 0, { compared: vocab.length, mismatchedIds: baseErrors });
check('All added token IDs and strings match', addedErrors.length === 0, { compared: tokenizer.added_tokens.length, mismatchedIds: addedErrors });
check('GGUF padding is unused vocabulary capacity', paddingErrors.length === 0 && tokens.length === config.vocab_size, { realTokenCount, ggufVocabularySize: tokens.length, dummyPaddingCount: tokens.length - realTokenCount, mismatchedIds: paddingErrors });
check('All ordered BPE merge rules match', hfMerges.length === localMerges.length && mergeErrors.length === 0, { compared: hfMerges.length, mismatchedIndices: mergeErrors });
check('Embedded GGUF Jinja template matches upstream tokenizer template byte-for-byte', g['tokenizer.chat_template'] === tokenizerConfig.chat_template, { upstreamSha256: sha(tokenizerConfig.chat_template), embeddedSha256: sha(g['tokenizer.chat_template']) });
check('EOS token and ID match', tokens[config.eos_token_id] === tokenizerConfig.eos_token && g['tokenizer.ggml.eos_token_id'] === config.eos_token_id, { eosToken: tokenizerConfig.eos_token, eosTokenId: config.eos_token_id });
check('Padding token and ID match', tokens[g['tokenizer.ggml.padding_token_id']] === tokenizerConfig.pad_token, { padToken: tokenizerConfig.pad_token, padTokenId: g['tokenizer.ggml.padding_token_id'] });
check('Automatic BOS setting matches', tokenizerConfig.add_bos_token === g['tokenizer.ggml.add_bos_token'], { addBosToken: tokenizerConfig.add_bos_token });
const pairs = [
  ['architecture', g['general.architecture'], config.model_type],
  ['parameter count', g['general.parameter_count'], upstream.safetensors.total],
  ['context capacity', g['qwen3.context_length'], config.max_position_embeddings],
  ['embedding length', g['qwen3.embedding_length'], config.hidden_size],
  ['layer count', g['qwen3.block_count'], config.num_hidden_layers],
  ['attention heads', g['qwen3.attention.head_count'], config.num_attention_heads],
  ['KV heads', g['qwen3.attention.head_count_kv'], config.num_key_value_heads],
  ['head dimension', g['qwen3.attention.key_length'], config.head_dim],
  ['feed-forward length', g['qwen3.feed_forward_length'], config.intermediate_size],
  ['RoPE theta', g['qwen3.rope.freq_base'], config.rope_theta]
];
for (const [name, local, published] of pairs) check('Architecture/config: ' + name, local === published, { local, published });
const localManifest = fs.readFileSync(path.join(output, 'before-serving-manifest.json'));
for (const name of ['ollama-alias-manifest.json', 'ollama-release-manifest.json']) {
  const bytes = fs.readFileSync(path.join(output, 'public', name));
  check('Official registry byte match: ' + name, bytes.equals(localManifest), { sha256: sha(bytes) });
}

const upstreamFiles = [];
for (const item of upstream.siblings) {
  const downloaded = path.join(output, 'public/upstream', item.rfilename);
  const bytes = fs.existsSync(downloaded) ? fs.readFileSync(downloaded) : null;
  const actual = bytes ? sha(bytes) : null;
  // For regular Hub files compare Git blob IDs; for LFS compare published SHA-256.
  const gitBlob = bytes ? (await import('node:crypto')).default.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex') : null;
  const matches = !bytes ? null : item.lfs ? actual === item.lfs.sha256 : gitBlob === item.blobId;
  if (bytes) check('Retrieved upstream file content matches immutable Hub ID: ' + item.rfilename, matches);
  upstreamFiles.push({ file: item.rfilename, bytes: item.size, gitBlobId: item.blobId, publishedLfsSha256: item.lfs?.sha256 ?? null, downloaded: !!bytes, retrievedSha256: actual, contentIdMatch: matches, lastChangedCommit: tree.find(x => x.path === item.rfilename)?.lastCommit?.id ?? null });
}
json('tokenizer-and-config-comparison.json', { checkedAt: new Date().toISOString(), upstreamRepository: upstream.id, upstreamRevision: upstream.sha, tokenizerClass: tokenizerConfig.tokenizer_class, tokenizerAlgorithm: tokenizer.model.type, runtimePretokenizer: g['tokenizer.ggml.pre'], allChecksPass: checks.every(x => x.pass), checks, qualification: 'Tokenizer/config equality verifies compatibility, not weight ancestry. Ollama uses a separate Go template, captured as before-template.txt, rather than executing the embedded Jinja template.' });
json('upstream-checkpoint-file-identities.json', { repository: upstream.id, revision: upstream.sha, upstreamDtype: config.torch_dtype, modelClass: config.architectures[0], files: upstreamFiles, weightFilesDownloaded: false, qualification: 'Weight hashes are publisher-reported LFS IDs. Weight bytes were not downloaded or independently hashed.' });
const lock = JSON.parse(fs.readFileSync(path.join(before, 'baseline-lock.json'), 'utf8'));
json('before-inference-configuration-reference.json', { source: 'docs/fine-tuning/before-evaluation/qwen3-4b-v1/baseline-lock.json', sourceSha256: sha(fs.readFileSync(path.join(before, 'baseline-lock.json'))), inference: lock.inference, contextCapacity: lock.model.contextCapacity, qualification: 'This is the previously executed BEFORE configuration, copied without alteration. Capacity 262144 differs from effective num_ctx 8192. Thinking-2507 is published as thinking-only; existing think:false and /no_think are recorded controls, not proof of supported mode or absence of reasoning. No setting was changed or tested here.' });
console.log(JSON.stringify({ checks: checks.length, passed: checks.filter(x => x.pass).length, failed: checks.filter(x => !x.pass), tokenizerSha256: actualTokenizerHash, revision: upstream.sha }, null, 2));
if (checks.some(x => !x.pass)) process.exitCode = 1;
