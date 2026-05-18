import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { featureRequests, workflowTransitions } from '@/db/schema';

/**
 * POST /api/platform/feature-requests/[id]/generate-plan
 *
 * Generates a Claude-authored build plan for a feature request. Writes the
 * structured plan back to `build_plan` (jsonb) and flips
 * `build_plan_status` from 'pending' → 'ready' (or 'failed' on error).
 *
 * Adaptations from security-admin@7b133f1 origin (which is now a proxy):
 * - Auth: NextAuth session via `requireSignedIn` + membership check on the
 *   feature's project (mirrors the existing PATCH route in this directory).
 *   Replaces the x-internal-key header gate.
 * - Anthropic key: `process.env.ANTHROPIC_API_KEY` wired through Firebase
 *   App Hosting secret (apphosting.yaml). Replaces the original crmQuery +
 *   provider-keys decrypt path (platform has no equivalent infra and we
 *   don't want to port crm-db).
 * - Status audit: logs a `workflow_transitions` row when the status moves
 *   from 'submitted' → 'plan_generated' on a successful generation. Mirrors
 *   the existing PATCH route's audit behavior in this directory.
 */

// Force Node runtime: the Anthropic SDK uses Node streams.
export const runtime = 'nodejs';

// Build-plan generation can take 10-30s for larger contexts. Default
// route timeout in App Router is short; bump it explicitly.
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;

  // Fetch the feature row first so membership and existence are checked
  // in one round-trip.
  const [feature] = await db
    .select()
    .from(featureRequests)
    .where(eq(featureRequests.id, id));
  if (!feature) {
    return NextResponse.json({ error: 'Feature request not found' }, { status: 404 });
  }

  // Membership gate using the row we just fetched (mirrors PATCH route).
  const ctx = await getCurrentUserContext(session);
  const isMember =
    !!ctx && (ctx.isStaff || ctx.memberships.some((m) => m.project_key === feature.project));
  if (!isMember) {
    // Mirror PATCH: 404 instead of 403 to avoid leaking existence to
    // unauthorized users.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await db
      .update(featureRequests)
      .set({ buildPlanStatus: 'failed', updatedAt: new Date() })
      .where(eq(featureRequests.id, id));
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 },
    );
  }

  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Feature Request for project: ${feature.project}

Title: ${feature.title}

Description:
${feature.description}

Use Case:
${feature.useCase ?? 'Not provided'}

Please generate a concise build plan JSON with the following structure:
{
  "summary": "string",
  "estimated_effort": "small" | "medium" | "large" | "epic",
  "affected_areas": ["string"],
  "api_changes": ["string"],
  "ui_changes": ["string"],
  "database_changes": ["string"],
  "implementation_steps": ["string"],
  "estimated_versions": number,
  "risks": ["string"]
}

Return only valid JSON, no markdown.`;

  let buildPlan: Record<string, unknown>;
  try {
    const message = await anthropic.messages.create({
      // Pinned to Sonnet 4.6 — current per Mike's PAI CLAUDE.md model guidance
      // (Sonnet 4.6 or Opus 4.7 are current as of 2026-05). Bump explicitly
      // when a newer Sonnet ships; do not rely on alias 'claude-sonnet-latest'
      // for an auditable cost / behavior surface.
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are a technical project planner for a software consultancy. Generate a concise build plan JSON for the following feature request. Return only valid JSON matching the requested structure, no markdown code blocks.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text =
      message.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? '';
    buildPlan = JSON.parse(text);
  } catch (err) {
    console.error('[generate-plan/feature] Claude API or JSON parse failed', { id, err });
    await db
      .update(featureRequests)
      .set({ buildPlanStatus: 'failed', updatedAt: new Date() })
      .where(eq(featureRequests.id, id));
    return NextResponse.json({ error: 'Build plan generation failed' }, { status: 500 });
  }

  // Persist plan + flip status, and log the status transition if it moved.
  // Use a single transaction so the audit row and the row update commit
  // atomically (mirrors PATCH route).
  const result = await db.transaction(async (tx) => {
    const updates: Record<string, unknown> = {
      buildPlan,
      buildPlanStatus: 'ready',
      updatedAt: new Date(),
    };
    // Promote 'submitted' → 'plan_generated' so the Kanban moves it from the
    // backlog bucket. Don't trample non-submitted statuses (e.g. already-approved).
    const promoteStatus = feature.status === 'submitted';
    if (promoteStatus) updates.status = 'plan_generated';

    const [row] = await tx
      .update(featureRequests)
      .set(updates)
      .where(eq(featureRequests.id, id))
      .returning();

    if (promoteStatus) {
      await tx.insert(workflowTransitions).values({
        entityType: 'feature_request',
        entityId: id,
        fromStatus: 'submitted',
        toStatus: 'plan_generated',
        transitionedBy: session!.user?.email ?? 'admin',
        // Mark this transition as agent-driven (Claude) so the audit log
        // can distinguish operator-triggered from system-triggered moves.
        reason: 'Build plan generated by Claude',
        metadata: { source: 'generate-plan-route' },
      });
    }

    return row;
  });

  return NextResponse.json({ ok: true, buildPlan: result.buildPlan });
}
