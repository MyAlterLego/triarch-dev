import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, createMemoryNonceStore } from '@triarchsecurity/triarch-shared/internal-hmac';
import { getSecret } from '@triarchsecurity/secrets';
import { db } from '@/lib/db';
import { projects, releaseLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { promoteAndAudit } from '@/lib/release-promotion';

// Module-level nonce store — bounded by 10-min TTL via verifyRequest.
// Multi-instance FAH: each instance has its own store; replay window is 5 min skew,
// so cross-instance replay is bounded but not perfectly prevented. Acceptable per
// CONTEXT.md "timestamp + 5-min skew + monotonic counter optional" decision.
const nonceStore = createMemoryNonceStore();

export async function POST(req: NextRequest) {
  let secret: string;
  try {
    secret = await getSecret('INTERNAL_HMAC_SECRET');
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-hmac-signature');

  const verified = verifyRequest({ rawBody, signature, secret, nonceStore });
  if (!verified.ok) {
    // DO NOT log rawBody — may contain customer email + project info.
    console.warn(`[internal-dispatch] verify failed: ${verified.reason}`);
    const status = verified.reason === 'no_secret' ? 500 : 401;
    return NextResponse.json({ error: verified.reason }, { status });
  }

  // v2.4 Phase 36 (Pitfall 6): InternalHmacBody is now a discriminated union
  // on `intent`. This route serves the dispatch_promotion path only.
  if (verified.body.intent !== 'dispatch_promotion') {
    console.warn(`[internal-dispatch] rejected non-dispatch intent: ${verified.body.intent}`);
    return NextResponse.json({ error: 'wrong_intent' }, { status: 400 });
  }
  // verified.body is now narrowed to DispatchPromotionBody
  const { branch, version, projectKey, releaseId, actorEmail, slackChannelId, slackMessageTs } = verified.body;

  // Defense-in-depth: HMAC alone could be a forged customer signature claiming
  // a staff project. Verify project + release exist before dispatching.
  const [project] = await db
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.key, projectKey));

  if (!project) return NextResponse.json({ error: 'project_not_found' }, { status: 404 });

  const [release] = await db
    .select()
    .from(releaseLogs)
    .where(and(eq(releaseLogs.id, releaseId), eq(releaseLogs.project, projectKey)));

  if (!release) return NextResponse.json({ error: 'release_not_found' }, { status: 404 });

  // Sanity: branch + version match the release row (defense against forged HMAC body)
  if (release.branch !== branch || release.version !== version) {
    console.warn(
      `[internal-dispatch] body mismatch for release ${releaseId}: ` +
      `branch ${release.branch} vs ${branch}, version ${release.version} vs ${version}`,
    );
    return NextResponse.json({ error: 'body_mismatch' }, { status: 400 });
  }

  const result = await promoteAndAudit({
    release,
    actorEmail,                    // portal's customer admin email
    channelId: slackChannelId,     // typically null from portal
    messageTs: slackMessageTs,     // typically null from portal
    slackUserName: null,           // portal has no Slack user identity
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'dispatch_failed', detail: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
