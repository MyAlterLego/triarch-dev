import { db } from '@/lib/db';
import { releaseLogs, releaseApprovals } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';

export const REASON_MAX_CHARS = 500;

export type ReleaseRow = typeof releaseLogs.$inferSelect;
export type ApprovalRow = typeof releaseApprovals.$inferSelect;

export type ApproveInput = {
  release: ReleaseRow;
  approverEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
  actorSource?: 'web' | 'slack' | null;  // defaults to 'web' if undefined
};

export type ApproveResult =
  | { ok: true; alreadyApproved: boolean; release: { id: string; status: string | null }; approval: ApprovalRow | null }
  | { ok: false; code: 'invalid_status'; currentStatus: string; message: string };

export async function approveRelease(input: ApproveInput): Promise<ApproveResult> {
  const { release, approverEmail, ipAddress, userAgent, actorSource } = input;

  // Idempotent short-circuit — preserve Phase 2 behavior exactly
  if (release.status === 'approved') {
    const [existing] = await db
      .select()
      .from(releaseApprovals)
      .where(and(eq(releaseApprovals.releaseId, release.id), eq(releaseApprovals.decision, 'approved')))
      .orderBy(desc(releaseApprovals.approvedAt))
      .limit(1);
    return {
      ok: true,
      alreadyApproved: true,
      release: { id: release.id, status: release.status },
      approval: existing ?? null,
    };
  }

  const currentStatus = release.status ?? 'dev';
  if (currentStatus !== 'dev') {
    return {
      ok: false,
      code: 'invalid_status',
      currentStatus,
      message: `Cannot approve a release in status '${currentStatus}'`,
    };
  }

  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(releaseApprovals)
      .values({ releaseId: release.id, approverEmail, decision: 'approved', ipAddress, userAgent, reason: null, actorSource: actorSource ?? 'web' })
      .returning();
    const [updated] = await tx
      .update(releaseLogs)
      .set({ status: 'approved' })
      .where(eq(releaseLogs.id, release.id))
      .returning({ id: releaseLogs.id, status: releaseLogs.status });
    return { inserted, updated };
  });

  return {
    ok: true,
    alreadyApproved: false,
    release: { id: result.updated.id, status: result.updated.status },
    approval: result.inserted,
  };
}

export type RejectInput = {
  release: ReleaseRow;
  approverEmail: string;
  reason: string;
  ipAddress: string | null;
  userAgent: string | null;
  actorSource?: 'web' | 'slack' | null;  // defaults to 'web' if undefined
};

export type RejectResult =
  | { ok: true; release: { id: string; status: string | null }; approval: ApprovalRow }
  | { ok: false; code: 'invalid_reason' | 'invalid_status'; currentStatus?: string; message: string };

export async function rejectRelease(input: RejectInput): Promise<RejectResult> {
  const { release, approverEmail, ipAddress, userAgent, actorSource } = input;
  const trimmed = (input.reason ?? '').trim();
  if (!trimmed) {
    return { ok: false, code: 'invalid_reason', message: 'Rejection reason is required' };
  }
  if (trimmed.length > REASON_MAX_CHARS) {
    return { ok: false, code: 'invalid_reason', message: 'Reason exceeds 500 characters' };
  }

  const currentStatus = release.status ?? 'dev';
  if (currentStatus !== 'dev') {
    return {
      ok: false,
      code: 'invalid_status',
      currentStatus,
      message: `Cannot reject a release in status '${currentStatus}'`,
    };
  }

  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(releaseApprovals)
      .values({ releaseId: release.id, approverEmail, decision: 'rejected', ipAddress, userAgent, reason: trimmed, actorSource: actorSource ?? 'web' })
      .returning();
    const [updated] = await tx
      .update(releaseLogs)
      .set({ status: 'rejected' })
      .where(eq(releaseLogs.id, release.id))
      .returning({ id: releaseLogs.id, status: releaseLogs.status });
    return { inserted, updated };
  });

  return {
    ok: true,
    release: { id: result.updated.id, status: result.updated.status },
    approval: result.inserted,
  };
}
