CREATE TABLE IF NOT EXISTS "assistant_unanswered_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "role" "role" NOT NULL,
  "question" text NOT NULL,
  "intent" text,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assistant_unanswered_questions"
    ADD CONSTRAINT "assistant_unanswered_questions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_unanswered_created_idx" ON "assistant_unanswered_questions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_unanswered_reason_idx" ON "assistant_unanswered_questions" USING btree ("reason");
