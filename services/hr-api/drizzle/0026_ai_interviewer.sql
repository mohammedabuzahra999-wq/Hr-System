CREATE TABLE "ai_interviews" (
  "id" uuid PRIMARY KEY, "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "attempt" integer NOT NULL, "version" integer NOT NULL, "last_sequence" integer NOT NULL DEFAULT 0,
  "snapshot" jsonb NOT NULL, "proposed_rubric" jsonb NOT NULL, "frozen_inputs" jsonb, "ready_at" timestamptz,
  "consent" jsonb, "invite_token_hash" text, "invite_expires_at" timestamptz, "invite_revoked_at" timestamptz, "invite_consumed_at" timestamptz,
  "candidate_session_hash" text, "candidate_session_expires_at" timestamptz, "candidate_session_version" integer NOT NULL DEFAULT 0,
  "runtime_owner" text NOT NULL, "last_observed_at" timestamptz NOT NULL, "pause_reason" text,
  "pending_effects" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ai_interviews_application_attempt" UNIQUE ("application_id", "attempt"),
  CONSTRAINT "ai_interviews_version_matches_snapshot" CHECK ("version" = ("snapshot"->>'version')::integer),
  CONSTRAINT "ai_interviews_valid_counters" CHECK ("version" >= 0 AND "last_sequence" >= 0 AND "attempt" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interviews_one_open_attempt" ON "ai_interviews" ("application_id") WHERE "snapshot"->>'status' IN ('CREATED','READY','ACTIVE','PAUSED');
CREATE UNIQUE INDEX "ai_interviews_invite_hash" ON "ai_interviews" ("invite_token_hash");
CREATE UNIQUE INDEX "ai_interviews_session_hash" ON "ai_interviews" ("candidate_session_hash");
--> statement-breakpoint
CREATE TABLE "ai_interview_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "interview_id" uuid NOT NULL REFERENCES "ai_interviews"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL, "record_type" text NOT NULL, "event_type" text NOT NULL,
  "event_id" text NOT NULL, "command_id" text NOT NULL, "state_version" integer NOT NULL,
  "source" text NOT NULL, "actor_id" text, "payload" jsonb NOT NULL, "created_at" timestamptz NOT NULL,
  CONSTRAINT "ai_interview_events_sequence" UNIQUE ("interview_id", "sequence"),
  CONSTRAINT "ai_interview_events_event_id" UNIQUE ("interview_id", "event_id"),
  CONSTRAINT "ai_interview_events_record_type" CHECK ("record_type" IN ('DOMAIN','COMMAND','AUDIT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interview_events_command_receipt" ON "ai_interview_events" ("interview_id", "command_id") WHERE "record_type" = 'COMMAND';
--> statement-breakpoint
CREATE TABLE "ai_interview_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "interview_id" uuid NOT NULL REFERENCES "ai_interviews"("id") ON DELETE CASCADE,
  "status" text NOT NULL, "report_version" integer NOT NULL, "last_included_sequence" integer NOT NULL,
  "input_hash" text NOT NULL, "evaluator_version" text NOT NULL, "rubric_version" text NOT NULL,
  "results" jsonb, "coverage" jsonb, "failure_code" text, "retry_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL, "updated_at" timestamptz NOT NULL, "completed_at" timestamptz,
  CONSTRAINT "ai_interview_evaluations_version" UNIQUE ("interview_id", "report_version"),
  CONSTRAINT "ai_interview_evaluations_status" CHECK ("status" IN ('PENDING','RUNNING','COMPLETED','FAILED'))
);
