CREATE TABLE "release_log_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"link_type" varchar(16) NOT NULL,
	"bug_id" uuid,
	"feature_id" uuid,
	"external_url" text,
	"source" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "preview_branch_locked" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "preview_branch_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "release_log_links" ADD CONSTRAINT "release_log_links_release_id_release_logs_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_log_links" ADD CONSTRAINT "release_log_links_bug_id_bug_reports_id_fk" FOREIGN KEY ("bug_id") REFERENCES "public"."bug_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_log_links" ADD CONSTRAINT "release_log_links_feature_id_feature_requests_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."feature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_log_links_release_id_idx" ON "release_log_links" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "release_log_links_bug_id_idx" ON "release_log_links" USING btree ("bug_id");--> statement-breakpoint
CREATE INDEX "release_log_links_feature_id_idx" ON "release_log_links" USING btree ("feature_id");--> statement-breakpoint
ALTER TABLE "release_log_links" ADD CONSTRAINT "release_log_links_link_type_discriminant"
  CHECK (
    (link_type = 'bug' AND bug_id IS NOT NULL AND feature_id IS NULL AND external_url IS NULL)
    OR (link_type = 'feature' AND feature_id IS NOT NULL AND bug_id IS NULL AND external_url IS NULL)
    OR (link_type = 'external' AND external_url IS NOT NULL AND bug_id IS NULL AND feature_id IS NULL)
  );