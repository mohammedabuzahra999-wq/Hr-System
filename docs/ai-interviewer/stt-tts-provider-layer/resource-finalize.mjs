import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import pg from 'pg'
import { root, writeJson } from './manifest.mjs'
import { here } from './state.mjs'

const run = 'final-verified-20261105', output = resolve(here, 'runs', run, 'resource-cleanup.json')
if (existsSync(output)) throw Error('Cleanup already recorded; do not repeat')
const result = {status: 'INCOMPLETE', startedAtUtc: new Date().toISOString(), commands: [], removedProfiles: [], databasePolicy: 'Read-only resource inspection; no database dropped during finalization'}
try {
  const pool = new pg.Pool({host: '127.0.0.1', port: 55442, user: 'phase2_test', database: 'postgres', max: 1, connectionTimeoutMillis: 2000, query_timeout: 2000})
  try {
    result.activeOtherClientSessions = Number((await pool.query("SELECT count(*) AS count FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()")).rows[0].count)
    result.speechlayerDisposableDatabasesRemaining = Number((await pool.query("SELECT count(*) AS count FROM pg_database WHERE datname ~ '^ai_interview_speechlayer_[a-f0-9]{32}$'")).rows[0].count)
  } finally {await pool.end()}
  if (result.activeOtherClientSessions || result.speechlayerDisposableDatabasesRemaining) throw Error('Resources not idle')
  const allowed = resolve(root, '.local-dev/speechlayer-temp')
  for (const id of ['final-20261105', 'development-1', 'development-2', run, 'post-build-verified-20261105', 'browser-recheck-20261105']) {
    const target = resolve(allowed, id)
    if (!target.startsWith(allowed + sep)) throw Error('Invalid profile target')
    if (!existsSync(target)) continue
    execFileSync(process.execPath, [resolve(here, 'run.mjs'), id, 'cleanup'], {cwd: root, windowsHide: true, encoding: 'utf8'})
    result.commands.push({command: `node docs/ai-interviewer/stt-tts-provider-layer/run.mjs ${id} cleanup`, exitCode: 0})
    if (existsSync(target)) throw Error('Profile cleanup incomplete')
    result.removedProfiles.push(id)
  }
  const controller = resolve(root, '.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe'), data = resolve(root, '.local-dev/ai-interviewer-postgres/data')
  if (!data.startsWith(resolve(root, '.local-dev/ai-interviewer-postgres') + sep)) throw Error('Invalid database cluster target')
  const stop = spawnSync(controller, ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], {cwd: root, windowsHide: true, encoding: 'utf8'})
  result.commands.push({command: '.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe -D .local-dev/ai-interviewer-postgres/data -m fast -w -t 15 stop', exitCode: stop.status})
  if (stop.status !== 0) throw Error('Test cluster shutdown failed')
  const status = spawnSync(controller, ['-D', data, 'status'], {cwd: root, windowsHide: true, encoding: 'utf8'})
  result.commands.push({command: '.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe -D .local-dev/ai-interviewer-postgres/data status', exitCode: status.status, expectedExitCode: 3})
  result.localTestClusterStopped = status.status === 3
  result.temporaryRunDirectoriesRemaining = existsSync(allowed) ? readdirSync(allowed).length : 0
  if (!result.localTestClusterStopped || result.temporaryRunDirectoriesRemaining) throw Error('Resource cleanup incomplete')
  result.status = 'PASS'
} catch {result.status = 'FAIL'; result.failureCode = 'SPEECH_LAYER_RESOURCE_CLEANUP_INCOMPLETE'; process.exitCode = 1}
finally {result.finishedAtUtc = new Date().toISOString(); writeJson(output, result); console.log(JSON.stringify(result))}
