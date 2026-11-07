// Public provenance metadata only. No tokens, .env, inference or weight downloads.
import fs from 'node:fs';
import path from 'node:path';
import { output, json, sha } from './capture-local.mjs';

const records = [];
async function capture(name, url, maxBytes = 2 * 1024 * 1024) {
  const parsed = new URL(url);
  if (!['huggingface.co', 'registry.ollama.ai', 'ollama.com', 'raw.githubusercontent.com'].includes(parsed.hostname)) throw Error('Unapproved metadata host');
  if (/\.(safetensors|gguf|bin)(\?|$)/i.test(parsed.pathname)) throw Error('Weight downloads prohibited');
  const started = new Date().toISOString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'HR-Copilot-Provenance-Verification/1.0' } });
    const chunks = []; let size = 0;
    for await (const part of response.body) {
      size += part.length;
      if (size > maxBytes) throw Error('Metadata byte limit exceeded');
      chunks.push(part);
    }
    const data = Buffer.concat(chunks);
    const dest = path.join(output, 'public', name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data, { flag: 'wx' });
    const headers = Object.fromEntries(['content-type', 'content-length', 'etag', 'x-repo-commit', 'docker-content-digest', 'last-modified'].map(k => [k, response.headers.get(k)]).filter(([, v]) => v !== null));
    records.push({ name: 'public/' + name, requestedUrl: url, finalUrl: response.url, retrievedAt: started, status: response.status, headers, bytes: data.length, sha256: sha(data) });
    if (!response.ok) return null;
    try { return JSON.parse(data.toString('utf8')); } catch { return data.toString('utf8'); }
  } catch (e) { records.push({ requestedUrl: url, retrievedAt: started, error: e.message }); return null; }
}

const repo = 'Qwen/Qwen3-4B-Thinking-2507';
const metadata = await capture('upstream-model-api.json', 'https://huggingface.co/api/models/' + repo + '?blobs=true');
await capture('upstream-commits.json', 'https://huggingface.co/api/models/' + repo + '/commits/main');
if (!metadata?.sha || !/^[a-f0-9]{40}$/.test(metadata.sha)) throw Error('No immutable upstream revision');
const revision = metadata.sha;
await capture('upstream-pinned-model-api.json', 'https://huggingface.co/api/models/' + repo + '/revision/' + revision + '?blobs=true');
await capture('upstream-pinned-tree.json', 'https://huggingface.co/api/models/' + repo + '/tree/' + revision + '?recursive=true&expand=true');
for (const file of ['README.md', 'LICENSE', 'config.json', 'generation_config.json', 'model.safetensors.index.json', 'tokenizer_config.json', 'tokenizer.json', 'vocab.json', 'merges.txt']) {
  await capture('upstream/' + file, 'https://huggingface.co/' + repo + '/resolve/' + revision + '/' + file, 16 * 1024 * 1024);
}
await capture('ollama-alias-manifest.json', 'https://registry.ollama.ai/v2/library/qwen3/manifests/4b');
await capture('ollama-release-manifest.json', 'https://registry.ollama.ai/v2/library/qwen3/manifests/4b-thinking-2507-q4_K_M');
await capture('ollama-digest-manifest.json', 'https://registry.ollama.ai/v2/library/qwen3/manifests/sha256:359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7');
await capture('ollama-release-page.html', 'https://ollama.com/library/qwen3:4b-thinking-2507-q4_K_M');
await capture('ollama-model-layer-page.html', 'https://ollama.com/library/qwen3:4b-thinking-2507-q4_K_M/blobs/3e4cb1417446');
json('public-capture-index.json', { capturedAt: new Date().toISOString(), repository: repo, observedCurrentRevision: revision, credentialsUsed: false, weightDownloads: 0, inferenceRequests: 0, records });
console.log(JSON.stringify({ repository: repo, revision, files: records.length, errors: records.filter(x => x.error || x.status !== 200), weightsDownloaded: 0 }, null, 2));
