ALTER TABLE "assistant_audit_events" ADD COLUMN "channel" text DEFAULT 'text' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_audit_events" ADD COLUMN "voice_session_id" uuid;
--> statement-breakpoint
CREATE INDEX "assistant_audit_voice_session_idx" ON "assistant_audit_events" USING btree ("voice_session_id","created_at");
