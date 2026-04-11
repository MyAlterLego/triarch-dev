'use client';

import { useState, type FormEvent } from 'react';

interface BugReportFormProps {
  projectKey: string;
  apiKey: string;
  ingestUrl?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

/**
 * Reusable bug report form that POSTs to the triarch-dev central ingest API.
 * Drop this into any triarch.dev project to enable centralized bug reporting.
 *
 * Usage:
 *   <BugReportForm projectKey="darksouls-rpg" apiKey="tdp_..." userId="user123" />
 */
export function BugReportForm({
  projectKey,
  apiKey,
  ingestUrl = 'https://admin.triarch.dev/api/platform/ingest/bug-reports',
  userId = 'anonymous',
  userName,
  userEmail,
  onSuccess,
  onError,
}: BugReportFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          project: projectKey,
          reportedByUserId: userId,
          reportedByName: userName,
          reportedByEmail: userEmail,
          title: title.trim(),
          description: description.trim(),
          severity,
          stepsToReproduce: stepsToReproduce.trim() || undefined,
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          browserInfo: typeof navigator !== 'undefined' ? { userAgent: navigator.userAgent } : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Submit failed' }));
        onError?.(data.error || 'Submit failed');
      } else {
        setSubmitted(true);
        setTitle('');
        setDescription('');
        setStepsToReproduce('');
        setSeverity('medium');
        onSuccess?.();
        setTimeout(() => setSubmitted(false), 3000);
      }
    } catch (err) {
      onError?.((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Bug title"
        required
        className={inputClass}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the bug..."
        required
        rows={3}
        className={inputClass}
      />
      <textarea
        value={stepsToReproduce}
        onChange={(e) => setStepsToReproduce(e.target.value)}
        placeholder="Steps to reproduce (optional)"
        rows={2}
        className={inputClass}
      />
      <select
        value={severity}
        onChange={(e) => setSeverity(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
        className={inputClass}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>
      <button
        type="submit"
        disabled={submitting || !title.trim() || !description.trim()}
        className="px-4 py-2 bg-teal-600 text-white text-sm rounded-md hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Submitting...' : submitted ? 'Submitted!' : 'Report Bug'}
      </button>
    </form>
  );
}
