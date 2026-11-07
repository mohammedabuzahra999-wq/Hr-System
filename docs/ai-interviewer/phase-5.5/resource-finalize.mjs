import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { root, writeJson } from './manifest.mjs'

// Finalize only this phase's previously started disposable local resources.
const here = dirname(fileURLToPath(import.meta.url)), run = 'final-20261103'
const output = resolve(here, 'runs', run, 'resource-cleanup.json')
if (existsSync(output)) throw Error('Cleanup is already recorded; do not repeat it')
const result = {startedAtUtc: new Date().toISOString(), status: 'INCOMPLETE', testsRerun: 0, commands: [], testProfilesRemoved: [], databasePolicy: 'Read-only inspection; no database dropped during finalization'}
try {
  const pool = new pg.Pool({host: '127.0.0.1', port: 55442, user: 'phase2_test', database: 'postgres', max: 1, connectionTimeoutMillis: 2000, query_timeout: 2000})
  try {
    result.activeOtherClientSessions = Number((await pool.query("SELECT count(*) AS count FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()")).rows[0].count)
    result.phase55DisposableDatabasesRemaining = Number((await pool.query("SELECT count(*) AS count FROM pg_database WHERE datname ~ '^ai_interview_phase55_[a-f0-9]{32}$'")).rows[0].count)
  } finally { await pool.end() }
  if (result.activeOtherClientSessions || result.phase55DisposableDatabasesRemaining) throw Error('Resources still in use or database cleanup incomplete')
  const allowed = resolve(root, '.local-dev/phase55-temp')
  for (const id of ['development-1', 'development-2', 'development-3', 'development-4', run]) {
    const target = resolve(allowed, id)
    if (!target.startsWith(allowed + sep)) throw Error('Invalid cleanup target')
    if (existsSync(target)) {
      const args = [resolve(here, 'run.mjs'), id, 'cleanup']
      execFileSync(process.execPath, args, {cwd: root, windowsHide: true, encoding: 'utf8'})
      result.commands.push({command: `node docs/ai-interviewer/phase-5.5/run.mjs ${id} cleanup`, exitCode: 0})
      if (existsSync(target)) throw Error('Temporary profile cleanup incomplete')
      result.testProfilesRemoved.push(id)
    }
  }
  const controller = resolve(root, '.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe')
  const data = resolve(root, '.local-dev/ai-interviewer-postgres/data')
  if (!data.startsWith(resolve(root, '.local-dev/ai-interviewer-postgres') + sep)) throw Error('Invalid cluster target')
  const stop = spawnSync(controller, ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], {cwd: root, windowsHide: true, encoding: 'utf8'})
  result.commands.push({command: '.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe -D .local-dev/ai-interviewer-postgres/data -m fast -w -t 15 stop', exitCode: stop.status})
  if (stop.status !== 0) throw Error('Local test cluster did not stop cleanly')
  const status = spawnSync(controller, ['-D', data, 'status'], {cwd: root, windowsHide: true, encoding: 'utf8'})
  result.commands.push({command: '.local-dev/ai-interviewer-postgres/pgsql/bin/pg_ctl.exe -D .local-dev/ai-interviewer-postgres/data status', exitCode: status.status, expectedExitCode: 3})
  result.localTestClusterStopped = status.status === 3
  result.temporaryRunDirectoriesRemaining = existsSync(allowed) ? readdirSync(allowed).length : 0
  if (!result.localTestClusterStopped || result.temporaryRunDirectoriesRemaining) throw Error('Resource finalization incomplete')
  result.status = 'PASS'
} catch {
  result.status = 'FAIL'; result.failureCode = 'PHASE55_RESOURCE_FINALIZATION_INCOMPLETE'; process.exitCode = 1
} finally {
  result.finishedAtUtc = new Date().toISOString()
  writeJson(output, result)
  console.log(JSON.stringify(result))
}
