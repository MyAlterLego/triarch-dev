import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { requireStaff } from '@/lib/api-auth';
import { promoteAndAudit } from '@/lib/release-promotion';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth — staff only
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const actorEmail = auth.session!.user!.email!;

  // 2. Resolve release
  const { id } = await params;
  const [release] = await db.select().from(releaseLogs).where(eq(releaseLogs.id, id));
  if (!release) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // 3. Status guard — only 'approved' releases can be promoted
  if (release.status !== 'approved') {
    return NextResponse.json(
      { error: 'invalid_status', currentStatus: release.status ?? 'dev' },
      { status: 400 },
    );
  }

  // 4. Atomic race guard via conditional UPDATE-with-WHERE-IS-NULL
  //    Exactly one concurrent caller gets a row back (race won → proceeds to dispatch);
  //    the other gets an empty array (race lost → 409).
  const [claimed] = await db
    .update(releaseLogs)
    .set({
      promotionDispatchedAt: new Date(),
      promotionDispatchedBy: actorEmail,
    })
    .where(and(eq(releaseLogs.id, id), isNull(releaseLogs.promotionDispatchedAt)))
    .returning({
      id: releaseLogs.id,
      promotionDispatchedAt: releaseLogs.promotionDispatchedAt,
      promotionDispatchedBy: releaseLogs.promotionDispatchedBy,
    });

  if (!claimed) {
    // Lost the race — re-read to surface who beat us
    const [current] = await db
      .select({
        promotionDispatchedAt: releaseLogs.promotionDispatchedAt,
        promotionDispatchedBy: releaseLogs.promotionDispatchedBy,
      })
      .from(releaseLogs)
      .where(eq(releaseLogs.id, id));
    return NextResponse.json(
      {
        error: 'already_promoted',
        dispatched_by: current?.promotionDispatchedBy ?? null,
        dispatched_at: current?.promotionDispatchedAt?.toISOString() ?? null,
      },
      { status: 409 },
    );
  }

  // 5. Dispatch — awaited (not fire-and-forget) so the route returns the result
  //    inline for PROM-05's "in-flight then surfaces result" UX.
  //    The Slack 3-second rule does NOT apply — this route is called from the
  //    staff browser, not from Slack. The client-side spinner covers the wait.
  const result = await promoteAndAudit({
    release,
    actorEmail,
    channelId: null,
    messageTs: null,
    slackUserName: null,
  });

  if (!result.ok) {
    // HTTP 200 because the request was processed — the atomic UPDATE already
    // happened and promoteAndAudit wrote the audit row. The caller uses ok:false
    // as the failure signal and surfaces the error pill (PROM-05).
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
