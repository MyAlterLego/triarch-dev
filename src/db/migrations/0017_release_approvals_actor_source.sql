-- Phase 22 WRITE-01: distinguish portal-origin vs admin-origin / Slack-origin approvals.
-- Schema declares actorSource as nullable varchar(16); legacy rows pre-Phase-22 have NULL.
-- Code paths that INSERT (admin's release-promotion.ts, portal's release-mutations.ts)
-- now stamp 'web' / 'slack' / 'portal' explicitly; old rows stay NULL and are tolerated.
ALTER TABLE "release_approvals" ADD COLUMN IF NOT EXISTS "actor_source" varchar(16);
