-- HR reviews an assessment draft before it is released to a candidate.
ALTER TABLE "interview_questions"
  ADD COLUMN IF NOT EXISTS "question_type" text NOT NULL DEFAULT 'written',
  ADD COLUMN IF NOT EXISTS "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "correct_option_id" text,
  ADD COLUMN IF NOT EXISTS "approval_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "review_feedback" text,
  ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz;
