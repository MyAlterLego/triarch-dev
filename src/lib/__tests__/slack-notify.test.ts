/**
 * Vitest suite for src/lib/slack.ts notifyReleaseApproved (RC-05).
 *
 * Asserts the rendered Slack message header includes the branch name,
 * and falls back to 'main' when branch is null.
 *
 * Mocks: @myalterlego/secrets (so getSecret('SLACK_BOT_TOKEN') resolves)
 *        and global fetch (to capture the chat.postMessage body).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@myalterlego/secrets', () => ({
  getSecret: vi.fn(async (name: string) => {
    if (name === 'SLACK_BOT_TOKEN') return 'xoxb-test-token';
    if (name === 'SLACK_PAYLOAD_SECRET') return 'test-payload-secret';
    throw new Error(`unmocked secret: ${name}`);
  }),
}));

const fetchMock = vi.fn();

describe('notifyReleaseApproved (RC-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, ts: '1700000000.000100' }),
    });
  });

  it('renders branch + version + approver in header when branch is set', async () => {
    const { notifyReleaseApproved } = await import('@/lib/slack');

    await notifyReleaseApproved({
      releaseId: 'rel-1',
      project: 'truth-treason',
      version: 'v0.4.2',
      approverEmail: 'mike@triarchsecurity.com',
      status: 'approved',
      feedbackExcerpt: '',
      feedbackOverflowCount: 0,
      branch: 'feat/change-font',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    const body = JSON.parse(init.body as string);
    const headerText = (body.blocks[0] as { text: { text: string } }).text.text;
    expect(headerText).toContain('feat/change-font');
    expect(headerText).toContain('v0.4.2');
    expect(headerText).toContain('approved by mike@triarchsecurity.com');
  });

  it('falls back to "main" when branch is null', async () => {
    const { notifyReleaseApproved } = await import('@/lib/slack');

    await notifyReleaseApproved({
      releaseId: 'rel-2',
      project: 'truth-treason',
      version: 'v0.4.3',
      approverEmail: 'mike@triarchsecurity.com',
      status: 'approved',
      feedbackExcerpt: '',
      feedbackOverflowCount: 0,
      branch: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const headerText = (body.blocks[0] as { text: { text: string } }).text.text;
    // The branch slot renders as 'main' when null
    expect(headerText).toMatch(/main\s+v0\.4\.3/);
    expect(headerText).toContain('approved by mike@triarchsecurity.com');
  });

  it('button payload still uses signPayload(releaseId, "promote") — value format unchanged', async () => {
    const { notifyReleaseApproved } = await import('@/lib/slack');

    await notifyReleaseApproved({
      releaseId: 'rel-3',
      project: 'truth-treason',
      version: 'v0.5.0',
      approverEmail: 'mike@triarchsecurity.com',
      status: 'approved',
      feedbackExcerpt: '',
      feedbackOverflowCount: 0,
      branch: 'feat/x',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // Find the actions block
    const actionsBlock = body.blocks.find(
      (b: { type: string }) => b.type === 'actions'
    ) as { elements: Array<{ action_id: string; value: string }> };
    const promote = actionsBlock.elements.find(
      (e) => e.action_id === 'slack_promote'
    );
    // value is `${releaseId}.${nonce}.${sig}` packed format — starts with the releaseId
    expect(promote?.value).toMatch(/^rel-3\.[0-9a-f]+\..+$/);
  });
});
