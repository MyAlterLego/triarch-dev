/**
 * Phase 37 TRIG-06 — server-component wrapper for the approval-audit page.
 *
 * Staff-only auth gate mirrors src/app/admin/platform/slack-audit/page.tsx.
 * Lighter than that page because the client component does its own fetching
 * (the row count is small in v2.4 — TMI pilot only — so client-only is
 * simpler than the slack-audit server-paginated pattern).
 *
 * Pitfall 9 (Next.js 16 async searchParams): no async params consumed here.
 * Filter state is derived inside ApprovalAuditClient via useSearchParams,
 * which is the recommended pattern and side-steps the async-params hazard.
 */
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import ApprovalAuditClient from './ApprovalAuditClient';

export default async function ApprovalAuditPage() {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/admin?error=forbidden');
  }
  return <ApprovalAuditClient />;
}
