CREATE TABLE "assistant_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"role" "role" NOT NULL,
	"event_type" text NOT NULL,
	"intent" text,
	"tool" text,
	"status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_audit_events" ADD CONSTRAINT "assistant_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assistant_audit_user_created_idx" ON "assistant_audit_events" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "assistant_audit_created_idx" ON "assistant_audit_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "assistant_audit_status_idx" ON "assistant_audit_events" USING btree ("status");
