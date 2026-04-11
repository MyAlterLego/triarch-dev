'use client';

import { useState, type FormEvent } from 'react';

interface FeatureRequestFormProps {
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
 * Reusable feature request form that POSTs to the triarch-dev central ingest API.
 * Drop this into any triarch.dev project to enable centralized feature tracking.
 *
 * Usage:
 *   <FeatureRequestForm projectKey="darksouls-rpg" apiKey="tdp_..." userId="user123" />
 */
export function FeatureRequestForm({
  projectKey,
  apiKey,
  ingestUrl = 'https://admin.triarch.dev/api/platform/ingest/bug-reports',
  userId = 'anonymous',
  userName,
  userEmail,
  onSuccess,
  onError,
}: FeatureRequestFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      // Feature requests go through the bug-reports ingest endpoint with a different shape
      // or a dedicated feature-requests ingest endpoint if it exists
      const res = await fetch(ingestUrl.replace('bug-reports', 'feature-requests'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          project: projectKey,
          requestedByUserId: userId,
          requestedByName: userName,
          requestedByEmail: userEmail,
          title: title.trim(),
          description: description.trim(),
          useCase: useCase.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Submit failed' }));
        onError?.(data.error || 'Submit failed');
      } else {
        setSubmitted(true);
        setTitle('');
        setDescription('');
        setUseCase('');
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
        placeholder="Feature title"
        required
        className={inputClass}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the feature..."
        required
        rows={3}
        className={inputClass}
      />
      <textarea
        value={useCase}
        onChange={(e) => setUseCase(e.target.value)}
        placeholder="Use case — why do you need this? (optional)"
        rows={2}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={submitting || !title.trim() || !description.trim()}
        className="px-4 py-2 bg-teal-600 text-white text-sm rounded-md hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Submitting...' : submitted ? 'Submitted!' : 'Request Feature'}
      </button>
    </form>
  );
}
