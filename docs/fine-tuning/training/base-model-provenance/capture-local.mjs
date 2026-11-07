// Read-only model inspection. No inference, training, application imports or .env access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const output = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(output, '../../../..');
export const store = 'C:/Users/PC-LAB/.ollama/models';
export const before = path.join(root, 'docs/fine-tuning/before-evaluation/qwen3-4b-v1');
export const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export const json = (file, value) => {
  const dest = path.join(output, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
};
export async function hashFile(file) {
  const h = crypto.createHash('sha256');
  for await (const b of fs.createReadStream(file)) h.update(b);
  return h.digest('hex');
}

export function readGguf(file) {
  // All KV metadata must fit in a bounded 32 MiB header window. Never load weights.
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(Math.min(fs.statSync(file).size, 32 * 1024 * 1024));
  try { fs.readSync(fd, buffer, 0, buffer.length, 0); } finally { fs.closeSync(fd); }
  let offset = 0;
  function number(method, width) {
    if (offset + width > buffer.length) throw Error('GGUF header exceeds inspection window');
    const value = buffer[method](offset); offset += width; return value;
  }
  function uint64() {
    const v = number('readBigUInt64LE', 8);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Unsafe GGUF integer');
    return Number(v);
  }
  function string() {
    const n = uint64();
    if (offset + n > buffer.length) throw Error('GGUF string exceeds inspection window');
    const v = buffer.toString('utf8', offset, offset + n); offset += n; return v;
  }
  function value(type) {
    switch (type) {
      case 0: return number('readUInt8', 1);
      case 1: return number('readInt8', 1);
      case 2: return number('readUInt16LE', 2);
      case 3: return number('readInt16LE', 2);
      case 4: return number('readUInt32LE', 4);
      case 5: return number('readInt32LE', 4);
      case 6: return number('readFloatLE', 4);
      case 7: return number('readUInt8', 1) !== 0;
      case 8: return string();
      case 9: {
        const subtype = number('readUInt32LE', 4); const count = uint64();
        if (count > 1000000) throw Error('Unexpected GGUF array length');
        return Array.from({ length: count }, () => value(subtype));
      }
      case 10: return uint64();
      case 11: return Number(number('readBigInt64LE', 8));
      case 12: return number('readDoubleLE', 8);
      default: throw Error('Unsupported GGUF metadata type ' + type);
    }
  }
  if (buffer.toString('ascii', 0, 4) !== 'GGUF') throw Error('Not GGUF'); offset = 4;
  const version = number('readUInt32LE', 4);
  if (version !== 3) throw Error('Expected GGUF v3');
  const tensorCount = uint64(); const count = uint64(); const metadata = {};
  for (let i = 0; i < count; i++) {
    const key = string(); metadata[key] = value(number('readUInt32LE', 4));
  }
  return { version, tensorCount, metadataCount: count, metadataBytesEnd: offset, metadata };
}

async function main() {
  const evidence = path.join(before, 'evidence-hashes.sha256');
  if (await hashFile(evidence) !== 'cc2b12660beeb5798d52daf181208783aec2fa30bbdec9906ab00f0e2475f2ea') throw Error('Previous evidence manifest changed');
  const protectedFiles = JSON.parse(fs.readFileSync(path.join(before, 'protected-before.json'), 'utf8'));
  for (const line of fs.readFileSync(evidence, 'utf8').trim().split(/\r?\n/)) {
    const [p, h] = line.split('\t'); protectedFiles[p] = h;
  }
  protectedFiles['docs/fine-tuning/before-evaluation/qwen3-4b-v1/evidence-hashes.sha256'] = await hashFile(evidence);
  const mismatches = [];
  for (const [p, h] of Object.entries(protectedFiles)) if (await hashFile(path.join(root, p)) !== h) mismatches.push(p);
  if (mismatches.length) throw Error('Protected files changed: ' + mismatches.join(', '));
  json('protected-before.json', protectedFiles);
  const manifestPath = path.join(before, 'installed-model-manifest.json');
  const manifestBytes = fs.readFileSync(manifestPath);
  const digest = sha(manifestBytes);
  if (digest !== '359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7') throw Error('Wrong BEFORE digest');
  const manifest = JSON.parse(manifestBytes);
  const artifacts = [];
  for (const item of [manifest.config, ...manifest.layers]) {
    const file = path.join(store, 'blobs', item.digest.replace(':', '-'));
    const actual = await hashFile(file);
    if ('sha256:' + actual !== item.digest || fs.statSync(file).size !== item.size) throw Error('Model artifact changed');
    artifacts.push({ ...item, actualSha256: actual, verified: true });
  }
  const model = manifest.layers.find(x => x.mediaType === 'application/vnd.ollama.image.model');
  const gguf = readGguf(path.join(store, 'blobs', model.digest.replace(':', '-')));
  const metadata = Object.fromEntries(Object.entries(gguf.metadata).map(([k, v]) => [k, Array.isArray(v)
    ? { type: 'array', count: v.length, canonicalJsonSha256: sha(JSON.stringify(v)) } : v]));
  json('local-gguf-metadata.json', { ...gguf, metadata, modelBlobSha256: model.digest.slice(7), arrayHashEncoding: 'SHA-256 of UTF-8 JSON.stringify(array), no trailing newline' });
  json('local-artifact-verification.json', { capturedAt: new Date().toISOString(), manifestSha256: digest, artifacts, protectedFileCount: Object.keys(protectedFiles).length, protectedMismatches: mismatches, inferenceRequests: 0, fineTuningStarted: false });
  fs.copyFileSync(manifestPath, path.join(output, 'before-serving-manifest.json'), fs.constants.COPYFILE_EXCL);
  for (const item of [manifest.config, ...manifest.layers.filter(x => !x.mediaType.endsWith('.model'))]) {
    const name = item === manifest.config ? 'config' : item.mediaType.split('.').at(-1);
    fs.copyFileSync(path.join(store, 'blobs', item.digest.replace(':', '-')), path.join(output, 'before-' + name + '.txt'), fs.constants.COPYFILE_EXCL);
  }
  const requests = [
    ['GET', '/api/version'], ['GET', '/api/tags'], ['POST', '/api/show', { model: 'qwen3:4b' }]
  ];
  const fresh = [];
  for (const [method, endpoint, body] of requests) {
    try {
      const response = await fetch('http://127.0.0.1:11434' + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      // Retain only the pinned model in the installed-model inventory.
      fresh.push({ endpoint, status: response.status, data: endpoint === '/api/tags' ? { models: data.models?.filter(x => x.name === 'qwen3:4b') } : data });
    } catch (e) { fresh.push({ endpoint, error: e.message }); }
  }
  json('fresh-loopback-metadata.json', { capturedAt: new Date().toISOString(), requests: fresh, generationRequests: 0 });
  console.log(JSON.stringify({ protectedFiles: Object.keys(protectedFiles).length, verifiedArtifacts: artifacts.length, digest, ggufMetadataCount: gguf.metadataCount, metadataBytes: gguf.metadataBytesEnd, general: Object.fromEntries(Object.entries(metadata).filter(([k]) => k.startsWith('general.'))), freshStatus: fresh.map(x => ({ endpoint: x.endpoint, status: x.status, error: x.error })) }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
