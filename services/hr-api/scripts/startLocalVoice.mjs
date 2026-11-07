import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { backendPaths } from './repositoryPaths.mjs'
const { localVoiceRoot: root, workerScript: worker } = backendPaths(fileURLToPath(new URL('../', import.meta.url)))
// The audio worker receives no database, session, OpenAI or other HR secrets.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(?:PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|LOCAL_VOICE_PORT|LOCAL_STT_MODEL|LOCAL_STT_THREADS|LOCAL_TTS_AR_VOICE|LOCAL_TTS_EN_VOICE)$/i.test(key)))
env.PYTHONUTF8 = '1'
const child = spawn(join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), ['-u', worker],
  { stdio: 'inherit', env, windowsHide: true })
child.on('error', () => { console.error('Local voice is not installed. Run npm run voice:setup --workspace=@hr/server'); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
