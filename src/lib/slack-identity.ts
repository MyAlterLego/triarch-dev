/**
 * Maps Slack user_id → staff email.
 * MVP per CONTEXT.md Area 3 — DB-backed table is a deferred idea.
 * Mike fills in his actual Slack user_id during HUMAN-UAT (plan 03-05).
 * To find your Slack user_id: Slack profile → "..." menu → Copy member ID.
 */
export const SLACK_USER_MAP: Record<string, string> = {
  U0AJM4MP2N6: 'mike@triarchsecurity.com',
};

/**
 * Resolves a Slack user_id to a staff email address.
 * Returns null for unmapped, null, or undefined input.
 */
export function resolveSlackUserEmail(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return SLACK_USER_MAP[userId] ?? null;
}
