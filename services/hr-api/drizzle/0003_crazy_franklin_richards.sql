CREATE TYPE "public"."announcement_kind" AS ENUM('general', 'holiday', 'meeting');--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "kind" "announcement_kind" DEFAULT 'general' NOT NULL;