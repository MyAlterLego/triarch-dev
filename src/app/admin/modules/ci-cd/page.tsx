import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { getProjectPipelineSummaries, type PipelineSummary } from '@/lib/pipeline-summary';

// /admin/modules/ci-cd
//
// Per-project gate-readiness dashboard. Uses the existing pipeline-summary
// library that already powers the admin homepage's per-project state.
// Mirrors the invariants the prod gate (shared-workflows/gate-prod-version.yml)
// would enforce if dev were promoted right now.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_DEV_AGE_S = 300;

type Verdict = 'pass' | 'block' | 'no_dev' | 'never_promoted_pass';

interface GateState {
  key: string;
  name: string;
  summary: PipelineSummary | null;
  verdict: Verdict;
  reasons: string[];
}

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

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

async function loadStates(projectKeys: string[]): Promise<{ states: GateState[]; error: string | null }> {
  try {
    if (projectKeys.length === 0) {
      return { states: [], error: null };
    }
    const projectRows = await db.select({ key: projects.key, name: projects.name }).from(projects);
    const summaries = await getProjectPipelineSummaries(projectKeys);
    const byKey = new Map(summaries.map((s) => [s.projectKey, s]));
    const states: GateState[] = projectRows
      .filter((p) => projectKeys.includes(p.key))
      .map((p) => {
        const summary = byKey.get(p.key) ?? null;
        const { v, reasons } = computeVerdict(summary);
        return { key: p.key, name: p.name, summary, verdict: v, reasons };
      });
    return { states, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { states: [], error: msg };
  }
}

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

  const { states, error } = await loadStates(projectKeys);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">CI/CD — Prod Gate Overview</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Per-project dev/prod version state and what the prod-version gate would decide right
            now if dev were promoted to prod. Mirrors invariants in{' '}
            <code className="text-amber-300">shared-workflows/gate-prod-version.yml</code>.
          </p>
          <p className="text-xs text-zinc-500 mt-3">
            Invariants: (1) dev release exists · (2) target ≤ dev_version · (3) target &gt; prod_version ·
            (4) target == dev_version · (5) dev age ≥ {MIN_DEV_AGE_S}s. No bypass.
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
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {states.map((s) => {
                const pill = VERDICT_PILL[s.verdict];
                const dev = s.summary?.devVersion ?? null;
                const devAt = s.summary?.devDeployedAt ?? null;
                const prod = s.summary?.prodVersion ?? null;
                const prodAt = s.summary?.prodDeployedAt ?? null;
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
                  </tr>
                );
              })}
              {!error && states.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
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
        </footer>
      </div>
    </div>
  );
}
