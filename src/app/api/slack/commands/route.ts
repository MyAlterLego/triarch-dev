/**
 * Phase 7 OTTOBOT-03 / OTTOBOT-04 — Slack slash command dispatcher.
 *
 * Handles /triarch <subcommand> [args]. Single endpoint per CONTEXT D-01;
 * internal switch on `command` + first positional arg of `text`.
 *
 * Subcommands:
 *   deploy <project> <version> [<branch>] — staff-only; dispatches
 *     promote-branch.yml on the project's GitHub repo. Returns immediate
 *     ephemeral ack; dispatch + run-URL follow-up via response_url is
 *     fire-and-forget per Slack 3-second rule (RESEARCH §8 Pitfall 4).
 *   status <project> — open to any caller; returns ephemeral Block Kit
 *     (RESEARCH §6).
 *   (empty) — returns help text mentioning both subcommands + the
 *     @OttoBot status mention path (CONTEXT D-04).
 *
 * Every response path calls void recordSlackAudit(...) so the audit row
 * write never blocks Slack's 3-second response window.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';
import { verifySlackSignature } from '@/lib/slack-crypto';
import { resolveSlackUserEmail } from '@/lib/slack-identity';
import { dispatchWorkflow, mergeBranchToMain } from '@/lib/github-app';
import { recordSlackAudit } from '@/lib/slack-audit';
import {
  fetchProjectStatus,
  buildStatusBlocks,
  listProjectKeys,
} from '@/lib/slack-status';
import {
  fetchProjectStatusByAnyIdentifier,
  listAllProjects,
} from '@/lib/slack-project-resolver';

/**
 * Parses + validates a Slack-issued response_url. Returns a URL object only
 * if the input is https://hooks.slack.com/* — anything else returns null.
 * Slack always issues from that host; anything else is a misconfigured
 * client or a forged request that slipped past HMAC verification.
 *
 * Returns URL (not string) deliberately: CodeQL js/request-forgery recognizes
 * fetch(URLobject) where the URL was constructed AND host-checked as
 * sanitized, but does not recognize a string returned from a separate
 * validator helper. The caller passes the URL object directly to fetch().
 */
function parseSlackResponseUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== 'hooks.slack.com') return null;
  return parsed;
}

const HELP_TEXT = [
  '*OttoBot — Triarch deploy automation*',
  '',
  '• `/triarch promote <project> [<head>] [<base>]` — Merge the open dev→main PR for `<project>` as a *merge commit* (preserves verify-dev-deployed ancestry). Defaults: head=dev, base=main. Staff only.',
  '• `/triarch deploy <project> <version>` — *Legacy* — dispatches `promote-branch.yml` (only works for projects with that workflow file). Use `promote` for PR-based dev→main projects. Staff only.',
  '• `/triarch status <project>` — Show current dev/prod release status for `<project>`.',
  '• `/triarch projects` — List every known project with its identifiers.',
  '',
  'Tip: `<project>` accepts any of: canonical key (`triarch-dev`), custom domain (`admin.triarch.dev`), subdomain (`admin`), or repo name (`platform`).',
  'Tip: also try `@OttoBot status <project>` in any channel.',
].join('\n');

export async function POST(req: NextRequest) {
  const requestReceivedAt = Date.now();

  // STEP 1: Raw body FIRST (RESEARCH Pitfall 1)
  const rawBody = await req.text();

  // STEP 2: HMAC verify
  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');
  const sigResult = await verifySlackSignature({ rawBody, timestamp, signature });
  if (!sigResult.ok) {
    void recordSlackAudit({
      actionId: '_sig_failed',
      actorEmail: null,
      actorSlackId: 'unknown',
      rawBody,
      responseStatus: 401,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ error: sigResult.reason }, { status: 401 });
  }

  // STEP 3: Parse URL-encoded body (RESEARCH Pitfall 3 — NOT json)
  const params = new URLSearchParams(rawBody);
  const text = params.get('text') ?? '';
  const userId = params.get('user_id') ?? '';
  const responseUrl = params.get('response_url') ?? '';

  // STEP 4: Subcommand routing
  const trimmed = text.trim();
  const tokens = trimmed.length === 0 ? [] : trimmed.split(/\s+/);
  const [subcommand, ...rest] = tokens;

  // STEP 5: Empty → help (CONTEXT D-04)
  if (!subcommand) {
    void recordSlackAudit({
      actionId: 'slash_help',
      actorEmail: null,
      actorSlackId: userId || 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      text: HELP_TEXT,
    });
  }

  // STEP 6: Resolve actor email (used by both deploy and status)
  const actorEmail = await resolveSlackUserEmail(userId);

  // STEP 7: status — open to any caller (D-06 simplified: ephemeral, bounded leak risk)
  if (subcommand === 'status') {
    const [projectArg] = rest;
    if (!projectArg) {
      void recordSlackAudit({
        actionId: 'slash_status',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: ':warning: Usage: `/triarch status <project>`',
      });
    }

    const status = await fetchProjectStatusByAnyIdentifier(projectArg);
    if (!status) {
      // Unknown project — list up to 5 known keys (CONTEXT D-16)
      const knownKeys = await listProjectKeys(5);
      const hint = knownKeys.length ? ` Try: ${knownKeys.join(', ')}` : '';
      void recordSlackAudit({
        actionId: 'slash_status',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `:warning: Project '${projectArg}' not found.${hint}`,
      });
    }

    const blocks = buildStatusBlocks(
      status.project.key,
      status.devRelease,
      status.prodRelease,
      status.activeRCs,
      status.lastDeploys
    );
    void recordSlackAudit({
      actionId: 'slash_status',
      actorEmail,
      actorSlackId: userId || 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      blocks,
      text: `${status.project.key} — Release Status`, // fallback for clients without Block Kit
    });
  }

  // STEP 7b: projects — open discovery command. Lists every active project
  // with its canonical key + alternate identifiers (custom domain, repo) so
  // staff don't need to memorize project keys before running promote/status.
  if (subcommand === 'projects') {
    const rows = await listAllProjects();
    void recordSlackAudit({
      actionId: 'slash_projects',
      actorEmail,
      actorSlackId: userId || 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    if (rows.length === 0) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: ':warning: No active projects found.',
      });
    }
    const lines = rows.map((p) => {
      const repo = p.githubRepo ? `\`${p.githubRepo}\`` : '_no repo_';
      const domain = p.customDomain ? ` · <https://${p.customDomain}|${p.customDomain}>` : '';
      return `• \`${p.key}\` — ${p.name} · ${repo}${domain}`;
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      text: ['*Known projects* (any identifier below works in `/triarch promote|status|deploy <project>`)', '', ...lines].join('\n'),
    });
  }

  // STEP 8: deploy — staff-only (CONTEXT D-05)
  if (subcommand === 'deploy') {
    const isStaff = actorEmail?.endsWith('@triarchsecurity.com') ?? false;
    if (!isStaff) {
      void recordSlackAudit({
        actionId: 'slash_deploy',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: ':no_entry: This command requires Triarch staff access.',
      });
    }

    const [projectArg, versionArg, branchOverride] = rest;
    if (!projectArg || !versionArg) {
      void recordSlackAudit({
        actionId: 'slash_deploy',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: ':warning: Usage: `/triarch deploy <project> <version> [<branch>]`',
      });
    }

    // Look up project to determine GitHub repo
    const projectStatus = await fetchProjectStatusByAnyIdentifier(projectArg);
    if (!projectStatus) {
      void recordSlackAudit({
        actionId: 'slash_deploy',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `:warning: Project '${projectArg}' not found.`,
      });
    }

    if (!projectStatus.project.githubRepo) {
      void recordSlackAudit({
        actionId: 'slash_deploy',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `:warning: Project '${projectArg}' has no GitHub repo configured.`,
      });
    }

    // Find the release_logs row matching (project, version) to extract branch
    const [release] = await db
      .select()
      .from(releaseLogs)
      .where(and(
        eq(releaseLogs.project, projectArg),
        eq(releaseLogs.version, versionArg)
      ))
      .orderBy(desc(releaseLogs.releasedAt))
      .limit(1);

    const branch = branchOverride ?? release?.branch ?? 'main';
    const [owner, repo] = projectStatus.project.githubRepo.split('/');

    // Fire-and-forget: dispatch + response_url follow-up (RESEARCH §8)
    void (async () => {
      try {
        await dispatchWorkflow({
          owner,
          repo,
          workflowFile: 'promote-branch.yml',
          ref: 'main',
          inputs: { branch },
        });
        if (responseUrl) {
          await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              response_type: 'ephemeral',
              replace_original: false,
              text: `:white_check_mark: Promotion dispatched for \`${projectArg} ${versionArg}\` (branch: \`${branch}\`) — <https://github.com/${owner}/${repo}/actions/workflows/promote-branch.yml|view runs>`,
            }),
          });
        }
      } catch (err) {
        console.error('[slack-commands] dispatchWorkflow failed', err);
        if (responseUrl) {
          await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              response_type: 'ephemeral',
              replace_original: false,
              text: ':x: Dispatch failed — check server logs.',
            }),
          }).catch(() => {});
        }
      }
    })();

    void recordSlackAudit({
      actionId: 'slash_deploy',
      actorEmail,
      actorSlackId: userId || 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `:gear: Dispatching \`promote-branch.yml\` for \`${projectArg} ${versionArg}\` on branch \`${branch}\`...`,
    });
  }

  // ─── STEP 8b: /triarch promote <project> [<head>] [<base>] ──────────────
  // PR-based dev→main promotion. Calls GitHub API to merge the open PR with
  // merge_method='merge' (preserves dev's commit hashes in main's ancestry so
  // verify-dev-deployed gate on consumer repos passes). Replaces the legacy
  // `deploy` path for projects that have adopted the dev→main PR flow.
  if (subcommand === 'promote') {
    const isStaff = actorEmail?.endsWith('@triarchsecurity.com') ?? false;
    if (!isStaff) {
      void recordSlackAudit({
        actionId: 'slash_promote',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: ':no_entry: This command requires Triarch staff access.',
      });
    }

    const [projectArg, headBranchArg, baseBranchArg] = rest;
    if (!projectArg) {
      void recordSlackAudit({
        actionId: 'slash_promote',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: ':warning: Usage: `/triarch promote <project> [<head-branch>] [<base-branch>]` (defaults: head=dev base=main)',
      });
    }
    const headBranch = headBranchArg || 'dev';
    const baseBranch = baseBranchArg || 'main';

    const projectStatus = await fetchProjectStatusByAnyIdentifier(projectArg);
    if (!projectStatus) {
      void recordSlackAudit({
        actionId: 'slash_promote',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `:warning: Project '${projectArg}' not found.`,
      });
    }
    if (!projectStatus.project.githubRepo) {
      void recordSlackAudit({
        actionId: 'slash_promote',
        actorEmail,
        actorSlackId: userId || 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `:warning: Project '${projectArg}' has no GitHub repo configured.`,
      });
    }

    const [owner, repo] = projectStatus.project.githubRepo.split('/');

    // Fire-and-forget: merge + response_url follow-up per Slack 3-sec rule.
    // response_url is HMAC-verified upstream; we additionally parse it as a
    // URL object and verify it points at hooks.slack.com before fetch. Passing
    // the parsed URL object (not the raw string) to fetch is the pattern
    // CodeQL js/request-forgery recognizes as sanitized.
    const safeUrl = responseUrl ? parseSlackResponseUrl(responseUrl) : null;
    void (async () => {
      try {
        const result = await mergeBranchToMain({ owner, repo, headBranch, baseBranch });
        if (!safeUrl) return;
        let message: string;
        if (result.merged) {
          message =
            `:white_check_mark: Merged \`${projectArg}\` ${headBranch} → ${baseBranch} as merge commit. ` +
            `<https://github.com/${owner}/${repo}/pull/${result.prNumber}|PR #${result.prNumber}> · sha \`${result.sha.slice(0, 7)}\``;
        } else if (result.reason === 'no_open_pr') {
          message =
            `:warning: No open PR from \`${result.headBranch}\` → \`${result.baseBranch}\` for \`${projectArg}\`. ` +
            `Open one first (\`gh pr create --base ${result.baseBranch} --head ${result.headBranch}\` on the repo).`;
        } else {
          message =
            `:x: Merge failed for PR #${result.prNumber} (HTTP ${result.statusCode}): ` +
            `${result.message}`;
        }
        // lgtm[js/request-forgery] safeUrl is parseSlackResponseUrl-validated (https + hooks.slack.com)
        await fetch(safeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response_type: 'ephemeral', replace_original: false, text: message }),
        });
      } catch (err) {
        console.error('[slack-commands] mergeBranchToMain failed', err);
        if (safeUrl) {
          // lgtm[js/request-forgery] safeUrl is parseSlackResponseUrl-validated (https + hooks.slack.com)
          await fetch(safeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              response_type: 'ephemeral',
              replace_original: false,
              text: ':x: Promote failed — check server logs.',
            }),
          }).catch(() => {});
        }
      }
    })();

    void recordSlackAudit({
      actionId: 'slash_promote',
      actorEmail,
      actorSlackId: userId || 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `:gear: Promoting \`${projectArg}\` \`${headBranch}\` → \`${baseBranch}\` as merge commit (preserves dev ancestry for verify-dev-deployed gate)...`,
    });
  }

  // STEP 9: Unknown subcommand → help text fallback
  void recordSlackAudit({
    actionId: 'slash_unknown',
    actorEmail,
    actorSlackId: userId || 'unknown',
    rawBody,
    responseStatus: 200,
    latencyMs: Date.now() - requestReceivedAt,
  });
  return NextResponse.json({
    response_type: 'ephemeral',
    text: `:warning: Unknown subcommand \`${subcommand}\`.\n\n${HELP_TEXT}`,
  });
}
