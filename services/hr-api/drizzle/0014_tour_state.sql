-- Whether somebody has been shown the introductory tour.
--
-- A timestamp, not a boolean: "has seen it" and "saw it in March, before half
-- these screens existed" are different facts, and only the second can be acted
-- on when the system grows. Null means never.
--
-- Skipping is recorded the same as finishing. Somebody who dismissed the tour
-- has made a decision; offering it again every login is the software ignoring
-- them.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tour_completed_at" timestamp with time zone;
