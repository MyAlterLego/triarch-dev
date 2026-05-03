'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, Trash2, Loader2, X, AlertCircle } from 'lucide-react';

type MemberRole = 'admin' | 'viewer' | 'staff';

interface Member {
  id: string;
  projectKey: string;
  email: string;
  role: MemberRole;
  createdAt: string;
}

interface Props {
  projectKey: string;
  projectName: string;
  initialMembers: Member[];
}

const ROLE_COLORS: Record<'admin' | 'viewer' | 'staff', string> = {
  admin:  'bg-teal-500/20 text-teal-400 border-teal-500/30',
  viewer: 'bg-zinc-700 text-zinc-400 border-zinc-600',
  staff:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export default function MembersClient({ projectKey, projectName, initialMembers }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const isEmailValid = email.includes('@') && email.includes('.');

  // Auto-dismiss success banner after 4 seconds.
  useEffect(() => {
    if (banner?.kind === 'success') {
      const timer = setTimeout(() => setBanner(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [banner]);

  async function handleAdd() {
    if (!isEmailValid || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/platform/projects/${projectKey}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (res.status === 201) {
        setMembers((prev) => [...prev, data as Member]);
        setBanner({ kind: 'success', message: `${email} added as ${role}.` });
        setEmail('');
        setRole('viewer');
      } else if (res.status === 409) {
        setBanner({ kind: 'error', message: data.error ?? 'Duplicate email.' });
      } else {
        setBanner({ kind: 'error', message: data.error ?? 'Something went wrong. Please try again.' });
      }
    } catch {
      setBanner({ kind: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(member: Member) {
    setRemovingId(member.id);
    try {
      const res = await fetch(
        `/api/platform/projects/${projectKey}/members/${encodeURIComponent(member.email)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== member.id));
        setBanner({ kind: 'success', message: `${member.email} removed.` });
      } else {
        setBanner({ kind: 'error', message: 'Something went wrong. Please try again.' });
      }
    } catch {
      setBanner({ kind: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setRemovingId(null);
    }
  }

  function dismissBanner() {
    setBanner(null);
  }

  const memberCount = members.length;

  return (
    <div className="p-8 max-w-2xl">
      {/* Breadcrumb */}
      <button
        onClick={() => router.push('/admin/platform/projects')}
        className="text-xs text-zinc-500 hover:text-zinc-300 mb-4 block"
      >
        &larr; Back to projects
      </button>

      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Users size={24} className="text-teal-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">{projectName} Members</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {memberCount} member{memberCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Add Member form card */}
      <div className="mb-6 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className="flex-1 w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500 disabled:opacity-50"
              disabled={adding}
            />
            {email && !isEmailValid && (
              <p className="text-[10px] text-red-400 mt-1">Enter a valid email address</p>
            )}
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'viewer')}
            className="w-28 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500 disabled:opacity-50"
            disabled={adding}
          >
            <option value="admin">admin</option>
            <option value="viewer">viewer</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={!isEmailValid || adding}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 flex-shrink-0"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Add Member
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {banner && banner.kind === 'success' && (
        <div className="mb-4 p-4 rounded-md border text-sm bg-green-500/10 border-green-500/20 text-green-400">
          <div className="flex items-center justify-between">
            <span>{banner.message}</span>
            <button onClick={dismissBanner}><X size={14} /></button>
          </div>
        </div>
      )}
      {banner && banner.kind === 'error' && (
        <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle size={14} /> {banner.message}
        </div>
      )}

      {/* Members table card */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800">Email</th>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800">Role</th>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800">Joined</th>
              <th className="px-4 py-2 border-b border-zinc-800" />
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="py-12 text-center">
                    <Users size={32} className="mx-auto mb-3 text-zinc-700" />
                    <p className="text-sm text-zinc-500">No members yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Add the first member above to grant project access.</p>
                  </div>
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-200">
                    <span className="font-mono text-[10px]">{member.email}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-200">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${ROLE_COLORS[member.role]}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(member.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {member.role !== 'staff' && (
                      <button
                        onClick={() => handleRemove(member)}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                        aria-label={`Remove ${member.email}`}
                      >
                        {removingId === member.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
