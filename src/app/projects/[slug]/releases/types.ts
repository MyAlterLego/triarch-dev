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
}
