import { signPayload } from '@/lib/slack-crypto';
import { getSecret } from '@myalterlego/secrets';

// Channel envs are NOT secrets — keep as process.env (apphosting.yaml plain values).
const SLACK_BUG_CHANNEL = process.env.SLACK_BUG_CHANNEL ?? '#triarch-bugs';
const SLACK_FEATURE_CHANNEL = process.env.SLACK_FEATURE_CHANNEL ?? '#triarch-features';
const SLACK_RELEASE_APPROVAL_CHANNEL = process.env.SLACK_RELEASE_APPROVAL_CHANNEL ?? '#release-approvals';

async function getBotToken(): Promise<string | null> {
  try {
    return await getSecret('SLACK_BOT_TOKEN');
  } catch {
    return null;
  }
}

interface SlackMessage {
  channel: string;
  text: string;
  blocks?: unknown[];
}

async function postSlackMessage(message: SlackMessage): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const token = await getBotToken();
  if (!token) {
    console.warn('[slack] SLACK_BOT_TOKEN not set — skipping notification');
    return { ok: false, error: 'no_token' };
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  return res.json() as Promise<{ ok: boolean; ts?: string; error?: string }>;
}

/**
 * Post a threaded reply to an existing Slack message.
 * Used for promotion dispatch result reporting (Phase 4).
 * Graceful no-op when SLACK_BOT_TOKEN is missing.
 */
export async function postSlackThreadedReply(input: {
  channel: string;
  thread_ts: string;
  text: string;
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const token = await getBotToken();
  if (!token) {
    console.warn('[slack] SLACK_BOT_TOKEN not set - skipping threaded reply');
    return { ok: false, error: 'no_token' };
  }
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: input.channel,
      thread_ts: input.thread_ts,
      text: input.text,
    }),
  });
  const data = await res.json() as { ok: boolean; ts?: string; error?: string };
  if (!data.ok) {
    console.warn(`[slack] threaded reply failed: ${data.error}`);
  }
  return data;
}

/**
 * Update an existing Slack message in place (chat.update).
 * Used to amend the original "Approved" message when a downstream dispatch fails (Phase 4 CONTEXT.md Area 3).
 * Graceful no-op when SLACK_BOT_TOKEN is missing.
 */
export async function updateSlackMessage(input: {
  channel: string;
  ts: string;
  text: string;
  blocks?: unknown[];
}): Promise<{ ok: boolean; error?: string }> {
  const token = await getBotToken();
  if (!token) {
    console.warn('[slack] SLACK_BOT_TOKEN not set - skipping message update');
    return { ok: false, error: 'no_token' };
  }
  const res = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: input.channel,
      ts: input.ts,
      text: input.text,
      ...(input.blocks ? { blocks: input.blocks } : {}),
    }),
  });
  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    console.warn(`[slack] message update failed: ${data.error}`);
  }
  return data;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ':red_circle:',
  high: ':large_orange_circle:',
  medium: ':large_yellow_circle:',
  low: ':white_circle:',
};

export async function notifyBugReport(bug: {
  id: string;
  title: string;
  description: string;
  project: string;
  severity: string;
  priority: string;
  reportedByName?: string | null;
  stepsToReproduce?: string | null;
}) {
  const severityEmoji = SEVERITY_EMOJI[bug.severity] ?? ':grey_question:';
  const priorityLabel = bug.priority === 'fix_now' ? 'Fix Now' : 'Fix Later';

  return postSlackMessage({
    channel: SLACK_BUG_CHANNEL,
    text: `Bug Report: ${bug.title}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:bug: *Bug Report: ${bug.title}*\n*Project:* ${bug.project}\n*Severity:* ${severityEmoji} ${bug.severity}\n*Priority:* ${priorityLabel}\n*Reported by:* ${bug.reportedByName ?? 'Unknown'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> ${bug.description.slice(0, 300)}${bug.description.length > 300 ? '...' : ''}`,
        },
      },
      ...(bug.stepsToReproduce ? [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Steps to reproduce:*\n${bug.stepsToReproduce.slice(0, 300)}`,
        },
      }] : []),
      {
        type: 'actions',
        block_id: `bug_actions_${bug.id}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve Fix' },
            style: 'primary',
            action_id: 'approve_fix',
            value: bug.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Defer to Next Build' },
            action_id: 'defer_fix',
            value: bug.id,
          },
        ],
      },
    ],
  });
}

export async function notifyFeatureRequest(feature: {
  id: string;
  title: string;
  description: string;
  project: string;
  priority: string;
  requestedByName?: string | null;
  estimatedEffort?: string | null;
}) {
  return postSlackMessage({
    channel: SLACK_FEATURE_CHANNEL,
    text: `Feature Request: ${feature.title}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:bulb: *Feature Request: ${feature.title}*\n*Project:* ${feature.project}\n*Priority:* ${feature.priority}\n*Requested by:* ${feature.requestedByName ?? 'Unknown'}${feature.estimatedEffort ? `\n*Estimated effort:* ${feature.estimatedEffort}` : ''}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> ${feature.description.slice(0, 300)}${feature.description.length > 300 ? '...' : ''}`,
        },
      },
      {
        type: 'actions',
        block_id: `feature_actions_${feature.id}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve for Next Build' },
            style: 'primary',
            action_id: 'approve_feature',
            value: feature.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Needs Discussion' },
            action_id: 'discuss_feature',
            value: feature.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Decline' },
            style: 'danger',
            action_id: 'decline_feature',
            value: feature.id,
          },
        ],
      },
    ],
  });
}

export async function notifyReleaseApproved(input: {
  releaseId: string;
  project: string;
  version: string;
  approverEmail: string;
  status: string;
  feedbackExcerpt: string; // already <= 200 chars per caller
  feedbackOverflowCount: number; // 0 if no overflow
}) {
  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:rocket: *Release Approved: ${input.project} ${input.version}*\n*Approver:* ${input.approverEmail}\n*Status:* ${input.status}`,
      },
    },
  ];

  if (input.feedbackExcerpt) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `> ${input.feedbackExcerpt}` +
          (input.feedbackOverflowCount > 0 ? `\n_(${input.feedbackOverflowCount} more comments)_` : ''),
      },
    });
  }

  blocks.push({
    type: 'actions',
    block_id: `release_actions_${input.releaseId}`,
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve & Promote' },
        style: 'primary',
        action_id: 'slack_promote',
        value: await signPayload(input.releaseId, 'promote'),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Reject' },
        style: 'danger',
        action_id: 'slack_reject',
        value: await signPayload(input.releaseId, 'reject'),
      },
    ],
  });

  return postSlackMessage({
    channel: SLACK_RELEASE_APPROVAL_CHANNEL,
    text: `Release Approved: ${input.project} ${input.version}`,
    blocks,
  });
}
