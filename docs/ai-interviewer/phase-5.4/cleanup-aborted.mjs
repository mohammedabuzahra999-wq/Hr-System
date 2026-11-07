import pg from 'pg'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Only the new phase's synthetic databases, after its test process has exited.
const pool = new pg.Pool({connectionString: 'postgresql://phase2_test@127.0.0.1:55442/postgres', max: 1})
const removed = []
try {
  const rows = (await pool.query("SELECT datname FROM pg_database WHERE datname LIKE 'ai_interview_phase54_%'")).rows
  for (const {datname} of rows) {
    if (!/^ai_interview_phase54_[a-f0-9]{32}$/.test(datname)) throw Error('Unsafe cleanup target')
    const active = Number((await pool.query('SELECT count(*) FROM pg_stat_activity WHERE datname=$1', [datname])).rows[0].count)
    if (active) throw Error('Refusing to remove an active test database')
    await pool.query(`DROP DATABASE "${datname}"`)
    removed.push(datname)
  }
} finally { await pool.end() }
const result = {recordedAtUtc: new Date().toISOString(), policy: 'Only verified ai_interview_phase54_<32 hex> databases with zero sessions', removed}
if (process.argv[2]) writeFileSync(resolve(process.argv[2]), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({removedAbortedSyntheticDatabases: removed.length, activeDatabasesRemoved: 0}))
