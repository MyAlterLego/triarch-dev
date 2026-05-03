import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { backfillWebhookForProject, WebhookBackfillResult } from '@/lib/webhook-backfill';

/**
 * POST /api/platform/webhooks/backfill
 *
 * Walk the project registry and install the github-deploy webhook on
 * every repo that doesn't already have it. Idempotent.
 *
 * Body: { key?: string }
 *   - key: backfill only this project (default: all)
 *
 * Required env: GITHUB_TOKEN, DEPLOY_WEBHOOK_URL, DEPLOY_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const ghToken = process.env.GITHUB_TOKEN;
  const webhookUrl = process.env.DEPLOY_WEBHOOK_URL;
  const webhookSecret = process.env.DEPLOY_WEBHOOK_SECRET;
  const missing = [
    !ghToken && 'GITHUB_TOKEN',
    !webhookUrl && 'DEPLOY_WEBHOOK_URL',
    !webhookSecret && 'DEPLOY_WEBHOOK_SECRET',
  ].filter(Boolean);
  if (missing.length) {
    return NextResponse.json({ error: `Missing env: ${missing.join(', ')}` }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { key } = body as { key?: string };
  const rows = key
    ? await db.select().from(projects).where(eq(projects.key, key))
    : await db.select().from(projects);

  if (key && rows.length === 0) {
    return NextResponse.json({ error: `No project with key=${key}` }, { status: 404 });
  }

  const results: WebhookBackfillResult[] = [];
  for (const project of rows) {
    const r = await backfillWebhookForProject(project, webhookUrl!, webhookSecret!, ghToken!);
    results.push(r);
  }

  const summary = {
    installed: results.filter((r) => r.status === 'installed').length,
    already_present: results.filter((r) => r.status === 'already_present').length,
    repo_missing: results.filter((r) => r.status === 'repo_missing').length,
    no_repo: results.filter((r) => r.status === 'no_repo').length,
    error: results.filter((r) => r.status === 'error').length,
  };
  return NextResponse.json({ results, summary });
}
