-- A scheduled assessment opens at one precise moment and closes after the
-- duration HR selected. Existing sent links keep their previous expiry because
-- opens_at stays null for them.
ALTER TABLE "interviews"
  ADD COLUMN IF NOT EXISTS "opens_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "duration_minutes" integer NOT NULL DEFAULT 60;

ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_duration_minutes_range"
  CHECK ("duration_minutes" BETWEEN 15 AND 240);

CREATE INDEX IF NOT EXISTS "interviews_opens_at_idx" ON "interviews" ("opens_at");
