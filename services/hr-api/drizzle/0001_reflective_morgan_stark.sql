CREATE TYPE "public"."calendar_event_kind" AS ENUM('meeting', 'training', 'holiday');--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "calendar_event_kind" DEFAULT 'meeting' NOT NULL,
	"title_en" text NOT NULL,
	"title_ar" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"team_of_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_team_of_id_users_id_fk" FOREIGN KEY ("team_of_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_starts_idx" ON "calendar_events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "calendar_team_idx" ON "calendar_events" USING btree ("team_of_id");