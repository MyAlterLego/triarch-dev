CREATE INDEX "release_logs_project_env_deployed_idx" ON "release_logs" USING btree ("project","env","deployed_at" DESC NULLS LAST);
