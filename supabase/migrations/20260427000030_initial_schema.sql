CREATE TYPE "public"."audience" AS ENUM('instructor', 'internal');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('project', 'instructor', 'client');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('assignment_overdue', 'schedule_conflict', 'low_satisfaction_assignment', 'dday_unprocessed', 'settlement_requested');--> statement-breakpoint
CREATE TYPE "public"."proficiency" AS ENUM('beginner', 'intermediate', 'advanced', 'expert');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('proposal', 'contract_confirmed', 'lecture_requested', 'instructor_sourcing', 'assignment_review', 'assignment_confirmed', 'education_confirmed', 'recruiting', 'progress_confirmed', 'in_progress', 'education_done', 'settlement_in_progress', 'task_done');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('education', 'material_development');--> statement-breakpoint
CREATE TYPE "public"."schedule_kind" AS ENUM('system_lecture', 'personal', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."settlement_flow" AS ENUM('corporate', 'government');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'requested', 'paid', 'held');--> statement-breakpoint
CREATE TYPE "public"."skill_tier" AS ENUM('large', 'medium', 'small');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('instructor', 'operator', 'admin');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "user_role" NOT NULL,
	"name_kr" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"owner_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pii_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caller_id" uuid,
	"target_instructor_id" uuid,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name_kr" text NOT NULL,
	"name_hanja" text,
	"name_en" text,
	"birth_date" date,
	"address" text,
	"email" text,
	"phone" text,
	"photo_file_id" uuid,
	"photo_storage_path" text,
	"resident_number_enc" "bytea",
	"bank_account_enc" "bytea",
	"business_number_enc" "bytea",
	"withholding_tax_rate_enc" "bytea",
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"issued_date" date,
	"expires_date" date,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "educations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"school" text NOT NULL,
	"major" text,
	"degree" text,
	"start_date" date,
	"end_date" date,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructor_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"title" text NOT NULL,
	"role" text,
	"start_date" date,
	"end_date" date,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "other_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"activity_date" date,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"published_date" date,
	"isbn" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"title" text NOT NULL,
	"organization" text,
	"start_date" date,
	"end_date" date,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"company" text NOT NULL,
	"position" text,
	"start_date" date,
	"end_date" date,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructor_skills" (
	"instructor_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"proficiency" "proficiency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_instructor_skills" UNIQUE("instructor_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "skill_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" "skill_tier" NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_skill_categories_tier_parent_name" UNIQUE("tier","parent_id","name")
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" text,
	"email" text,
	"phone" text,
	"sort_order" text DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"address" text,
	"business_license_file_id" uuid,
	"handover_memo" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "project_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_status" "project_status",
	"to_status" "project_status" NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"project_type" "project_type" DEFAULT 'education' NOT NULL,
	"status" "project_status" DEFAULT 'proposal' NOT NULL,
	"client_id" uuid NOT NULL,
	"operator_id" uuid,
	"instructor_id" uuid,
	"education_start_at" timestamp with time zone,
	"education_end_at" timestamp with time zone,
	"scheduled_at" date,
	"business_amount_krw" bigint DEFAULT 0 NOT NULL,
	"instructor_fee_krw" bigint DEFAULT 0 NOT NULL,
	"margin_krw" bigint GENERATED ALWAYS AS (business_amount_krw - instructor_fee_krw) STORED,
	"settlement_flow_hint" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "schedule_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"schedule_kind" "schedule_kind" NOT NULL,
	"project_id" uuid,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "settlement_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"from_status" "settlement_status",
	"to_status" "settlement_status" NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"settlement_flow" "settlement_flow" NOT NULL,
	"status" "settlement_status" DEFAULT 'pending' NOT NULL,
	"business_amount_krw" bigint NOT NULL,
	"instructor_fee_krw" bigint NOT NULL,
	"withholding_tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"profit_krw" bigint GENERATED ALWAYS AS (business_amount_krw - instructor_fee_krw) STORED,
	"withholding_tax_amount_krw" bigint GENERATED ALWAYS AS (floor(instructor_fee_krw * withholding_tax_rate / 100)::bigint) STORED,
	"payment_received_at" timestamp with time zone,
	"payout_sent_at" timestamp with time zone,
	"tax_invoice_issued" boolean DEFAULT false NOT NULL,
	"tax_invoice_issued_at" date,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "settlements_withholding_rate_check" CHECK ((
        (settlement_flow = 'corporate' AND withholding_tax_rate = 0)
        OR
        (settlement_flow = 'government' AND withholding_tax_rate IN (3.30, 8.80))
      ))
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid,
	"entity_type" "entity_type",
	"entity_id" uuid,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"audience" "audience" DEFAULT 'internal' NOT NULL,
	"body_markdown" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes_attachments" (
	"note_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"sort_order" text DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_instructor_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"top3_jsonb" jsonb NOT NULL,
	"adopted_instructor_id" uuid,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_resume_parses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_file_hash" text NOT NULL,
	"instructor_id" uuid,
	"parsed_json" jsonb NOT NULL,
	"model" text NOT NULL,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ai_resume_parses_hash" UNIQUE("input_file_hash")
);
--> statement-breakpoint
CREATE TABLE "ai_satisfaction_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"summary_text" text NOT NULL,
	"model" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "satisfaction_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	"comment" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_satisfaction_reviews_instructor_project" UNIQUE("instructor_id","project_id"),
	CONSTRAINT "satisfaction_reviews_score_range" CHECK (score BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "educations" ADD CONSTRAINT "educations_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_projects" ADD CONSTRAINT "instructor_projects_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_activities" ADD CONSTRAINT "other_activities_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_experiences" ADD CONSTRAINT "teaching_experiences_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_experiences" ADD CONSTRAINT "work_experiences_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_skills" ADD CONSTRAINT "instructor_skills_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_skills" ADD CONSTRAINT "instructor_skills_skill_id_skill_categories_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_categories" ADD CONSTRAINT "skill_categories_parent_id_skill_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skill_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_business_license_file_id_files_id_fk" FOREIGN KEY ("business_license_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_status_history" ADD CONSTRAINT "settlement_status_history_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_attachments" ADD CONSTRAINT "notes_attachments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_attachments" ADD CONSTRAINT "notes_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_instructor_recommendations" ADD CONSTRAINT "ai_instructor_recommendations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_instructor_recommendations" ADD CONSTRAINT "ai_instructor_recommendations_adopted_instructor_id_instructors_id_fk" FOREIGN KEY ("adopted_instructor_id") REFERENCES "public"."instructors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_resume_parses" ADD CONSTRAINT "ai_resume_parses_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_satisfaction_summaries" ADD CONSTRAINT "ai_satisfaction_summaries_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "satisfaction_reviews" ADD CONSTRAINT "satisfaction_reviews_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "satisfaction_reviews" ADD CONSTRAINT "satisfaction_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_files_owner" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_files_uploaded_at" ON "files" USING btree ("uploaded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_pii_access_log_caller" ON "pii_access_log" USING btree ("caller_id");--> statement-breakpoint
CREATE INDEX "idx_pii_access_log_target" ON "pii_access_log" USING btree ("target_instructor_id");--> statement-breakpoint
CREATE INDEX "idx_pii_access_log_accessed_at" ON "pii_access_log" USING btree ("accessed_at");--> statement-breakpoint
CREATE INDEX "idx_instructors_user_id" ON "instructors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_instructors_email" ON "instructors" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_instructors_deleted" ON "instructors" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_certifications_instructor" ON "certifications" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_educations_instructor" ON "educations" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_instructor_projects_instructor" ON "instructor_projects" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_other_activities_instructor" ON "other_activities" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_publications_instructor" ON "publications" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_teaching_experiences_instructor" ON "teaching_experiences" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_work_experiences_instructor" ON "work_experiences" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_instructor_skills_skill" ON "instructor_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "idx_skill_categories_tier" ON "skill_categories" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "idx_skill_categories_parent" ON "skill_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_client_contacts_client" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_clients_company" ON "clients" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "idx_clients_deleted" ON "clients" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_project_status_history_project" ON "project_status_history" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_status_history_changed_at" ON "project_status_history" USING btree ("changed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_projects_status" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_projects_client" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_projects_instructor" ON "projects" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_projects_operator" ON "projects" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "idx_projects_scheduled" ON "projects" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_projects_deleted" ON "projects" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_schedule_items_instructor" ON "schedule_items" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_items_project" ON "schedule_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_items_starts" ON "schedule_items" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_schedule_items_kind" ON "schedule_items" USING btree ("schedule_kind");--> statement-breakpoint
CREATE INDEX "idx_settlement_status_history_settlement" ON "settlement_status_history" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "idx_settlement_status_history_changed_at" ON "settlement_status_history" USING btree ("changed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_settlements_project" ON "settlements" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_settlements_instructor" ON "settlements" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_settlements_status" ON "settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_settlements_flow" ON "settlements" USING btree ("settlement_flow");--> statement-breakpoint
CREATE INDEX "idx_settlements_deleted" ON "settlements" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_comments_note" ON "comments" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_comments_entity" ON "comments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_comments_created_by" ON "comments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_notes_entity" ON "notes" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_notes_audience" ON "notes" USING btree ("audience");--> statement-breakpoint
CREATE INDEX "idx_notes_created_by" ON "notes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_notes_attachments_note" ON "notes_attachments" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_unread" ON "notifications" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ai_recommendations_project" ON "ai_instructor_recommendations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_ai_recommendations_adopted" ON "ai_instructor_recommendations" USING btree ("adopted_instructor_id");--> statement-breakpoint
CREATE INDEX "idx_ai_resume_parses_instructor" ON "ai_resume_parses" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_ai_satisfaction_summaries_instructor" ON "ai_satisfaction_summaries" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_ai_satisfaction_summaries_generated" ON "ai_satisfaction_summaries" USING btree ("generated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_satisfaction_reviews_instructor" ON "satisfaction_reviews" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_satisfaction_reviews_project" ON "satisfaction_reviews" USING btree ("project_id");