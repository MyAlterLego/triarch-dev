'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AdminSidebar } from '@/components/AdminSidebar';
import { BugReportForm, FeatureRequestForm } from '@triarchsecurity/shared-ui';
import type { BugReportPayload, FeatureRequestPayload } from '@triarchsecurity/shared-ui';
import { ThumbsUp, Bug, Lightbulb, X } from 'lucide-react';

const PROJECT_KEY = 'triarch-dev';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  submitted:      { label: 'Submitted',    color: 'gray' },
  triaged:        { label: 'Triaged',      color: 'blue' },
  approved:       { label: 'Approved',     color: 'blue' },
  plan_generated: { label: 'Plan Ready',   color: 'blue' },
  reviewed:       { label: 'Reviewed',     color: 'blue' },
  in_progress:    { label: 'In Progress',  color: 'amber' },
  needs_review:   { label: 'Needs Review', color: 'amber' },
  needs_human:    { label: 'Needs Human',  color: 'amber' },
  fixed:          { label: 'Fixed',        color: 'green' },
  shipped:        { label: 'Shipped',      color: 'green' },
  closed:         { label: 'Closed',       color: 'green' },
  deferred:       { label: 'Deferred',     color: 'blue' },
  queued:         { label: 'Queued',       color: 'blue' },
  declined:       { label: 'Declined',     color: 'red' },
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  gray:  'bg-zinc-700 text-zinc-300',
  blue:  'bg-blue-500/20 text-blue-400',
  amber: 'bg-amber-500/20 text-amber-400',
  green: 'bg-teal-500/20 text-teal-400',
  red:   'bg-red-500/20 text-red-400',
};

function StatusBadge({ status }: { status: string }) {
  const mapping = STATUS_LABELS[status] ?? { label: status, color: 'gray' };
  const cls = STATUS_BADGE_CLASS[mapping.color] ?? STATUS_BADGE_CLASS.gray;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${cls}`}>
      {mapping.label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}

interface BugReport {
  id: string; title: string; status: string; severity: string;
  priority: string; createdAt: string; updatedAt: string;
}

interface FeatureRequest {
  id: string; title: string; status: string; importance?: string;
  priority?: string; upvotes: number; buildPlanStatus?: string;
  createdAt: string; updatedAt: string;
}

function SlideOver({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full overflow-y-auto bg-zinc-900 p-6 flex flex-col gap-4 border-l border-zinc-800">
        <div className="flex justify-end">
          <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-200 p-1">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const { data: session, status } = useSession();
  const user = session?.user;

  const [activeTab, setActiveTab] = useState<'bugs' | 'features'>('bugs');
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [features, setFeatures] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBugForm, setShowBugForm] = useState(false);
  const [showFeatureForm, setShowFeatureForm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    Promise.all([
      fetch(`/api/platform/bug-reports?project=${PROJECT_KEY}`).then(r => r.json()),
      fetch(`/api/platform/feature-requests?project=${PROJECT_KEY}`).then(r => r.json()),
    ])
      .then(([bugsData, featuresData]) => {
        setBugs(bugsData.bugs || []);
        setFeatures(featuresData.features || featuresData.featureRequests || []);
      })
      .catch(() => {
        setBugs([]);
        setFeatures([]);
      })
      .finally(() => setLoading(false));
  }, [user?.email]);

  async function refreshBugs() {
    const res = await fetch(`/api/platform/bug-reports?project=${PROJECT_KEY}`);
    const d = await res.json();
    setBugs(d.bugs || []);
  }

  async function refreshFeatures() {
    const res = await fetch(`/api/platform/feature-requests?project=${PROJECT_KEY}`);
    const d = await res.json();
    setFeatures(d.features || d.featureRequests || []);
  }

  const handleBugSubmit = async (data: BugReportPayload) => {
    setSubmitError(null);
    // Map shared-ui payload → /api/platform/bug-reports POST contract.
    // The same-origin route writes directly to the DB via NextAuth session,
    // skipping the API-key auth path used by /api/platform/ingest/bug-reports.
    const body = {
      project: PROJECT_KEY,
      reportedByUserId: user?.email ?? '',
      reportedByName: user?.name ?? null,
      reportedByEmail: user?.email ?? null,
      title: data.title,
      description: data.description,
      stepsToReproduce: data.stepsToReproduce ?? null,
      expectedBehavior: data.expectedBehavior ?? null,
      severity: data.severity,
      priority: data.priority,
      pageUrl: data.pageUrl ?? null,
      browserInfo: data.browserInfo ?? {},
    };
    const res = await fetch('/api/platform/bug-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setSubmitError('Submission failed. Please try again.');
      throw new Error('Submission failed');
    }
    setShowBugForm(false);
    await refreshBugs();
  };

  const handleFeatureSubmit = async (data: FeatureRequestPayload) => {
    setSubmitError(null);
    // Map shared-ui FeatureRequestPayload → /api/platform/feature-requests POST.
    // shared-ui ships 'importance' (urgent|nice_to_have|just_an_idea); the
    // platform schema uses 'priority' on feature_requests — map them across.
    const importanceToPriority: Record<string, string> = {
      urgent: 'high',
      nice_to_have: 'normal',
      just_an_idea: 'low',
    };
    const body = {
      project: PROJECT_KEY,
      requestedByUserId: user?.email ?? '',
      requestedByName: user?.name ?? null,
      requestedByEmail: user?.email ?? null,
      title: data.title,
      description: data.description,
      useCase: data.useCase ?? null,
      priority: importanceToPriority[data.importance] ?? 'normal',
    };
    const res = await fetch('/api/platform/feature-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setSubmitError('Submission failed. Please try again.');
      throw new Error('Submission failed');
    }
    setShowFeatureForm(false);
    await refreshFeatures();
  };

  if (status === 'loading' || !user) {
    return (
      <div className="flex min-h-screen bg-zinc-950 text-zinc-200">
        <AdminSidebar />
        <main className="flex-1 overflow-auto p-8">
          <p className="text-zinc-400">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-200">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Bug / Feature Request</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Report bugs and request features. All submissions land in the central tracker for triage and build planning.
          </p>
        </div>

        {submitError && (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {submitError}
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex border-b border-zinc-800">
            {(['bugs', 'features'] as const).map(tab => {
              const count = tab === 'bugs' ? bugs.length : features.length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-5 py-2.5 -mb-px text-sm border-b-2 ${
                    isActive
                      ? 'border-teal-400 text-zinc-100 font-semibold'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab === 'bugs' ? <Bug size={15} /> : <Lightbulb size={15} />}
                  {tab === 'bugs' ? 'Bug Reports' : 'Feature Requests'}
                  {count > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
                      isActive ? 'bg-teal-400 text-zinc-900' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowBugForm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              <Bug size={14} /> Report a Bug
            </button>
            <button
              onClick={() => setShowFeatureForm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              <Lightbulb size={14} /> Request a Feature
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map(n => (
              <div key={n} className="h-[72px] rounded-lg border border-zinc-800 bg-zinc-900/60" />
            ))}
          </div>
        ) : activeTab === 'bugs' ? (
          bugs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Bug size={48} className="text-zinc-600 mb-4" />
              <p className="text-base font-semibold">No bug reports yet</p>
              <p className="mt-2 text-sm text-zinc-400">Found something? Let us know.</p>
              <button onClick={() => setShowBugForm(true)} className="mt-5 px-4 py-2 rounded-md bg-teal-500 text-zinc-900 text-sm font-semibold hover:bg-teal-400">
                Report a Bug
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
              {bugs.map((bug, idx) => (
                <div key={bug.id} className={`flex items-center justify-between gap-4 px-5 py-4 ${idx < bugs.length - 1 ? 'border-b border-zinc-800' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{bug.title}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {formatDate(bug.createdAt)} &middot; {bug.severity} &middot; {bug.priority === 'fix_now' ? 'Fix Now' : 'Fix Later'}
                    </p>
                  </div>
                  <StatusBadge status={bug.status} />
                </div>
              ))}
            </div>
          )
        ) : features.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Lightbulb size={48} className="text-zinc-600 mb-4" />
            <p className="text-base font-semibold">No feature requests yet</p>
            <p className="mt-2 text-sm text-zinc-400">Have an idea? Share it.</p>
            <button onClick={() => setShowFeatureForm(true)} className="mt-5 px-4 py-2 rounded-md bg-teal-500 text-zinc-900 text-sm font-semibold hover:bg-teal-400">
              Request a Feature
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
            {features.map((feature, idx) => (
              <div key={feature.id} className={`flex items-center justify-between gap-4 px-5 py-4 ${idx < features.length - 1 ? 'border-b border-zinc-800' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{feature.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatDate(feature.createdAt)}
                    {feature.priority && <> &middot; {feature.priority}</>}
                    {feature.buildPlanStatus === 'ready' && <span className="text-teal-400 font-medium"> &middot; Build plan ready</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={feature.status} />
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <ThumbsUp size={13} /> {feature.upvotes ?? 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <SlideOver open={showBugForm} onClose={() => setShowBugForm(false)}>
        <BugReportForm
          project={PROJECT_KEY}
          userId={user.email ?? ''}
          userName={user.name ?? ''}
          userEmail={user.email ?? ''}
          theme="triarch-security"
          onSubmit={handleBugSubmit}
          onCancel={() => setShowBugForm(false)}
        />
      </SlideOver>

      <SlideOver open={showFeatureForm} onClose={() => setShowFeatureForm(false)}>
        <FeatureRequestForm
          project={PROJECT_KEY}
          userId={user.email ?? ''}
          userName={user.name ?? ''}
          userEmail={user.email ?? ''}
          theme="triarch-security"
          onSubmit={handleFeatureSubmit}
          onCancel={() => setShowFeatureForm(false)}
        />
      </SlideOver>
    </div>
  );
}
