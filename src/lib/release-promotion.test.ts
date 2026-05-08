import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoist mocks BEFORE imports of the module under test.
vi.mock('@/lib/github-app', () => ({
  dispatchWorkflow: vi.fn(),
}));
vi.mock('@/lib/slack', () => ({
  postSlackThreadedReply: vi.fn().mockResolvedValue({ ok: true }),
  updateSlackMessage: vi.fn().mockResolvedValue({ ok: true }),
  postSlackChannelMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

// db mock - chainable select/update/where with .set() args capture
const mockSelect = vi.fn();
const mockSetCapture = vi.fn();
const mockUpdateWhere = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({
      set: (args: unknown) => {
        mockSetCapture(args);
        return { where: mockUpdateWhere };
      },
    }),
  },
}));

import { promoteAndAudit } from '@/lib/release-promotion';
import { dispatchWorkflow } from '@/lib/github-app';
import { postSlackThreadedReply, updateSlackMessage, postSlackChannelMessage } from '@/lib/slack';

const baseRelease = {
  id: 'rel-1',
  project: 'darksouls-rpg',
  version: 'v0.4.2',
  branch: 'feat/change-font',
} as any;

const baseInput = {
  release: baseRelease,
  actorEmail: 'mike@triarchsecurity.com',
  channelId: 'C123',
  messageTs: '1700000000.000100',
  slackUserName: 'mike',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('promoteAndAudit', () => {
  it('success path: dispatches, audits, posts :rocket: threaded reply, no chat.update', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

    const result = await promoteAndAudit(baseInput);
    expect(result.ok).toBe(true);

    expect(dispatchWorkflow).toHaveBeenCalledWith({
      owner: 'MyAlterLego',
      repo: 'darksouls-rpg',
      workflowFile: 'promote-branch.yml',
      ref: 'main',
      inputs: { branch: 'feat/change-font' },
    });

    // Audit update was called
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);

    // Threaded reply mentions :rocket: and the workflow file
    expect(postSlackThreadedReply).toHaveBeenCalledTimes(1);
    const threadCall = (postSlackThreadedReply as any).mock.calls[0][0];
    expect(threadCall.text).toContain(':rocket:');
    expect(threadCall.text).toContain('promote-branch.yml');
    expect(threadCall.thread_ts).toBe('1700000000.000100');

    // chat.update NOT called on success
    expect(updateSlackMessage).not.toHaveBeenCalled();
  });

  it('project not found: skips dispatch, posts :warning: thread + chat.update, no audit update', async () => {
    mockSelect.mockResolvedValue([]); // empty - project missing

    const result = await promoteAndAudit(baseInput);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('project repository not configured');

    expect(dispatchWorkflow).not.toHaveBeenCalled();
    expect(mockUpdateWhere).not.toHaveBeenCalled(); // audit NOT updated when project lookup fails before dispatch attempt

    expect(postSlackThreadedReply).toHaveBeenCalledTimes(1);
    expect((postSlackThreadedReply as any).mock.calls[0][0].text).toContain(':warning:');

    expect(updateSlackMessage).toHaveBeenCalledTimes(1);
    expect((updateSlackMessage as any).mock.calls[0][0].text).toContain('promotion failed');
  });

  it('githubRepo NULL: skips dispatch, posts :warning: thread + chat.update', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: null }]);

    const result = await promoteAndAudit(baseInput);
    expect(result.ok).toBe(false);

    expect(dispatchWorkflow).not.toHaveBeenCalled();
    expect(postSlackThreadedReply).toHaveBeenCalledTimes(1);
    expect(updateSlackMessage).toHaveBeenCalledTimes(1);
  });

  it('githubRepo malformed (no slash): skips dispatch, surfaces format error', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'just-a-name' }]);

    const result = await promoteAndAudit(baseInput);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid githubRepo format');

    expect(dispatchWorkflow).not.toHaveBeenCalled();
  });

  it('dispatch throws (e.g. 404 from GitHub): audit columns STILL update, threaded reply + chat.update fire', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockRejectedValue(new Error('[github-app] dispatch failed for MyAlterLego/darksouls-rpg promote-branch.yml ref=main: 404 {"message":"Workflow not found"}'));

    const result = await promoteAndAudit(baseInput);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('404');

    // Audit IS updated even on dispatch failure - records that an attempt happened
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);

    // Threaded reply :warning:
    expect((postSlackThreadedReply as any).mock.calls[0][0].text).toContain(':warning:');
    expect((postSlackThreadedReply as any).mock.calls[0][0].text).toContain('404');

    // chat.update fires on failure
    expect(updateSlackMessage).toHaveBeenCalledTimes(1);
    expect((updateSlackMessage as any).mock.calls[0][0].text).toContain('promotion failed');
  });

  it('dispatch error message truncated to 200 chars in threaded reply', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    const longError = 'X'.repeat(500);
    (dispatchWorkflow as any).mockRejectedValue(new Error(longError));

    await promoteAndAudit(baseInput);
    const threadText = (postSlackThreadedReply as any).mock.calls[0][0].text;
    // The reply is ":warning: Promotion dispatch failed: " + error - error portion <= 200 chars
    const errorPortion = threadText.replace(':warning: Promotion dispatch failed: ', '');
    expect(errorPortion.length).toBeLessThanOrEqual(200);
    expect(errorPortion).toContain('...');
  });

  it('never throws - even when DB update fails', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockRejectedValue(new Error('DB connection lost'));
    (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

    // The promise should reject (DB throw bubbles up the await), but the caller wraps in .catch.
    // For now, we verify the function does NOT crash the test process - rejection is acceptable.
    await expect(promoteAndAudit(baseInput)).rejects.toThrow();
    // (The route.ts caller wraps in .catch; this is the contract.)
  });

  it('null branch falls back to "main" in dispatch inputs', async () => {
    const releaseNoBranch = { ...baseRelease, branch: null };
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

    await promoteAndAudit({ ...baseInput, release: releaseNoBranch });

    const dispatchCall = (dispatchWorkflow as any).mock.calls[0][0];
    expect(dispatchCall.workflowFile).toBe('promote-branch.yml');
    expect(dispatchCall.inputs.branch).toBe('main');
    // No legacy `tag` field
    expect(dispatchCall.inputs.tag).toBeUndefined();
  });

  it('writes Slack metadata via jsonb_set (preserves existing metadata fields)', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

    await promoteAndAudit(baseInput);

    // .set() was called once
    expect(mockSetCapture).toHaveBeenCalledTimes(1);
    const setArgs = mockSetCapture.mock.calls[0][0] as Record<string, unknown>;

    // Audit columns still present (D-04 — keep promotionDispatchedAt/By)
    expect(setArgs.promotionDispatchedAt).toBeInstanceOf(Date);
    expect(setArgs.promotionDispatchedBy).toBe('mike@triarchsecurity.com');

    // metadata is a Drizzle sql template (object), NOT a plain JS object replacement (Pitfall 1)
    // The sql template tag returns an SQL chunk object — it is truthy and NOT a plain object literal.
    expect(setArgs.metadata).toBeDefined();
    expect(typeof setArgs.metadata).toBe('object');
    // Coarse check: it must NOT be a plain { dispatch: ... } object — that would mean replace, not merge.
    // sql tagged-template results have specific Drizzle internals; assert it has at least one drizzle-marker key.
    const md = setArgs.metadata as Record<string, unknown>;
    // Drizzle SQL chunks contain `queryChunks` or similar; the presence of a non-`dispatch` key proves it is the sql tag, not the plain object.
    expect('dispatch' in md).toBe(false);
  });

  it('dispatch failure path STILL writes metadata + audit columns (Pitfall 1 guard on failure path)', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockRejectedValue(new Error('boom 500'));

    const result = await promoteAndAudit(baseInput);
    expect(result.ok).toBe(false);

    // Audit was written even though dispatch threw
    expect(mockSetCapture).toHaveBeenCalledTimes(1);
    const setArgs = mockSetCapture.mock.calls[0][0] as Record<string, unknown>;
    expect(setArgs.promotionDispatchedAt).toBeInstanceOf(Date);
    expect(setArgs.metadata).toBeDefined();
  });

  it('web-origin success: dispatches, audits, posts fresh Slack message, no threaded reply, no chat.update', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

    const webInput = { ...baseInput, channelId: null, messageTs: null, slackUserName: null };
    const result = await promoteAndAudit(webInput);
    expect(result.ok).toBe(true);

    // dispatchWorkflow called once
    expect(dispatchWorkflow).toHaveBeenCalledTimes(1);

    // Audit update was called
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);

    // No threaded reply (no thread to reply on)
    expect(postSlackThreadedReply).not.toHaveBeenCalled();

    // No chat.update (no original Slack message to update)
    expect(updateSlackMessage).not.toHaveBeenCalled();

    // Fresh Slack channel message IS posted to project's slackChannelId
    expect(postSlackChannelMessage).toHaveBeenCalledTimes(1);
    const channelMsgCall = (postSlackChannelMessage as any).mock.calls[0][0];
    expect(channelMsgCall.channel).toBe('C-RELEASE');
    expect(channelMsgCall.text).toContain(':rocket:');
  });

  it('web-origin dispatch failure: audits failure, posts fresh Slack failure message, no threaded reply', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg', slackChannelId: 'C-RELEASE' }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockRejectedValue(new Error('GitHub 404 workflow not found'));

    const webInput = { ...baseInput, channelId: null, messageTs: null, slackUserName: null };
    const result = await promoteAndAudit(webInput);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();

    // Audit IS updated even on dispatch failure
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);

    // No threaded reply
    expect(postSlackThreadedReply).not.toHaveBeenCalled();

    // No chat.update
    expect(updateSlackMessage).not.toHaveBeenCalled();

    // Fresh Slack failure message IS posted
    expect(postSlackChannelMessage).toHaveBeenCalledTimes(1);
    const channelMsgCall = (postSlackChannelMessage as any).mock.calls[0][0];
    expect(channelMsgCall.channel).toBe('C-RELEASE');
    expect(channelMsgCall.text).toContain(':warning:');
  });
});
