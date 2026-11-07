-- A written interview, sent to one applicant for one vacancy.
--
-- Questions are generated from the job's own criteria and the candidate's own
-- CV, and the answers are judged against those same criteria — the ones HR
-- weighted on the scorecard. There is deliberately no second scoring scheme
-- here: a "Technical Knowledge: 8/10" invented for the occasion would be a
-- number with nothing behind it, which is what the weighted scorecard exists to
-- replace.
CREATE TYPE "interview_status" AS ENUM ('draft', 'sent', 'inProgress', 'completed', 'expired');

CREATE TABLE IF NOT EXISTS "interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "status" "interview_status" NOT NULL DEFAULT 'draft',

  -- The candidate's way in. Long, random, and the only credential they have:
  -- there is no account behind it, so it is the whole of the access control and
  -- is checked against one interview rather than looked up as a session.
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,

  -- What was judged, stored as written rather than recomputed later: the job
  -- description can be edited after an interview is taken, and an assessment
  -- that silently re-reads today's requirements is not the assessment anybody
  -- gave their answers to.
  "criteria" jsonb NOT NULL,
  "evaluation" jsonb,

  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  CONSTRAINT "interviews_one_per_application" UNIQUE ("application_id")
);

CREATE TABLE IF NOT EXISTS "interview_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interview_id" uuid NOT NULL REFERENCES "interviews"("id") ON DELETE CASCADE,
  "ordinal" integer NOT NULL,
  "text_en" text NOT NULL,
  "text_ar" text NOT NULL,

  -- Which requirement this question is probing, so an answer can be scored
  -- against the same criterion the CV was scored against. Null for an opening
  -- or closing question that belongs to no single requirement.
  "criterion_key" text,

  -- Set when this question was written in response to an answer rather than
  -- generated up front.
  "follow_up_to" uuid REFERENCES "interview_questions"("id") ON DELETE CASCADE,
  "asked_at" timestamptz,
  CONSTRAINT "interview_questions_order" UNIQUE ("interview_id", "ordinal")
);

CREATE TABLE IF NOT EXISTS "interview_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id" uuid NOT NULL UNIQUE REFERENCES "interview_questions"("id") ON DELETE CASCADE,
  "text" text NOT NULL,
  "answered_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "interviews_application_idx" ON "interviews" ("application_id");
CREATE INDEX IF NOT EXISTS "interview_questions_interview_idx" ON "interview_questions" ("interview_id");
