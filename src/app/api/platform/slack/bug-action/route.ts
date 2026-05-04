import { NextRequest, NextResponse } from 'next/server';
import { handleBugAction } from '@/lib/slack-actions/bug';
import type { SlackInteractivePayload } from '@/lib/slack-actions';

/**
 * Legacy direct entry point for OttoBot bug-action button clicks.
 * Preferred entry point is /api/slack/interact (signature-verified dispatcher).
 * Kept for backward compatibility with any existing Slack App configuration
 * still pointing here.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const payloadStr = formData.get('payload') as string;
  if (!payloadStr) {
    return NextResponse.json({ error: 'No payload' }, { status: 400 });
  }

  let payload: SlackInteractivePayload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  const action = payload.actions?.[0];
  if (!action) {
    return NextResponse.json({ error: 'No action' }, { status: 400 });
  }

  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 512) ?? null;

  const result = await handleBugAction({ payload, action, rawBody: '', ipAddress, userAgent });
  return NextResponse.json(result);
}
