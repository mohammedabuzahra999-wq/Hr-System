CREATE TYPE "public"."candidate_stage" AS ENUM('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."opening_status" AS ENUM('open', 'onHold', 'closed');--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"opening_id" uuid,
	"stage" "candidate_stage" DEFAULT 'applied' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"candidate_id" uuid,
	"file_name" text NOT NULL,
	"stored_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_files_one_owner" CHECK (("cv_files"."user_id" IS NULL) <> ("cv_files"."candidate_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "job_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_en" text NOT NULL,
	"title_ar" text NOT NULL,
	"department_en" text NOT NULL,
	"department_ar" text NOT NULL,
	"status" "opening_status" DEFAULT 'open' NOT NULL,
	"opened_on" date NOT NULL,
	"closed_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_opening_id_job_openings_id_fk" FOREIGN KEY ("opening_id") REFERENCES "public"."job_openings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_files" ADD CONSTRAINT "cv_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_files" ADD CONSTRAINT "cv_files_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_files" ADD CONSTRAINT "cv_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_opening_idx" ON "candidates" USING btree ("opening_id");--> statement-breakpoint
CREATE INDEX "candidates_stage_idx" ON "candidates" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "cv_files_user_idx" ON "cv_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cv_files_candidate_idx" ON "cv_files" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "job_openings_status_idx" ON "job_openings" USING btree ("status");