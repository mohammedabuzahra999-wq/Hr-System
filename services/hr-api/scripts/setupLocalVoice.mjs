import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { backendPaths } from './repositoryPaths.mjs'

const { localVoiceRoot: root } = backendPaths(fileURLToPath(new URL('../', import.meta.url)))
await mkdir(join(root, 'models'), { recursive: true })
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true })
  if (result.status !== 0) throw new Error(`Local voice setup failed: ${command}`)
}
const python = join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
try { await access(python) } catch { run(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'venv', join(root, 'venv')]) }
run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', 'piper-tts==1.8.0', 'onnxruntime==1.31.0'])
async function download(url, path, sha256) {
  try {
    const bytes = await readFile(path)
    if (!sha256 || createHash('sha256').update(bytes).digest('hex') === sha256) return
  } catch { /* first setup */ }
  console.log(`Downloading ${path.split(/[\\/]/).at(-1)}`)
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (sha256 && createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Model/binary checksum mismatch')
  await writeFile(path, bytes)
  console.log(`Saved ${(bytes.length / 1_000_000).toFixed(1)} MB`)
}
if (process.platform !== 'win32') throw new Error('This setup selects Windows CPU binaries; supply your own whisper-cli on other platforms')
await download('https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip', join(root, 'whisper.zip'),
  '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a')
run(python, ['-c', 'import sys,zipfile,pathlib; d=pathlib.Path(sys.argv[2]).resolve(); z=zipfile.ZipFile(sys.argv[1]); assert all((d/n.filename).resolve().is_relative_to(d) for n in z.infolist()); z.extractall(d)', join(root, 'whisper.zip'), join(root, 'bin')])
await download('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin', join(root, 'models', 'ggml-small-q5_1.bin'),
  'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb')
for (const [path, hash] of [
  ['ar/ar_JO/kareem/low/ar_JO-kareem-low', '2887e9d68b125965c747e1371fa21e1cef19555ea98d0795a0d5d71188b13890'],
  ['en/en_US/lessac/low/en_US-lessac-low', 'f7d01dde371555732c4c314111ac79672b1a5ce2fc19266ab42178fd8df7f375'],
]) {
  const name = path.split('/').at(-1)
  const url = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${path}`
  await download(`${url}.onnx`, join(root, 'models', `${name}.onnx`), hash)
  await download(`${url}.onnx.json`, join(root, 'models', `${name}.onnx.json`))
  await download(url.slice(0, url.lastIndexOf('/')) + '/MODEL_CARD', join(root, 'models', `${name}.MODEL_CARD`))
}
await writeFile(join(root, 'manifest.json'), JSON.stringify({ whisper: 'v1.9.2', stt: 'small-q5_1 multilingual',
  piper: '1.8.0', onnxruntime: '1.31.0', voices: ['ar_JO-kareem-low', 'en_US-lessac-low'] }, null, 2))
console.log('Local voice CPU engines installed. Start with: npm run voice:local --workspace=@hr/server')
