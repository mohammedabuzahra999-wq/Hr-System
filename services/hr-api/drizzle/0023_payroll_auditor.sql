-- Payroll audit records are separate from payslips.  They explain and review a
-- calculation; they never change the calculation or approve it automatically.
DO $$ BEGIN
  CREATE TYPE "public"."payroll_audit_status" AS ENUM('running', 'completed', 'failed', 'stale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payroll_finding_severity" AS ENUM('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payroll_finding_status" AS ENUM('open', 'reviewed', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payroll_adjustment_kind" AS ENUM('overtime', 'bonus', 'allowance', 'deduction');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payroll_adjustment_status" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payroll_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" "payroll_adjustment_kind" NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "effective_on" date NOT NULL,
  "note" text NOT NULL,
  "status" "payroll_adjustment_status" DEFAULT 'pending' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_approved_by_users_id_fk"
    FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_adjustments_user_date_idx" ON "payroll_adjustments" USING btree ("user_id", "effective_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_adjustments_status_idx" ON "payroll_adjustments" USING btree ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payroll_audit_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "effective_from" date NOT NULL,
  "salary_change_percent" numeric(6, 4) DEFAULT '0.25' NOT NULL,
  "deduction_change_percent" numeric(6, 4) DEFAULT '0.35' NOT NULL,
  "overtime_monthly_threshold" numeric(12, 2) DEFAULT '250.00' NOT NULL,
  "min_history_months" integer DEFAULT 4 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_audit_settings" ADD CONSTRAINT "payroll_audit_settings_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payroll_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "calculated_at" timestamp with time zone NOT NULL,
  "status" "payroll_audit_status" DEFAULT 'running' NOT NULL,
  "settings_snapshot" jsonb NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_by" uuid,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "failure" text
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_audits" ADD CONSTRAINT "payroll_audits_run_id_payroll_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_audits" ADD CONSTRAINT "payroll_audits_started_by_users_id_fk"
    FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_audits_run_started_idx" ON "payroll_audits" USING btree ("run_id", "started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_audits_status_idx" ON "payroll_audits" USING btree ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payroll_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "audit_id" uuid NOT NULL,
  "user_id" uuid,
  "type" text NOT NULL,
  "severity" "payroll_finding_severity" NOT NULL,
  "status" "payroll_finding_status" DEFAULT 'open' NOT NULL,
  "facts" jsonb NOT NULL,
  "explanation" jsonb NOT NULL,
  "ai_explanation" jsonb,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_findings" ADD CONSTRAINT "payroll_findings_audit_id_payroll_audits_id_fk"
    FOREIGN KEY ("audit_id") REFERENCES "public"."payroll_audits"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_findings" ADD CONSTRAINT "payroll_findings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_findings" ADD CONSTRAINT "payroll_findings_reviewed_by_users_id_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_findings_audit_idx" ON "payroll_findings" USING btree ("audit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_findings_open_severity_idx" ON "payroll_findings" USING btree ("status", "severity");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_findings_user_idx" ON "payroll_findings" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payroll_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid,
  "audit_id" uuid,
  "finding_id" uuid,
  "actor_id" uuid,
  "event_type" text NOT NULL,
  "status" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_audit_events" ADD CONSTRAINT "payroll_audit_events_run_id_payroll_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_audit_events" ADD CONSTRAINT "payroll_audit_events_audit_id_payroll_audits_id_fk"
    FOREIGN KEY ("audit_id") REFERENCES "public"."payroll_audits"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_audit_events" ADD CONSTRAINT "payroll_audit_events_finding_id_payroll_findings_id_fk"
    FOREIGN KEY ("finding_id") REFERENCES "public"."payroll_findings"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_audit_events" ADD CONSTRAINT "payroll_audit_events_actor_id_users_id_fk"
    FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_audit_events_run_created_idx" ON "payroll_audit_events" USING btree ("run_id", "created_at");
