-- Reading a CV against the vacancy it was sent to.
--
-- Stored rather than computed on request, for two reasons that are really the
-- same reason: a score that changes between page loads cannot be acted on, and
-- "what did the system say about this applicant, and which prompt said it" is a
-- question asked months later by someone who was not there.
--
-- `content` holds the whole working — every requirement, its verdict, and the
-- line of the CV behind it — so the percentage on the screen is never the whole
-- record. `model` and `prompt_version` make an old result traceable to the
-- instructions that produced it.

CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cv_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"cv_file_id" uuid,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"content" jsonb,
	"failure" text,
	"model" text,
	"prompt_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"cv_characters" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_analyses_one_per_application" UNIQUE("application_id")
);--> statement-breakpoint

ALTER TABLE "cv_analyses" ADD CONSTRAINT "cv_analyses_application_id_applications_id_fk"
	FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_analyses" ADD CONSTRAINT "cv_analyses_cv_file_id_cv_files_id_fk"
	FOREIGN KEY ("cv_file_id") REFERENCES "public"."cv_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cv_analyses_application_idx" ON "cv_analyses" USING btree ("application_id");
