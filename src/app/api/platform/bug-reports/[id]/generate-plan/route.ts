import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { bugReportsWithPlan, workflowTransitions } from '@/db/schema';

/**
 * POST /api/platform/bug-reports/[id]/generate-plan
 *
 * Mirrors /api/platform/feature-requests/[id]/generate-plan but adapted for
 * the bug-report fields. A bug has description + steps_to_reproduce +
 * expected_behavior + actual_behavior (no use_case), so the prompt and
 * the JSON schema we ask Claude for are different.
 *
 * Auth and Anthropic key handling identical to the feature route.
 *
 * Writes plan back via `bugReportsWithPlan` because the shared
 * `bugReports` table definition is one version behind (does not declare
 * the plan columns added by migration 0022). See src/db/schema.ts for
 * the rationale and removal plan.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;

  const [bug] = await db
    .select()
    .from(bugReportsWithPlan)
    .where(eq(bugReportsWithPlan.id, id));
  if (!bug) {
    return NextResponse.json({ error: 'Bug report not found' }, { status: 404 });
  }

  const ctx = await getCurrentUserContext(session);
  const isMember =
    !!ctx && (ctx.isStaff || ctx.memberships.some((m) => m.project_key === bug.project));
  if (!isMember) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await db
      .update(bugReportsWithPlan)
      .set({ buildPlanStatus: 'failed', updatedAt: new Date() })
      .where(eq(bugReportsWithPlan.id, id));
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 },
    );
  }

  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Bug Report for project: ${bug.project}

Title: ${bug.title}

Severity: ${bug.severity}
Priority: ${bug.priority}

Description:
${bug.description}

Steps to Reproduce:
${bug.stepsToReproduce ?? 'Not provided'}

Expected Behavior:
${bug.expectedBehavior ?? 'Not provided'}

Actual Behavior:
${bug.actualBehavior ?? 'Not provided'}

Please generate a concise fix-plan JSON with the following structure:
{
  "summary": "string",
  "root_cause_hypothesis": "string",
  "estimated_effort": "small" | "medium" | "large",
  "fix_approach": "string",
  "files_likely_affected": ["string"],
  "implementation_steps": ["string"],
  "regression_risks": ["string"],
  "verification_steps": ["string"]
}

Return only valid JSON, no markdown.`;

  let buildPlan: Record<string, unknown>;
  try {
    const message = await anthropic.messages.create({
      // Same model pin as the feature route — keep them aligned so plan
      // outputs are comparable across entity types.
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are a senior engineer doing root-cause analysis for a software consultancy. Generate a concise fix plan JSON for the bug report. Return only valid JSON matching the requested structure, no markdown code blocks.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text =
      message.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? '';
    buildPlan = JSON.parse(text);
  } catch (err) {
    console.error('[generate-plan/bug] Claude API or JSON parse failed', { id, err });
    await db
      .update(bugReportsWithPlan)
      .set({ buildPlanStatus: 'failed', updatedAt: new Date() })
      .where(eq(bugReportsWithPlan.id, id));
    return NextResponse.json({ error: 'Build plan generation failed' }, { status: 500 });
  }

  // Persist plan + (optionally) promote 'submitted' → 'triaged' so the
  // bug exits the Kanban backlog bucket once the plan exists. For bugs
  // there's no 'plan_generated' status equivalent to features — 'triaged'
  // is the closest semantic match per the existing bug status taxonomy
  // ('submitted','triaged','approved','in_progress','fixed','closed','deferred').
  const result = await db.transaction(async (tx) => {
    const updates: Record<string, unknown> = {
      buildPlan,
      buildPlanStatus: 'ready',
      updatedAt: new Date(),
    };
    const promoteStatus = bug.status === 'submitted';
    if (promoteStatus) updates.status = 'triaged';

    const [row] = await tx
      .update(bugReportsWithPlan)
      .set(updates)
      .where(eq(bugReportsWithPlan.id, id))
      .returning();

    if (promoteStatus) {
      await tx.insert(workflowTransitions).values({
        entityType: 'bug_report',
        entityId: id,
        fromStatus: 'submitted',
        toStatus: 'triaged',
        transitionedBy: session!.user?.email ?? 'admin',
        reason: 'Fix plan generated by Claude',
        metadata: { source: 'generate-plan-route' },
      });
    }

    return row;
  });

  return NextResponse.json({ ok: true, buildPlan: result.buildPlan });
}
