// src/lib/agent-projections.ts
//
// Snake_case projection helpers for the /api/agents/projects/* endpoints.
// Keeps the wire format consistent — agent consumers (MCP tools, skills,
// briefing flows) parse snake_case while the Drizzle row types are camelCase.
//
// Sitting H — admin.triarch.dev side. Mirrors the convention used by
// admin.triarchsecurity.com's agent-projections.ts.

import type { projects, bugReports, featureRequests, releaseLogs } from '@/db/schema';

type ProjectRow = typeof projects.$inferSelect;
type BugRow = typeof bugReports.$inferSelect;
type FeatureRow = typeof featureRequests.$inferSelect;
type ReleaseRow = typeof releaseLogs.$inferSelect;

export function projectProject(r: ProjectRow) {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    status: r.status,
    firebase_project_id: r.firebaseProjectId,
    crdb_cluster: r.crdbCluster,
    crdb_database: r.crdbDatabase,
    crdb_user: r.crdbUser,
    subdomain: r.subdomain,
    custom_domain: r.customDomain,
    deployed_url: r.deployedUrl,
    github_repo: r.githubRepo,
    tech_stack: r.techStack,
    current_version: r.currentVersion,
    ecosystem: r.ecosystem,
    slack_channel_id: r.slackChannelId,
    metadata: r.metadata,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export function projectBug(r: BugRow) {
  return {
    id: r.id,
    project: r.project,
    reported_by_user_id: r.reportedByUserId,
    reported_by_name: r.reportedByName,
    reported_by_email: r.reportedByEmail,
    title: r.title,
    description: r.description,
    steps_to_reproduce: r.stepsToReproduce,
    expected_behavior: r.expectedBehavior,
    actual_behavior: r.actualBehavior,
    severity: r.severity,
    priority: r.priority,
    status: r.status,
    screenshot_urls: r.screenshotUrls,
    page_url: r.pageUrl,
    browser_info: r.browserInfo,
    fix_commit_sha: r.fixCommitSha,
    fix_version: r.fixVersion,
    triarch_notes: r.triarchNotes,
    resolved_at: r.resolvedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export function projectFeature(r: FeatureRow) {
  return {
    id: r.id,
    project: r.project,
    requested_by_user_id: r.requestedByUserId,
    requested_by_name: r.requestedByName,
    requested_by_email: r.requestedByEmail,
    title: r.title,
    description: r.description,
    use_case: r.useCase,
    priority: r.priority,
    status: r.status,
    build_plan: r.buildPlan,
    build_plan_status: r.buildPlanStatus,
    estimated_effort: r.estimatedEffort,
    target_version: r.targetVersion,
    shipped_version: r.shippedVersion,
    triarch_notes: r.triarchNotes,
    upvotes: r.upvotes,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export function projectRelease(r: ReleaseRow) {
  return {
    id: r.id,
    project: r.project,
    version: r.version,
    release_type: r.releaseType,
    released_at: r.releasedAt,
    released_by: r.releasedBy,
    summary: r.summary,
    env: r.env,
    status: r.status,
    commit_sha: r.commitSha,
    deployed_at: r.deployedAt,
    branch: r.branch,
    promotion_dispatched_at: r.promotionDispatchedAt,
    promotion_dispatched_by: r.promotionDispatchedBy,
    metadata: r.metadata,
    created_at: r.createdAt,
  };
}
