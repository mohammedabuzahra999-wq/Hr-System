// Metadata only: compare immutable first-upload and current publisher snapshots.
import fs from 'node:fs';
import path from 'node:path';
import { output, json, sha } from './capture-local.mjs';

const first = 'a847ed9e9f50a0cdd07e38aba12f9e6755e3c141';
const url = 'https://huggingface.co/api/models/Qwen/Qwen3-4B-Thinking-2507/revision/' + first + '?blobs=true';
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
const bytes = Buffer.from(await response.arrayBuffer());
if (!response.ok || bytes.length > 2 * 1024 * 1024) throw Error('Unable to capture bounded release metadata');
fs.writeFileSync(path.join(output, 'public/upstream-first-upload-model-api.json'), bytes, { flag: 'wx' });
const original = JSON.parse(bytes);
const current = JSON.parse(fs.readFileSync(path.join(output, 'public/upstream-pinned-model-api.json'), 'utf8'));
const files = current.siblings.filter(x => !['README.md', '.gitattributes', 'LICENSE'].includes(x.rfilename)).map(x => {
  const old = original.siblings.find(y => y.rfilename === x.rfilename);
  return { file: x.rfilename, firstBlobId: old?.blobId, pinnedBlobId: x.blobId, firstLfsSha256: old?.lfs?.sha256, pinnedLfsSha256: x.lfs?.sha256, same: !!old && old.blobId === x.blobId && old.size === x.size && old.lfs?.sha256 === x.lfs?.sha256 };
});
json('upstream-release-history-comparison.json', {
  capturedAt: new Date().toISOString(), sourceUrl: url, status: response.status, responseSha256: sha(bytes),
  firstUploadRevision: first, pinnedPublisherRevision: current.sha, files,
  allWeightConfigTokenizerFilesUnchangedSinceFirstUpload: files.every(x => x.same),
  limitation: 'Publisher history equivalence does not attest which revision Ollama used to convert the pinned GGUF.'
});
console.log(JSON.stringify({ files: files.length, allUnchanged: files.every(x => x.same), weightsDownloaded: 0 }));
