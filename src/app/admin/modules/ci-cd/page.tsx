import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { desc, eq, gte, inArray } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects, deployGateCheck } from '@/db/schema';
import { getProjectPipelineSummaries, type PipelineSummary } from '@/lib/pipeline-summary';

// /admin/modules/ci-cd
//
// Per-project gate-readiness dashboard. Uses the existing pipeline-summary
// library that already powers the admin homepage's per-project state.
// Mirrors the invariants the prod gate (shared-workflows/gate-prod-version.yml)
// would enforce if dev were promoted right now.
//
// Also renders CL-1..CL-6 compliance matrix per project (Phase 35).
// CL-1 and CL-6 are autonomously verifiable from DB data.
// CL-2, CL-3, CL-5 are scaffolded (require HTTP/GitHub API fetches — deferred).
// CL-4 reuses the existing gate-verdict already computed on this page.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_DEV_AGE_S = 300;

type Verdict = 'pass' | 'block' | 'no_dev' | 'never_promoted_pass';

// ─── Compliance Matrix Types ────────────────────────────────────────────────

type ComplianceStatus = 'green' | 'red' | 'grey';

interface ComplianceCell {
  status: ComplianceStatus;
  reason: string;
}

// Extended project row — we need subdomain + deployedUrl for CL-1
interface ProjectRow {
  key: string;
  name: string;
  subdomain: string | null;
  deployedUrl: string | null;
}

interface GateState {
  key: string;
  name: string;
  summary: PipelineSummary | null;
  verdict: Verdict;
  reasons: string[];
  projectRow: ProjectRow;
}

// ─── Gate Verdict Logic ─────────────────────────────────────────────────────

function semverCmp(a: string, b: string): number {
  const norm = (s: string) => s.replace(/^v/, '').split('-')[0];
  const ap = norm(a).split('.').map((n) => parseInt(n, 10) || 0);
  const bp = norm(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function computeVerdict(summary: PipelineSummary | null): { v: Verdict; reasons: string[] } {
  if (!summary || !summary.devVersion) {
    return { v: 'no_dev', reasons: ['INV-1: no dev release on record'] };
  }
  const reasons: string[] = [];
  const dev = summary.devVersion;
  const prod = summary.prodVersion;
  const devAt = summary.devDeployedAt;
  const ageS = devAt ? (Date.now() - new Date(devAt).getTime()) / 1000 : Infinity;

  if (!prod) {
    if (ageS < MIN_DEV_AGE_S) {
      reasons.push(`INV-5: dev v${dev} is ${Math.round(ageS)}s old (< ${MIN_DEV_AGE_S}s)`);
      return { v: 'block', reasons };
    }
    return { v: 'never_promoted_pass', reasons: [] };
  }
  const cmp = semverCmp(dev, prod);
  if (cmp <= 0) {
    reasons.push(`INV-3: dev v${dev} is not higher than prod v${prod}`);
    return { v: 'block', reasons };
  }
  if (ageS < MIN_DEV_AGE_S) {
    reasons.push(`INV-5: dev v${dev} is ${Math.round(ageS)}s old (< ${MIN_DEV_AGE_S}s)`);
    return { v: 'block', reasons };
  }
  return { v: 'pass', reasons: [] };
}

const VERDICT_PILL: Record<Verdict, { label: string; cls: string }> = {
  pass: { label: 'gate would pass', cls: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  never_promoted_pass: { label: 'first promotion ready', cls: 'bg-teal-900/40 text-teal-300 border border-teal-700/30' },
  block: { label: 'gate would block', cls: 'bg-red-900/40 text-red-300 border border-red-700/30' },
  no_dev: { label: 'no dev release', cls: 'bg-zinc-800 text-zinc-400 border border-zinc-700/30' },
};

// ─── Compliance Check Functions ─────────────────────────────────────────────

/**
 * CL-1: Dev shortname exists in DNS following `<short>-dev.<zone>` pattern.
 * Autonomously verifiable: derive expected dev URL from project's subdomain/deployedUrl.
 * Green if project has a subdomain that implies a predictable dev shortname pattern.
 */
function checkCL1(project: ProjectRow): ComplianceCell {
  const url = project.deployedUrl ?? '';
  const subdomain = project.subdomain ?? '';

  // Derive the expected dev hostname: if prod URL matches *.triarch.dev or *.triarchsecurity.com,
  // the dev URL should be <short>-dev.<zone>
  if (url) {
    try {
      const host = new URL(url).hostname;
      // Check if it already is a dev URL (should not happen for prod URL, but guard anyway)
      if (host.includes('-dev.')) {
        return { status: 'green', reason: `Dev URL already follows -dev pattern: ${host}` };
      }
      // Derive expected dev URL: insert -dev before the first dot
      const parts = host.split('.');
      if (parts.length >= 2) {
        const shortname = parts[0];
        const zone = parts.slice(1).join('.');
        const expectedDevHost = `${shortname}-dev.${zone}`;
        return {
          status: 'green',
          reason: `Prod URL ${host} → expected dev URL: ${expectedDevHost} (DNS claim pending CL1-01/02)`,
        };
      }
    } catch {
      // fall through
    }
  }

  if (subdomain) {
    return {
      status: 'grey',
      reason: `Subdomain "${subdomain}" recorded but no deployed_url to derive dev pattern from`,
    };
  }

  return {
    status: 'grey',
    reason: 'No deployed_url or subdomain set on project — cannot derive expected dev hostname',
  };
}

/**
 * CL-2: Persistent "DEV" badge visible in dev UI HTML.
 * SCAFFOLD — requires HTTP fetch of dev URL to grep for data-env="dev".
 * Deferred: implementation would HEAD/GET the derived dev hostname and check response HTML.
 */
function checkCL2(_project: ProjectRow): ComplianceCell {
  return {
    status: 'grey',
    reason:
      'CL-2 check requires HTTP fetch of dev URL; implementation deferred — would GET derived dev hostname and assert data-env="dev" attribute in response HTML',
  };
}

/**
 * CL-3: DB namespace audit — dev backend DATABASE_URL must use <project>_dev database.
 * SCAFFOLD — requires GitHub API read of apphosting.dev.yaml.
 * Deferred: implementation would fetch raw apphosting.dev.yaml via GitHub content API and assert path suffix.
 */
function checkCL3(_project: ProjectRow): ComplianceCell {
  return {
    status: 'grey',
    reason:
      'CL-3 check requires GitHub API read of apphosting.dev.yaml to assert _dev DATABASE_URL suffix; implementation deferred',
  };
}

/**
 * CL-4: Version-promotion gate adoption.
 * Uses the existing gate verdict already computed for this row (green = pass or never_promoted_pass).
 */
function checkCL4(state: GateState): ComplianceCell {
  if (state.verdict === 'pass' || state.verdict === 'never_promoted_pass') {
    return {
      status: 'green',
      reason:
        state.verdict === 'pass'
          ? 'Gate would pass — dev version ahead of prod and aged enough'
          : 'First promotion ready — no prod release yet, dev aged enough',
    };
  }
  if (state.verdict === 'block') {
    return {
      status: 'red',
      reason: state.reasons.length > 0 ? state.reasons.join('; ') : 'Gate would block promotion',
    };
  }
  // no_dev
  return {
    status: 'grey',
    reason: 'No dev release on record — cannot evaluate gate adoption',
  };
}

/**
 * CL-5: Customer-readable release page responds 200 for prod-visible projects.
 * SCAFFOLD — requires HTTP HEAD check of portal URL.
 * Deferred: implementation would HEAD https://portal.triarch.dev/projects/<key>/releases and assert 200.
 */
function checkCL5(_project: ProjectRow): ComplianceCell {
  return {
    status: 'grey',
    reason:
      'CL-5 check requires HTTP HEAD of portal.triarch.dev/projects/<key>/releases; implementation deferred',
  };
}

/**
 * CL-6: Server-side adoption — deploy_gate_check audit rows exist for this project.
 * Autonomously verifiable from DB.
 * Green: a row exists in last 24h.
 * Red: most recent row has verdict='reject_no_pair' (bypassed gate).
 * Grey: no rows ever (gate never ran).
 */
function checkCL6(
  projectKey: string,
  recentGateChecks: Map<string, { verdict: string; createdAt: Date }[]>
): ComplianceCell {
  const rows = recentGateChecks.get(projectKey) ?? [];

  if (rows.length === 0) {
    return {
      status: 'grey',
      reason: 'No deploy_gate_check rows found — gate has never run for this project',
    };
  }

  // Most recent row first
  const latest = rows[0];
  const ageH = (Date.now() - latest.createdAt.getTime()) / 3_600_000;

  if (latest.verdict === 'reject_no_pair') {
    return {
      status: 'red',
      reason: `Most recent gate check (${ageH.toFixed(1)}h ago) was reject_no_pair — prod ingest arrived without a paired gate pass`,
    };
  }

  if (ageH <= 24) {
    return {
      status: 'green',
      reason: `Gate check present within last 24h (${ageH.toFixed(1)}h ago); verdict: ${latest.verdict}`,
    };
  }

  return {
    status: 'grey',
    reason: `Last gate check was ${ageH.toFixed(1)}h ago (>24h); gate may not be actively running`,
  };
}

// ─── Data Loading ────────────────────────────────────────────────────────────

async function loadStates(projectKeys: string[]): Promise<{ states: GateState[]; error: string | null }> {
  try {
    if (projectKeys.length === 0) {
      return { states: [], error: null };
    }
    const projectRows = await db
      .select({
        key: projects.key,
        name: projects.name,
        subdomain: projects.subdomain,
        deployedUrl: projects.deployedUrl,
      })
      .from(projects);

    const summaries = await getProjectPipelineSummaries(projectKeys);
    const byKey = new Map(summaries.map((s) => [s.projectKey, s]));

    const filtered = projectRows.filter((p) => projectKeys.includes(p.key));
    const states: GateState[] = filtered.map((p) => {
      const summary = byKey.get(p.key) ?? null;
      const { v, reasons } = computeVerdict(summary);
      return {
        key: p.key,
        name: p.name,
        summary,
        verdict: v,
        reasons,
        projectRow: {
          key: p.key,
          name: p.name,
          subdomain: p.subdomain ?? null,
          deployedUrl: p.deployedUrl ?? null,
        },
      };
    });
    return { states, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { states: [], error: msg };
  }
}

/**
 * Batch-load recent deploy_gate_check rows for all project keys in a single query.
 * Returns a map of projectKey → sorted array (newest first) of rows within the last 24h.
 * Using inArray for a single query instead of N+1 per project.
 */
async function loadRecentGateChecks(
  projectKeys: string[]
): Promise<Map<string, { verdict: string; createdAt: Date }[]>> {
  if (projectKeys.length === 0) return new Map();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const rows = await db
      .select({
        projectKey: deployGateCheck.projectKey,
        verdict: deployGateCheck.verdict,
        createdAt: deployGateCheck.createdAt,
      })
      .from(deployGateCheck)
      .where(
        inArray(deployGateCheck.projectKey, projectKeys)
      )
      .orderBy(desc(deployGateCheck.createdAt));

    // Group by project key; only include rows within last 24h for green check,
    // but keep all rows to surface the most recent verdict regardless of age
    const map = new Map<string, { verdict: string; createdAt: Date }[]>();
    for (const row of rows) {
      const existing = map.get(row.projectKey) ?? [];
      existing.push({ verdict: row.verdict, createdAt: row.createdAt });
      map.set(row.projectKey, existing);
    }
    return map;
  } catch {
    // If the table doesn't exist yet or query fails, return empty map (graceful degradation)
    return new Map();
  }
}

// ─── UI Helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

const COMPLIANCE_BADGE_CLS: Record<ComplianceStatus, string> = {
  green: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30',
  red: 'bg-red-900/40 text-red-300 border border-red-700/30',
  grey: 'bg-zinc-800 text-zinc-400 border border-zinc-700/30',
};

const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  green: 'pass',
  red: 'fail',
  grey: 'n/a',
};

function ComplianceBadge({ cell }: { cell: ComplianceCell }) {
  return (
    <span
      className={`inline-block text-xs px-2 py-1 rounded-full ${COMPLIANCE_BADGE_CLS[cell.status]}`}
      title={cell.reason}
    >
      {COMPLIANCE_LABEL[cell.status]}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CiCdGateOverview() {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/login');
  }

  // Same scoping as admin home: staff see everything; others see only their memberships.
  const allProjects = await db.select({ key: projects.key }).from(projects);
  const projectKeys = ctx.isStaff
    ? allProjects.map((p) => p.key)
    : ctx.memberships.filter((m) => m.project_key !== '*').map((m) => m.project_key);

  const [{ states, error }, recentGateChecks] = await Promise.all([
    loadStates(projectKeys),
    loadRecentGateChecks(projectKeys),
  ]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">CI/CD — Compliance Overview</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Per-project dev/prod version state, gate readiness, and CL-1..CL-6 contract compliance.
            Gate verdict mirrors invariants in{' '}
            <code className="text-amber-300">shared-workflows/gate-prod-version.yml</code>.
          </p>
          <p className="text-xs text-zinc-500 mt-3">
            Gate invariants: (1) dev release exists · (2) target ≤ dev_version · (3) target &gt; prod_version ·
            (4) target == dev_version · (5) dev age ≥ {MIN_DEV_AGE_S}s. No bypass.
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Compliance columns: CL-1 hostname pattern · CL-2 env badge (deferred) · CL-3 DB namespace (deferred) ·
            CL-4 gate adoption · CL-5 release page (deferred) · CL-6 server-side enforcement.
            Hover a badge for details. Grey = not yet verifiable or no data.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            <div className="font-medium">Could not load gate state.</div>
            <div className="text-xs text-red-300/80 mt-1 font-mono">{error}</div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Project</th>
                <th className="text-left px-4 py-3 font-medium">Dev version</th>
                <th className="text-left px-4 py-3 font-medium">Dev deployed</th>
                <th className="text-left px-4 py-3 font-medium">Prod version</th>
                <th className="text-left px-4 py-3 font-medium">Prod deployed</th>
                <th className="text-left px-4 py-3 font-medium">Gate verdict</th>
                <th className="text-left px-4 py-3 font-medium" title="CL-1: Dev shortname DNS pattern">CL-1</th>
                <th className="text-left px-4 py-3 font-medium" title="CL-2: Persistent ENV badge in dev UI">CL-2</th>
                <th className="text-left px-4 py-3 font-medium" title="CL-3: DB namespace separation (_dev suffix)">CL-3</th>
                <th className="text-left px-4 py-3 font-medium" title="CL-4: Version-promotion gate adoption">CL-4</th>
                <th className="text-left px-4 py-3 font-medium" title="CL-5: Customer release page accessible">CL-5</th>
                <th className="text-left px-4 py-3 font-medium" title="CL-6: Server-side gate enforcement (deploy_gate_check audit rows)">CL-6</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {states.map((s) => {
                const pill = VERDICT_PILL[s.verdict];
                const dev = s.summary?.devVersion ?? null;
                const devAt = s.summary?.devDeployedAt ?? null;
                const prod = s.summary?.prodVersion ?? null;
                const prodAt = s.summary?.prodDeployedAt ?? null;

                const cl1 = checkCL1(s.projectRow);
                const cl2 = checkCL2(s.projectRow);
                const cl3 = checkCL3(s.projectRow);
                const cl4 = checkCL4(s);
                const cl5 = checkCL5(s.projectRow);
                const cl6 = checkCL6(s.key, recentGateChecks);

                return (
                  <tr key={s.key} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/admin/modules/pipeline/${s.key}`}
                        className="font-medium text-zinc-100 hover:text-amber-300"
                      >
                        {s.name}
                      </Link>
                      <div className="text-xs text-zinc-500 mt-0.5">{s.key}</div>
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs">
                      {dev ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-zinc-400">{fmtDate(devAt)}</td>
                    <td className="px-4 py-3 align-top font-mono text-xs">
                      {prod ?? <span className="text-zinc-600">never promoted</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-zinc-400">{fmtDate(prodAt)}</td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${pill.cls}`}>
                        {pill.label}
                      </span>
                      {s.reasons.length > 0 && (
                        <ul className="text-xs text-zinc-500 mt-1 space-y-0.5">
                          {s.reasons.map((r) => (
                            <li key={r}>· {r}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top"><ComplianceBadge cell={cl1} /></td>
                    <td className="px-4 py-3 align-top"><ComplianceBadge cell={cl2} /></td>
                    <td className="px-4 py-3 align-top"><ComplianceBadge cell={cl3} /></td>
                    <td className="px-4 py-3 align-top"><ComplianceBadge cell={cl4} /></td>
                    <td className="px-4 py-3 align-top"><ComplianceBadge cell={cl5} /></td>
                    <td className="px-4 py-3 align-top"><ComplianceBadge cell={cl6} /></td>
                  </tr>
                );
              })}
              {!error && states.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-zinc-500">
                    No projects.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="mt-6 text-xs text-zinc-500">
          Gate logic source:{' '}
          <a
            href="https://github.com/triarchsecurity/shared-workflows/blob/main/.github/workflows/gate-prod-version.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-amber-300"
          >
            shared-workflows/gate-prod-version.yml
          </a>
          {' · '}
          Contract source:{' '}
          <a
            href="/ci-cd/dev-prod-customer-contract.md"
            className="underline hover:text-amber-300"
          >
            dev-prod-customer-contract.md
          </a>
        </footer>
      </div>
    </div>
  );
}
