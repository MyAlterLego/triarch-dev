/**
 * Triarch Dev Bug Report Widget
 *
 * Drop-in React component for any triarch.dev project.
 * Reports bugs directly to the triarch-dev control plane via ingest API.
 *
 * Usage:
 *   1. Set NEXT_PUBLIC_TRIARCH_API_KEY in your .env.local
 *   2. Set NEXT_PUBLIC_TRIARCH_API_URL (defaults to https://www.triarch.dev)
 *   3. Import and render: <BugReportWidget userId="..." userName="..." />
 *
 * The widget renders as a floating button (bottom-right) that opens a modal form.
 */
'use client';

import React, { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_TRIARCH_API_URL ?? 'https://www.triarch.dev';
const API_KEY = process.env.NEXT_PUBLIC_TRIARCH_API_KEY ?? '';

interface BugReportWidgetProps {
  userId: string;
  userName?: string;
  userEmail?: string;
}

export function BugReportWidget({ userId, userName, userEmail }: BugReportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    stepsToReproduce: '',
    severity: 'medium',
  });

  async function submit() {
    if (!form.title || !form.description) return;
    setSubmitting(true);

    try {
      await fetch(`${API_URL}/api/platform/ingest/bug-reports`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportedByUserId: userId,
          reportedByName: userName ?? null,
          reportedByEmail: userEmail ?? null,
          title: form.title,
          description: form.description,
          stepsToReproduce: form.stepsToReproduce || null,
          severity: form.severity,
          priority: 'fix_later',
          pageUrl: typeof window !== 'undefined' ? window.location.href : null,
          browserInfo: typeof navigator !== 'undefined' ? {
            userAgent: navigator.userAgent,
            language: navigator.language,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
          } : {},
        }),
      });

      setSubmitted(true);
      setForm({ title: '', description: '', stepsToReproduce: '', severity: 'medium' });
      setTimeout(() => { setSubmitted(false); setOpen(false); }, 2000);
    } catch (err) {
      console.error('Bug report failed:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!API_KEY) return null;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999,
          width: '48px', height: '48px', borderRadius: '50%',
          background: '#0d9488', color: 'white', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)', fontSize: '20px',
        }}
        title="Report a bug"
      >
        {'\uD83D\uDC1B'}
      </button>

      {/* Modal */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
        }}>
          <div style={{
            background: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px',
            padding: '24px', width: '100%', maxWidth: '440px', color: '#e4e4e7',
          }}>
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>{'\u2713'}</div>
                <p style={{ color: '#2dd4bf' }}>Bug report submitted. Thank you!</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Report a Bug</h3>
                  <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '18px' }}>{'\u00D7'}</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Title *</label>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Brief description of the issue"
                      style={{ width: '100%', padding: '8px 12px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#e4e4e7', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>What happened? *</label>
                    <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe the bug in detail"
                      rows={3}
                      style={{ width: '100%', padding: '8px 12px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#e4e4e7', fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Steps to reproduce</label>
                    <textarea value={form.stepsToReproduce} onChange={(e) => setForm({ ...form, stepsToReproduce: e.target.value })}
                      placeholder={'1. Go to...\n2. Click on...\n3. See error'}
                      rows={3}
                      style={{ width: '100%', padding: '8px 12px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#e4e4e7', fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Severity</label>
                    <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#e4e4e7', fontSize: '14px', outline: 'none' }}>
                      <option value="low">Low — Minor cosmetic issue</option>
                      <option value="medium">Medium — Something isn&apos;t working right</option>
                      <option value="high">High — Major feature is broken</option>
                      <option value="critical">Critical — Can&apos;t use the system</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                  <button onClick={() => setOpen(false)}
                    style={{ padding: '8px 16px', background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '14px' }}>
                    Cancel
                  </button>
                  <button onClick={submit} disabled={!form.title || !form.description || submitting}
                    style={{
                      padding: '8px 16px', background: '#0d9488', color: 'white', border: 'none',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
                      opacity: (!form.title || !form.description || submitting) ? 0.5 : 1,
                    }}>
                    {submitting ? 'Submitting...' : 'Submit Bug Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
