import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '../db/client.js'
import { payrollSettings, payslips, salaryStructures, users } from '../db/schema.js'

/**
 * A starting point for payroll: one set of rates and a contract for everybody.
 *
 * The rates are the important part, and they are seeded **unconfirmed** on
 * purpose. They are plausible figures for Jordan, not verified ones — social
 * security rates, the contribution ceiling and the income tax bands are set by
 * law, they move, and a number that looks authoritative because software
 * printed it is worse than an obviously blank field.
 *
 * `confirmed: false` puts a warning on every payslip calculated with them until
 * somebody who actually knows has checked them and said so. Nothing about the
 * calculation changes when it is flipped; the only thing that changes is whether
 * the company is claiming these are right.
 *
 * Salaries come from the existing payslips, so the contracts match what people
 * were already being paid rather than inventing new figures for them.
 *
 *     npm run db:seed:payroll -w @hr/server
 */

const today = new Date()
const firstOfYear = `${today.getFullYear()}-01-01`

const existing = await db.select({ id: payrollSettings.id }).from(payrollSettings).limit(1)
if (existing[0]) {
  console.log('[payroll] settings already exist — leaving them alone')
} else {
  await db.insert(payrollSettings).values({
    effectiveFrom: firstOfYear,
    socialSecurityEmployeeRate: '0.0750',
    socialSecurityEmployerRate: '0.1425',
    socialSecurityCeiling: '3500.00',
    taxPersonalExemption: '9000.00',
    taxDependantExemption: '0.00',
    taxBands: [
      { upTo: 5000, rate: 0.05 },
      { upTo: 10000, rate: 0.1 },
      { upTo: 15000, rate: 0.15 },
      { upTo: 20000, rate: 0.2 },
      { upTo: null, rate: 0.25 },
    ],
    confirmed: false,
    note: 'Seeded defaults. NOT verified against current Jordanian law — an accountant must confirm the rates, the ceiling and the bands before these are used to pay anybody.',
  })
  console.log('[payroll] seeded one set of rates, marked UNCONFIRMED')
}

const staff = await db.select({ id: users.id, en: users.fullNameEn }).from(users).where(eq(users.isActive, true))
let made = 0

for (const person of staff) {
  const already = await db
    .select({ id: salaryStructures.id })
    .from(salaryStructures)
    .where(eq(salaryStructures.userId, person.id))
    .limit(1)
  if (already[0]) continue

  // Take the most recent payslip as the contracted figure, so nobody's pay moves.
  const [last] = await db
    .select({ basic: payslips.basic, allowances: payslips.allowances })
    .from(payslips)
    .where(eq(payslips.userId, person.id))
    .orderBy(sql`${payslips.paidOn} desc`)
    .limit(1)

  const basic = last ? Number(last.basic) : 500
  const allowances = last ? Number(last.allowances) : 0

  await db.insert(salaryStructures).values({
    userId: person.id,
    basic: basic.toFixed(2),
    // Split the old lump sum into named lines, which is what a payslip needs.
    transport: (allowances * 0.6).toFixed(2),
    housing: (allowances * 0.4).toFixed(2),
    other: '0.00',
    effectiveFrom: firstOfYear,
  })
  made += 1
}

console.log(`[payroll] wrote ${made} salary structure(s) for ${staff.length} active employee(s)`)
await closeDb()
