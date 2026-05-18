ALTER TABLE "bug_reports" ADD COLUMN "inclusion_state" varchar(32) DEFAULT 'triaged' NOT NULL;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "next_release_log_id" uuid;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "inclusion_state" varchar(32) DEFAULT 'triaged' NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "next_release_log_id" uuid;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_next_release_log_id_release_logs_id_fk" FOREIGN KEY ("next_release_log_id") REFERENCES "public"."release_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_next_release_log_id_release_logs_id_fk" FOREIGN KEY ("next_release_log_id") REFERENCES "public"."release_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_inclusion_state_check"
  CHECK (inclusion_state IN ('triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'));
--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_inclusion_state_check"
  CHECK (inclusion_state IN ('triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'));
--> statement-breakpoint
CREATE INDEX "bug_reports_project_approved_for_build_idx"
  ON "bug_reports" ("project") WHERE "inclusion_state" = 'approved_for_build';
--> statement-breakpoint
CREATE INDEX "feature_requests_project_approved_for_build_idx"
  ON "feature_requests" ("project") WHERE "inclusion_state" = 'approved_for_build';
