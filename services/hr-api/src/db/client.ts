import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env, isProduction } from '../env.js'
import * as schema from './schema.js'

/**
 * A `date` column stays a `YYYY-MM-DD` string.
 *
 * By default node-postgres turns it into a Date at *local* midnight, and
 * `toISOString()` on that lands on the previous day for any zone east of UTC —
 * a leave request for the 9th is stored and read back as the 8th. A calendar day
 * has no time and no zone, so it is never converted to one.
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

/**
 * One pool for the process. Neon's pooled host already fronts the database with
 * PgBouncer, so a small local pool is enough — a large one just queues behind it.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: isProduction ? 10 : 4,
  /*
   * Session-protected voice setup starts with an authentication lookup. At
   * 30 seconds the local pool dropped its last client between normal user
   * interactions, making the next microphone click wait for a fresh Neon TLS
   * connection. Keep one transport client alive after normal authenticated use;
   * it holds no cached session, user, or HR data, and does not change the
   * small maximum pool size. Extra idle clients still release after thirty
   * seconds.
   */
  min: 1,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
})

pool.on('error', () => {
  // An idle client dropped by the provider — the pool replaces it; never crash on this.
  console.error('[db] idle client unavailable')
})

export const db = drizzle(pool, { schema })

export type Db = typeof db

export async function closeDb() {
  await pool.end()
}
