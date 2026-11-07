import { aliasedTable, and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  createEmployeeSchema,
  employeeFilterSchema,
  idSchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type EmployeeFilter,
  type UpdateEmployeeInput,
} from '@hr/shared'
import { checkPasswordStrength, generateTemporaryPassword, hashPassword } from '../auth/password.js'
import { destroyAllSessions } from '../auth/session.js'
import { db } from '../db/client.js'
import { documents, leaveBalances, payslips, requests, salaryStructures, users } from '../db/schema.js'
import { toDocument, toEmployee, toPayslip } from '../mappers.js'
import { monthToDate, summarize } from '../domain/attendance.js'
import { balanceFor } from '../domain/leave.js'
import { presenceResolver } from '../domain/presence.js'
import { requireAuth, requireRole, validateBody, validateQuery, type AppEnv } from '../middleware.js'
import { allowed } from '../permissions.js'
import { publish } from '../realtime/bus.js'

export const employeeRoutes = new Hono<AppEnv>()

employeeRoutes.use('*', requireAuth)

const manager = aliasedTable(users, 'manager')

type UserRow = typeof users.$inferSelect

/**
 * The joined row, named rather than inferred.
 *
 * Drizzle's builder generics plus Hono's accumulating route types push this file
 * past TypeScript's instantiation budget, and the inferred element silently
 * collapses to `never`. Annotating the result keeps the types honest and cuts
 * the work the checker has to do.
 */
interface EmployeeRow {
  user: UserRow
  manager: UserRow | null
}

/** `$dynamic` lets the caller add a `where` conditionally without losing the row type. */
const selectEmployees = () =>
  db
    .select({ user: users, manager })
    .from(users)
    .leftJoin(manager, eq(manager.id, users.managerId))
    .$dynamic()

/**
 * Resolve presence for a set of people against one reading of the clock.
 *
 * Built once per request so every row in a response is judged at the same
 * instant. An account that has never signed in has no last-seen time at all,
 * and is offline rather than unknown — nobody has ever been there.
 */

employeeRoutes.get('/', requireRole(...allowed('viewEmployees')), validateQuery(employeeFilterSchema), async (c) => {
  const session = c.get('user')
  const filter = c.get('query') as EmployeeFilter

  const search = filter.q?.trim()
  const rows: EmployeeRow[] = await selectEmployees()
    .where(
      and(
        // A manager's directory is their own team, not the company.
        session.role === 'manager' ? eq(users.managerId, session.id) : undefined,
        filter.active !== undefined ? eq(users.isActive, filter.active) : undefined,
        filter.department
          ? or(eq(users.departmentEn, filter.department), eq(users.departmentAr, filter.department))
          : undefined,
        search
          ? or(
              ilike(users.fullNameEn, `%${search}%`),
              ilike(users.fullNameAr, `%${search}%`),
              ilike(users.departmentEn, `%${search}%`),
              ilike(users.departmentAr, `%${search}%`),
              ilike(users.employeeNumber, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(users.fullNameEn))

  const presenceOf = presenceResolver()
  return c.json({ employees: rows.map((r) => toEmployee(r.user, r.manager, presenceOf(r.user))) })
})

/**
 * A path parameter that is not an id at all.
 *
 * Postgres rejects a non-uuid comparison outright, so an address like
 * `/employees/anything` reached the database and came back a 500 — a server
 * fault for what is really a request for something that does not exist. 404 is
 * the honest answer, and it says the same thing for a malformed id as for a
 * well-formed one nobody has, which is all a stranger should learn either way.
 */
function employeeId(raw: string): string {
  if (!idSchema.safeParse(raw).success) throw new HTTPException(404, { message: 'employeeNotFound' })
  return raw
}

/** Your own record, or someone else's if you are allowed to see it. */
employeeRoutes.get('/:id', async (c) => {
  const session = c.get('user')
  const id = employeeId(c.req.param('id'))

  if (id !== session.id && session.role === 'employee') {
    throw new HTTPException(403, { message: 'forbidden' })
  }

  const rows: EmployeeRow[] = await selectEmployees().where(eq(users.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw new HTTPException(404, { message: 'employeeNotFound' })

  if (session.role === 'manager' && id !== session.id && row.user.managerId !== session.id) {
    throw new HTTPException(403, { message: 'forbidden' })
  }

  return c.json({ employee: toEmployee(row.user, row.manager, presenceResolver()(row.user)) })
})

employeeRoutes.get('/:id/documents', async (c) => {
  const session = c.get('user')
  const id = employeeId(c.req.param('id'))

  // Personal documents are the employee's own and HR's — not a manager's.
  if (id !== session.id && session.role !== 'hr' && session.role !== 'admin') {
    throw new HTTPException(403, { message: 'forbidden' })
  }

  const rows = await db.select().from(documents).where(eq(documents.userId, id)).orderBy(asc(documents.kind))
  return c.json({ documents: rows.map(toDocument) })
})

employeeRoutes.post('/', requireRole(...allowed('manageEmployees')), validateBody(createEmployeeSchema), async (c) => {
  const actor = c.get('user')
  const input = c.get('body') as CreateEmployeeInput

  /*
   * The add-user form only offers employee/manager/hr, but a form is not a
   * boundary — the same rule has to hold for a request that never went through
   * it. Minting an administrator stays an administrator's act.
   */
  if (input.role === 'admin' && actor.role !== 'admin') {
    throw new HTTPException(403, { message: 'forbidden' })
  }

  if (input.password) {
    const problem = checkPasswordStrength(input.password)
    if (problem) throw new HTTPException(422, { message: problem.code })
  }

  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1)
  if (clash[0]) throw new HTTPException(409, { message: 'emailTaken' })

  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      employeeNumber: input.employeeNumber,
      fullNameEn: input.fullName.en,
      fullNameAr: input.fullName.ar,
      jobTitleEn: input.jobTitle.en,
      jobTitleAr: input.jobTitle.ar,
      departmentEn: input.department.en,
      departmentAr: input.department.ar,
      role: input.role,
      managerId: input.managerId ?? null,
      joinedOn: input.joinedOn,
    })
    .returning()

  await db.insert(leaveBalances).values({ userId: row!.id, year: new Date().getFullYear() }).onConflictDoNothing()

  publish({ type: 'employee.changed', userId: row!.id, at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })

  return c.json({ employee: toEmployee(row!, null, presenceResolver()(row!)) }, 201)
})

/**
 * Editing an account.
 *
 * The guards below exist because setting someone's password is, in effect,
 * becoming them: the actor picks a secret, the target's sessions are dropped,
 * and from then on every action is recorded against the target — `decidedBy` on
 * an approval would name them, not whoever took the account. So an account may
 * never be edited by someone who does not already hold at least its own level,
 * and nobody may raise their own.
 */
employeeRoutes.patch('/:id', requireRole(...allowed('manageEmployees')), validateBody(updateEmployeeSchema), async (c) => {
  const actor = c.get('user')
  const id = employeeId(c.req.param('id'))
  const input = c.get('body') as UpdateEmployeeInput

  const existing = await db.select().from(users).where(eq(users.id, id)).limit(1)
  const target = existing[0]
  if (!target) throw new HTTPException(404, { message: 'employeeNotFound' })

  // Only an admin may touch an admin, or hand out the role.
  if (target.role === 'admin' && actor.role !== 'admin') {
    throw new HTTPException(403, { message: 'forbidden' })
  }
  if (input.role === 'admin' && actor.role !== 'admin') {
    throw new HTTPException(403, { message: 'forbidden' })
  }
  // Nobody changes their own role, so an account cannot promote itself.
  if (id === actor.id && input.role && input.role !== target.role) {
    throw new HTTPException(403, { message: 'cannotChangeOwnRole' })
  }
  // Passwords are not part of this payload at all — see the reset endpoint below.

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
  if (input.email) patch.email = input.email
  if (input.employeeNumber) patch.employeeNumber = input.employeeNumber
  if (input.fullName) Object.assign(patch, { fullNameEn: input.fullName.en, fullNameAr: input.fullName.ar })
  if (input.jobTitle) Object.assign(patch, { jobTitleEn: input.jobTitle.en, jobTitleAr: input.jobTitle.ar })
  if (input.department) Object.assign(patch, { departmentEn: input.department.en, departmentAr: input.department.ar })
  if (input.role) patch.role = input.role
  if (input.managerId !== undefined) patch.managerId = input.managerId
  if (input.joinedOn) patch.joinedOn = input.joinedOn
  if (input.isActive !== undefined) patch.isActive = input.isActive

  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning()
  if (!row) throw new HTTPException(404, { message: 'employeeNotFound' })

  // A disabled account keeps no live session.
  if (input.isActive === false) await destroyAllSessions(id)

  publish({ type: 'employee.changed', userId: id, at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })

  return c.json({ employee: toEmployee(row, null, presenceResolver()(row)) })
})

/**
 * Issue a new temporary password.
 *
 * There is no endpoint that reveals an existing password, because none exists to
 * reveal: the column holds a scrypt hash, which is one-way by construction. What
 * an administrator can do is replace it, and the replacement is *generated* here
 * rather than chosen by the caller — a password somebody picked is one they will
 * remember and can reuse quietly later.
 *
 * The value is returned once, in this response, and never again.
 */
employeeRoutes.post('/:id/reset-password', requireRole(...allowed('resetPassword')), async (c) => {
  const actor = c.get('user')
  const id = employeeId(c.req.param('id'))

  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  const target = rows[0]
  if (!target) throw new HTTPException(404, { message: 'employeeNotFound' })

  // Same ceiling as editing: only an administrator may act on an administrator.
  if (target.role === 'admin' && actor.role !== 'admin') {
    throw new HTTPException(403, { message: 'forbidden' })
  }
  // Your own password goes through /auth/change-password, which proves you know the current one.
  if (id === actor.id) {
    throw new HTTPException(403, { message: 'useChangePassword' })
  }

  const temporaryPassword = generateTemporaryPassword()
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(temporaryPassword), updatedAt: new Date() })
    .where(eq(users.id, id))

  // Whoever was signed in as them is signed out; the old credential is dead.
  await destroyAllSessions(id)

  publish({ type: 'employee.changed', userId: id, at: new Date().toISOString() }, { kind: 'roles', roles: ['hr', 'admin'] })

  return c.json({
    temporaryPassword,
    employeeName: { en: target.fullNameEn, ar: target.fullNameAr },
  })
})

/**
 * One employee's whole file, by their employee number.
 *
 * A lookup rather than a filter. The list already matches on employee number,
 * but a narrowed list answers "does this person exist"; HR is asked "what is
 * going on with EMP-1010" — how much leave is left, was there absence, what are
 * they paid, is anything waiting on them — and that needs the file.
 *
 * Assembled here rather than by six requests from the page: HR then sees one
 * moment rather than six, and the permission check happens once instead of
 * being repeated correctly six times.
 *
 * HR and administrators only. It carries salary, which is the reason.
 */
employeeRoutes.get('/lookup/:number', requireRole(...allowed('lookUpEmployeeFile')), async (c) => {
  const number = c.req.param('number').trim()
  if (!number) throw new HTTPException(400, { message: 'employeeNumberRequired' })

  // The same builder every other employee query uses, so the shape and the
  // joins cannot drift from the rest of the file.
  // Case-insensitive: nobody types `emp-1010` the way it is stored every time.
  const found: EmployeeRow[] = await selectEmployees()
    .where(sql`lower(${users.employeeNumber}) = ${number.toLowerCase()}`)
    .limit(1)

  const row = found[0]
  if (!row) throw new HTTPException(404, { message: 'employeeNotFound' })
  const user = row.user
  const managerRow = row.manager

  const [reports, days, balance, openRequests, docs, salary, slips] = await Promise.all([
    db
      .select({ id: users.id, en: users.fullNameEn, ar: users.fullNameAr, jobEn: users.jobTitleEn, jobAr: users.jobTitleAr })
      .from(users)
      .where(and(eq(users.managerId, user.id), eq(users.isActive, true))),
    monthToDate(user.id),
    balanceFor(user.id),
    db
      .select()
      .from(requests)
      .where(eq(requests.userId, user.id))
      // Pending first — those are the ones somebody is waiting on.
      .orderBy(sql`case when ${requests.status} = 'pending' then 0 else 1 end`, desc(requests.submittedAt))
      .limit(10),
    db.select().from(documents).where(eq(documents.userId, user.id)),
    db
      .select()
      .from(salaryStructures)
      .where(eq(salaryStructures.userId, user.id))
      .orderBy(desc(salaryStructures.effectiveFrom))
      .limit(1),
    db.select().from(payslips).where(eq(payslips.userId, user.id)).orderBy(desc(payslips.paidOn)).limit(6),
  ])

  return c.json({
    file: {
      employee: toEmployee(user, managerRow, presenceResolver()(user)),
      directReports: reports.map((r) => ({
        id: r.id,
        fullName: { en: r.en, ar: r.ar },
        jobTitle: { en: r.jobEn, ar: r.jobAr },
      })),
      attendanceThisMonth: summarize(days),
      leave: balance,
      requests: openRequests.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        submittedAt: r.submittedAt.toISOString(),
        detail:
          r.kind === 'leave' && r.leaveFrom
            ? { en: `${r.leaveFrom} → ${r.leaveTo}`, ar: `${r.leaveFrom} → ${r.leaveTo}` }
            : null,
      })),
      documents: docs.map(toDocument),
      salary: salary[0]
        ? {
            basic: Number(salary[0].basic),
            transport: Number(salary[0].transport),
            housing: Number(salary[0].housing),
            other: Number(salary[0].other),
            currency: salary[0].currency,
            effectiveFrom: String(salary[0].effectiveFrom),
            socialSecurityExempt: salary[0].socialSecurityExempt,
            dependants: salary[0].dependants,
          }
        : null,
      recentPayslips: slips.map(toPayslip),
    },
  })
})

