-- Recruitment: applications become their own table.
--
-- Written by hand rather than generated, because the important half of this
-- migration is the data move in step 5. Before it, a candidate row *was* an
-- application: it carried `opening_id` and `stage`. A person who applied twice
-- became two people, and their history was unreachable. Dropping those columns
-- without first turning every existing pairing into an `applications` row would
-- silently destroy the only record of who applied to what.
--
-- Order matters throughout: the status type, then new columns, then the new
-- tables, then the data, and only then the drops.


--> statement-breakpoint
-- 1. A vacancy now starts as a draft, and publishing is a real transition.
--
-- The value is added by replacing the type, not by `ALTER TYPE … ADD VALUE`.
-- PostgreSQL forbids *using* a value added that way until its transaction has
-- committed, and the next statement here sets it as a column default. Drizzle
-- runs every pending migration inside one transaction, so splitting this across
-- two files does not help either — it is the same transaction. Building a fresh
-- type and swapping the column onto it has no such restriction.
CREATE TYPE "public"."opening_status_new" AS ENUM('draft', 'open', 'onHold', 'closed');--> statement-breakpoint
ALTER TABLE "job_openings" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "job_openings" ALTER COLUMN "status" TYPE "public"."opening_status_new"
	USING "status"::text::"public"."opening_status_new";--> statement-breakpoint
DROP TYPE "public"."opening_status";--> statement-breakpoint
ALTER TYPE "public"."opening_status_new" RENAME TO "opening_status";
--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('new', 'underReview', 'shortlisted', 'interview', 'offer', 'hired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."application_source" AS ENUM('careers', 'manual', 'referral');--> statement-breakpoint
CREATE TYPE "public"."publication_platform" AS ENUM('careers', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('pending', 'published', 'failed');--> statement-breakpoint

-- 2. What a public job page has to show.
ALTER TABLE "job_openings" ADD COLUMN IF NOT EXISTS "location_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN IF NOT EXISTS "location_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN IF NOT EXISTS "employment_type" "employment_type";--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN IF NOT EXISTS "deadline" date;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN IF NOT EXISTS "public_slug" text;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_openings" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_public_slug_unique" UNIQUE("public_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_openings_slug_idx" ON "job_openings" USING btree ("public_slug");--> statement-breakpoint

-- 3. What an applicant tells us about themselves.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "education" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "experience" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "skills" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "portfolio_url" text;--> statement-breakpoint

-- 4. The new tables.
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opening_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'new' NOT NULL,
	"source" "application_source" DEFAULT 'careers' NOT NULL,
	"cover_letter" text,
	"decision_note" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_one_per_opening" UNIQUE("opening_id","candidate_id")
);--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_opening_id_job_openings_id_fk"
	FOREIGN KEY ("opening_id") REFERENCES "public"."job_openings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk"
	FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_opening_idx" ON "applications" USING btree ("opening_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_candidate_idx" ON "applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opening_id" uuid NOT NULL,
	"platform" "publication_platform" NOT NULL,
	"status" "publication_status" DEFAULT 'pending' NOT NULL,
	"external_job_id" text,
	"error_message" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_publications_one_per_platform" UNIQUE("opening_id","platform")
);--> statement-breakpoint
ALTER TABLE "job_publications" ADD CONSTRAINT "job_publications_opening_id_job_openings_id_fk"
	FOREIGN KEY ("opening_id") REFERENCES "public"."job_openings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_publications_opening_idx" ON "job_publications" USING btree ("opening_id");--> statement-breakpoint

-- 5. Carry every existing pairing across before the columns that hold it are gone.
--
-- The stage names changed with the move, so they are mapped rather than cast:
-- `applied` and `screening` were one step in the old model and are two here.
-- A candidate with no opening had no application to carry — they stay a person
-- in the book with no application, which is exactly what they were.
INSERT INTO "applications" ("opening_id", "candidate_id", "status", "source", "applied_at", "updated_at")
SELECT
	c."opening_id",
	c."id",
	(CASE c."stage"::text
		WHEN 'applied'   THEN 'new'
		WHEN 'screening' THEN 'underReview'
		WHEN 'interview' THEN 'interview'
		WHEN 'offer'     THEN 'offer'
		WHEN 'hired'     THEN 'hired'
		WHEN 'rejected'  THEN 'rejected'
		ELSE 'new'
	END)::"application_status",
	'manual'::"application_source",
	c."created_at",
	c."updated_at"
FROM "candidates" c
WHERE c."opening_id" IS NOT NULL
ON CONFLICT ("opening_id","candidate_id") DO NOTHING;--> statement-breakpoint

-- 6. Only now are the old columns safe to drop.
DROP INDEX IF EXISTS "candidates_opening_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "candidates_stage_idx";--> statement-breakpoint
ALTER TABLE "candidates" DROP COLUMN IF EXISTS "opening_id";--> statement-breakpoint
ALTER TABLE "candidates" DROP COLUMN IF EXISTS "stage";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."candidate_stage";--> statement-breakpoint

-- 7. One person, one record — how a returning applicant is recognised instead
-- of duplicated. Partial, because a candidate typed in from a paper CV may have
-- no email, and several of those must still be allowed.
CREATE UNIQUE INDEX IF NOT EXISTS "candidates_email_key"
	ON "candidates" USING btree (lower("email")) WHERE "email" IS NOT NULL;
