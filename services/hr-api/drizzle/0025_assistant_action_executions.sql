CREATE TABLE "assistant_action_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "assistant_action_executions" ADD CONSTRAINT "assistant_action_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_action_execution_user_operation_idx" ON "assistant_action_executions" USING btree ("user_id","operation_id");
--> statement-breakpoint
CREATE INDEX "assistant_action_execution_status_idx" ON "assistant_action_executions" USING btree ("status","created_at");
