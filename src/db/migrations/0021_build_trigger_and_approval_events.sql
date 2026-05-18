ALTER TABLE "projects" ADD COLUMN "build_trigger_mode" varchar(32) DEFAULT 'local_claude' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "local_path" varchar(512);--> statement-breakpoint
CREATE TABLE "approval_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" varchar(128) NOT NULL,
	"decision" varchar(32) NOT NULL,
	"surface" varchar(16) NOT NULL,
	"actor_email" varchar(256) NOT NULL,
	"comment" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"project" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "approval_events_subject_idx" ON "approval_events" ("subject_type","subject_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "approval_events_project_idx" ON "approval_events" ("project","created_at" DESC);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_build_trigger_mode_check"
  CHECK (build_trigger_mode IN ('local_claude', 'managed_agent', 'manual'));
