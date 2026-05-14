import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects, releaseLogs } from '@/db/schema';
import { and, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';

// /admin/modules/ci-cd
//
// Per-project gate-readiness dashboard. Shows for each project:
//   - latest dev release (version, deployed_at, commit)
//   - latest prod release (version, deployed_at, commit)
//   - drift indicator (dev > prod: ok / dev == prod: synced / no prod: never promoted)
//   - gate verdict the prod gate would issue right now if dev were promoted
//
// Mike asked for this to be visible when he uses the system tomorrow — it shows
// the actual state of gating after shared-workflows v8 ships.
//
// Gate readiness rules (mirrored from shared-workflows/gate-prod-version.yml):
//   INV-1: dev release exists
//   INV-2: target <= dev_version           (we model "target = dev_version")
//   INV-3: target > prod_version
//   INV-4: target == dev_version
//   INV-5: dev_age >= 300s

type EnvRow = {
  version: string;
  deployed_at: string;
  commit_sha: string | null;
  released_by: string | null;
  status: string | null;
};

type ProjectGateState = {
  key: string;
  name: string;
  dev: EnvRow | null;
  prod: EnvRow | null;
  verdict: 'pass' | 'block' | 'no_dev' | 'never_promoted_pass';
  reasons: string[];
};

const MIN_DEV_AGE_S = 300;

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

async function latestRelease(projectKey: string, env: 'dev' | 'prod'): Promise<EnvRow | null> {
  const rows = await db
    .select({
      version: releaseLogs.version,
      deployed_at: sql<string>`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`,
      commit_sha: releaseLogs.commitSha,
      released_by: releaseLogs.releasedBy,
      status: releaseLogs.status,
    })
    .from(releaseLogs)
    .where(
      and(
        eq(releaseLogs.project, projectKey),
        eq(releaseLogs.env, env),
        or(isNull(releaseLogs.status), ne(releaseLogs.status, 'rejected')),
      ),
    )
    .orderBy(desc(sql`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  const deployedAtRaw = r.deployed_at as unknown;
  const deployedAtIso =
    deployedAtRaw instanceof Date
      ? deployedAtRaw.toISOString()
      : new Date(String(deployedAtRaw)).toISOString();
  return {
    version: r.version,
    deployed_at: deployedAtIso,
    commit_sha: r.commit_sha,
    released_by: r.released_by,
    status: r.status,
  };
}

function computeVerdict(dev: EnvRow | null, prod: EnvRow | null): ProjectGateState['verdict'] | { v: ProjectGateState['verdict']; reasons: string[] } {
  const reasons: string[] = [];
  if (!dev) {
    return { v: 'no_dev', reasons: ['INV-1: no dev release on record'] };
  }
  // Model: if Mike clicked "promote dev to prod" right now, target = dev.version.
  if (!prod) {
    // Never promoted — gate would pass on first promotion if dev is old enough
    const age = (Date.now() - new Date(dev.deployed_at).getTime()) / 1000;
    if (age < MIN_DEV_AGE_S) {
      reasons.push(`INV-5: dev v${dev.version} is ${Math.round(age)}s old (< ${MIN_DEV_AGE_S}s bake time)`);
      return { v: 'block', reasons };
    }
    return { v: 'never_promoted_pass', reasons: [] };
  }
  const cmp = semverCmp(dev.version, prod.version);
  if (cmp <= 0) {
    reasons.push(`INV-3: dev v${dev.version} is not higher than prod v${prod.version}`);
    return { v: 'block', reasons };
  }
  const age = (Date.now() - new Date(dev.deployed_at).getTime()) / 1000;
  if (age < MIN_DEV_AGE_S) {
    reasons.push(`INV-5: dev v${dev.version} is ${Math.round(age)}s old (< ${MIN_DEV_AGE_S}s bake time)`);
    return { v: 'block', reasons };
  }
  return { v: 'pass', reasons: [] };
}

const VERDICT_PILL: Record<ProjectGateState['verdict'], { label: string; cls: string }> = {
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

export default async function CiCdGateOverview() {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/login');
  }

  const projectRows = await db.select({ key: projects.key, name: projects.name }).from(projects);

  const states: ProjectGateState[] = await Promise.all(
    projectRows.map(async (p) => {
      const [dev, prod] = await Promise.all([
        latestRelease(p.key, 'dev'),
        latestRelease(p.key, 'prod'),
      ]);
      const verdictResult = computeVerdict(dev, prod);
      const verdict = typeof verdictResult === 'string' ? verdictResult : verdictResult.v;
      const reasons = typeof verdictResult === 'string' ? [] : verdictResult.reasons;
      return { key: p.key, name: p.name, dev, prod, verdict, reasons };
    }),
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">CI/CD — Prod Gate Overview</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Per-project dev/prod version state and what the prod-version gate would decide
            right now if you promoted dev to prod. Mirrors the invariants in{' '}
            <code className="text-amber-300">shared-workflows/gate-prod-version.yml</code>.
          </p>
          <p className="text-xs text-zinc-500 mt-3">
            Invariants enforced by the gate: (1) dev release exists · (2) target ≤ dev_version ·
            (3) target &gt; prod_version · (4) target == dev_version · (5) dev age ≥ {MIN_DEV_AGE_S}s.
            No bypass.
          </p>
        </header>

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
                      {s.dev ? s.dev.version : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-zinc-400">
                      {s.dev ? fmtDate(s.dev.deployed_at) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs">
                      {s.prod ? s.prod.version : <span className="text-zinc-600">never promoted</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-zinc-400">
                      {s.prod ? fmtDate(s.prod.deployed_at) : '—'}
                    </td>
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
              {states.length === 0 && (
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

export const dynamic = 'force-dynamic';
