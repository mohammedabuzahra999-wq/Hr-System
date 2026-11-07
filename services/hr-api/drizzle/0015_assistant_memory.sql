CREATE TABLE IF NOT EXISTS "assistant_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalised" text NOT NULL,
	"role" "role" NOT NULL,
	"kind" text NOT NULL,
	"intent" text,
	"action" text,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"refused_count" integer DEFAULT 0 NOT NULL,
	"last_refusal" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_memory_key_idx" ON "assistant_memory" USING btree ("normalised","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_memory_refused_idx" ON "assistant_memory" USING btree ("refused_count");
