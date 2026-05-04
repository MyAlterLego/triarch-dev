ALTER TABLE "release_logs" ADD COLUMN "promotion_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "release_logs" ADD COLUMN "promotion_dispatched_by" varchar(256);