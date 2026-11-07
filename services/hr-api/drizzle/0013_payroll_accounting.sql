-- Payroll becomes a calculation instead of three stored numbers.
--
-- What was here before could record that somebody was paid; it could not work
-- out what they should be paid, or explain a figure afterwards. `deductions:
-- 118.50` answers no question anybody actually asks.
--
-- Four things arrive:
--   salary_structures  what a person is contracted to receive, dated, so a raise
--                      is a new row and March still recalculates to what March
--                      actually paid.
--   payroll_settings   the rates. In a table and not in the code, because
--                      Jordan's social security rates, its ceiling and its tax
--                      bands are set by law and change — and a rate compiled
--                      into a build is wrong on every payslip the month after it
--                      moves, silently. Each row is dated and each payslip
--                      records which one it used.
--   payroll_runs       one month, calculated, reviewed, approved. Approval is a
--                      separate act with a name and a time on it; nothing pays
--                      straight from a calculation.
--   payslips.lines     every line with its own name, amount and basis, so a
--                      payslip explains itself to the person holding it.

CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'approved', 'paid', 'cancelled');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "salary_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"basic" numeric(12, 2) NOT NULL,
	"transport" numeric(12, 2) DEFAULT '0' NOT NULL,
	"housing" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'JOD' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"social_security_exempt" boolean DEFAULT false NOT NULL,
	"dependants" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_created_by_users_id_fk"
	FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "salary_structures_user_idx" ON "salary_structures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "salary_structures_from_idx" ON "salary_structures" USING btree ("effective_from");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payroll_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_from" date NOT NULL,
	"ss_employee_rate" numeric(6, 4) NOT NULL,
	"ss_employer_rate" numeric(6, 4) NOT NULL,
	"ss_ceiling" numeric(12, 2) NOT NULL,
	"tax_personal_exemption" numeric(12, 2) NOT NULL,
	"tax_dependant_exemption" numeric(12, 2) NOT NULL,
	"tax_bands" jsonb NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_created_by_users_id_fk"
	FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"settings_id" uuid,
	"calculated_by" uuid,
	"calculated_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_period_key" UNIQUE("period_year","period_month")
);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_settings_id_payroll_settings_id_fk"
	FOREIGN KEY ("settings_id") REFERENCES "public"."payroll_settings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_calculated_by_users_id_fk"
	FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_users_id_fk"
	FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "run_id" uuid;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "lines" jsonb;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "working_days" integer;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "unpaid_days" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "employer_social_security" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;
