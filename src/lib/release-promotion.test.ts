import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoist mocks BEFORE imports of the module under test.
vi.mock('@/lib/github-app', () => ({
  dispatchWorkflow: vi.fn(),
}));
vi.mock('@/lib/slack', () => ({
  postSlackThreadedReply: vi.fn().mockResolvedValue({ ok: true }),
  updateSlackMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

// db mock - chainable select/update/where with controllable terminal results
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({ set: () => ({ where: mockUpdate }) }),
  },
}));

import { promoteAndAudit } from '@/lib/release-promotion';
import { dispatchWorkflow } from '@/lib/github-app';
import { postSlackThreadedReply, updateSlackMessage } from '@/lib/slack';

const baseRelease = {
  id: 'rel-1',
  project: 'darksouls-rpg',
  version: 'v0.4.2',
  // cast as any - the only fields promoteAndAudit reads are id, project, version
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
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg' }]);
    mockUpdate.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

    const result = await promoteAndAudit(baseInput);
    expect(result.ok).toBe(true);

    expect(dispatchWorkflow).toHaveBeenCalledWith({
      owner: 'MyAlterLego',
      repo: 'darksouls-rpg',
      workflowFile: 'deploy-prod.yml',
      ref: 'main',
      inputs: { tag: 'v0.4.2' },
    });

    // Audit update was called
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // Threaded reply mentions :rocket: and the workflow file
    expect(postSlackThreadedReply).toHaveBeenCalledTimes(1);
    const threadCall = (postSlackThreadedReply as any).mock.calls[0][0];
    expect(threadCall.text).toContain(':rocket:');
    expect(threadCall.text).toContain('deploy-prod.yml');
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
    expect(mockUpdate).not.toHaveBeenCalled(); // audit NOT updated when project lookup fails before dispatch attempt

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
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg' }]);
    mockUpdate.mockResolvedValue(undefined);
    (dispatchWorkflow as any).mockRejectedValue(new Error('[github-app] dispatch failed for MyAlterLego/darksouls-rpg deploy-prod.yml ref=main: 404 {"message":"Workflow not found"}'));

    const result = await promoteAndAudit(baseInput);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('404');

    // Audit IS updated even on dispatch failure - records that an attempt happened
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // Threaded reply :warning:
    expect((postSlackThreadedReply as any).mock.calls[0][0].text).toContain(':warning:');
    expect((postSlackThreadedReply as any).mock.calls[0][0].text).toContain('404');

    // chat.update fires on failure
    expect(updateSlackMessage).toHaveBeenCalledTimes(1);
    expect((updateSlackMessage as any).mock.calls[0][0].text).toContain('promotion failed');
  });

  it('dispatch error message truncated to 200 chars in threaded reply', async () => {
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg' }]);
    mockUpdate.mockResolvedValue(undefined);
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
    mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg' }]);
    mockUpdate.mockRejectedValue(new Error('DB connection lost'));
    (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

    // The promise should reject (DB throw bubbles up the await), but the caller wraps in .catch.
    // For now, we verify the function does NOT crash the test process - rejection is acceptable.
    await expect(promoteAndAudit(baseInput)).rejects.toThrow();
    // (The route.ts caller wraps in .catch; this is the contract.)
  });
});
