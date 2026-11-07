CREATE TYPE "public"."employment_type" AS ENUM('fullTime', 'partTime', 'contract', 'temporary');--> statement-breakpoint
CREATE TYPE "public"."job_description_status" AS ENUM('draft', 'approved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."job_level" AS ENUM('intern', 'junior', 'mid', 'senior', 'lead', 'manager');--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"job_description_id" uuid,
	"requested_by" uuid,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"ok" boolean NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "job_description_status" DEFAULT 'draft' NOT NULL,
	"title_en" text NOT NULL,
	"title_ar" text NOT NULL,
	"department_en" text DEFAULT '' NOT NULL,
	"department_ar" text DEFAULT '' NOT NULL,
	"level" "job_level",
	"employment_type" "employment_type",
	"content" jsonb NOT NULL,
	"opening_id" uuid,
	"model" text,
	"prompt_version" text,
	"generated_by" uuid,
	"generated_at" timestamp with time zone,
	"edited_by_human" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_opening_id_job_openings_id_fk" FOREIGN KEY ("opening_id") REFERENCES "public"."job_openings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_created_idx" ON "ai_generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_descriptions_status_idx" ON "job_descriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_descriptions_opening_idx" ON "job_descriptions" USING btree ("opening_id");