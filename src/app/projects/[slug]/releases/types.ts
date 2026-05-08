export type { EntryTypeCounts, WhatsComingSummary } from '@/lib/release-entry-summary';

export type ReleaseStatus = 'dev' | 'pending_approval' | 'approved' | 'rejected' | 'promoted';
export type ReleaseEnv = 'dev' | 'prod';
export type UserRole = 'admin' | 'viewer';  // staff is treated as admin for action gating

export interface FeedbackItem {
  id: string;
  releaseId: string;
  authorEmail: string;
  body: string;
  createdAt: string;  // ISO
}

export interface ApprovalItem {
  id: string;
  releaseId: string;
  approverEmail: string;
  decision: 'approved' | 'rejected';
  approvedAt: string;  // ISO
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ReleaseRow {
  id: string;
  project: string;
  version: string;
  env: ReleaseEnv | null;
  status: ReleaseStatus | null;
  commitSha: string | null;
  deployedAt: string | null;  // ISO; falls back to releasedAt in display
  releasedAt: string;
  releasedBy: string | null;
  summary: string | null;
  feedback: FeedbackItem[];
  approvals: ApprovalItem[];
  // Phase 05-02: promotion dispatch audit + paired prod row (populated for dev rows only)
  promotionDispatchedAt: string | null;
  promotionDispatchedBy: string | null;
  pairedProd: {
    id: string;
    deployedAt: string | null;
    releasedAt: string;
    releasedBy: string | null;
    commitSha: string | null;
  } | null;
  // ── v2.0 Phase 5: multi-branch RC support ──
  branch: string | null;                          // from release_logs.branch (nullable for legacy rows; treat null as 'main')
  metadata: Record<string, unknown> | null;       // from release_logs.metadata; reads .previewUrl
}

// ── v2.0 Phase 5: BranchSection grouping ───────────────────────────

export interface ConflictState {
  files: string[];          // from promote_attempts.conflict_files JSONB (always an array — schema default([]))
  rebaseError: string | null;
  createdAt: string;        // ISO of promote_attempts.created_at
}

export interface BranchAggregate {
  pending: number;          // count of releases with status='pending_approval' in the section
  promoted: number;         // count of releases with status='promoted' in the section
  conflict: boolean;        // mirrors `section.conflict !== null`
}

export interface BranchSection {
  branch: string;           // 'main' or the feature branch name; never null (callers normalise)
  releases: ReleaseRow[];   // releases for this branch in display order
  conflict: ConflictState | null;
  maxDeployedAt: string | null;  // ISO; max(deployedAt ?? releasedAt) over releases; used for sort + header timestamp
  isActive: boolean;        // drives default-expanded state — true if maxDeployedAt within 30 days OR latest status non-terminal
  aggregate: BranchAggregate;
}
