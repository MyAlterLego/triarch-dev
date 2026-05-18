'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase, Plus, ChevronDown, ChevronRight, Globe, Database,
  GitBranch, Server, ExternalLink, Trash2, X, Loader2, Users,
} from 'lucide-react';
import BuildTriggerSection from './BuildTriggerSection';

interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  firebaseProjectId: string | null;
  crdbCluster: string | null;
  crdbDatabase: string | null;
  crdbUser: string | null;
  subdomain: string | null;
  customDomain: string | null;
  deployedUrl: string | null;
  githubRepo: string | null;
  techStack: Record<string, string>;
  currentVersion: string | null;
  ecosystem: string;
  apiKey: string | null;
  buildTriggerMode?: string;
  localPath?: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  inactive: 'bg-zinc-700 text-zinc-400 border-zinc-600',
  provisioning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  archived: 'bg-zinc-800 text-zinc-500 border-zinc-700',
};

export default function ProjectsPage() {
  const appRouter = useRouter();
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<Record<string, unknown> | null>(null);

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/platform/projects');
    const data = await res.json();
    setProjectsList(data.projects);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  async function provisionDatabase(projectId: string, projectKey: string) {
    if (!confirm(`Create CRDB database "${projectKey.replace(/-/g, '_')}" and SQL user "${projectKey}" on triarchdev cluster?`)) return;
    setProvisioning(projectId);
    setProvisionResult(null);

    const res = await fetch('/api/platform/projects/provision-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ databaseName: projectKey.replace(/-/g, '_'), userName: projectKey }),
    });
    const result = await res.json();
    setProvisionResult(result);

    if (result.success) {
      // Update the project record with the new DB details
      await fetch(`/api/platform/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crdbCluster: 'triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257',
          crdbDatabase: projectKey.replace(/-/g, '_'),
          crdbUser: projectKey,
        }),
      });
      await fetchProjects();
    }
    setProvisioning(null);
  }

  async function provisionDns(projectId: string, subdomain: string) {
    if (!confirm(`Create DNS A record for ${subdomain}.triarch.dev → Firebase App Hosting?`)) return;
    setProvisioning(projectId);
    setProvisionResult(null);

    const res = await fetch('/api/platform/projects/provision-dns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain }),
    });
    const result = await res.json();
    setProvisionResult(result);

    if (result.success) {
      await fetch(`/api/platform/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain,
          deployedUrl: `https://${subdomain}.triarch.dev`,
        }),
      });
      await fetchProjects();
    }
    setProvisioning(null);
  }

  async function deleteProject(id: string) {
    if (!confirm('Remove this project from the registry? This does NOT delete the database or Firebase project.')) return;
    await fetch(`/api/platform/projects/${id}`, { method: 'DELETE' });
    if (expandedId === id) setExpandedId(null);
    await fetchProjects();
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Briefcase size={24} className="text-teal-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {projectsList.length} project{projectsList.length !== 1 ? 's' : ''} in ecosystem
            </p>
          </div>
        </div>
        <button onClick={() => appRouter.push('/admin/platform/projects/new')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500">
          <Plus size={14} /> New Project
        </button>
      </div>

      {/* Provision result banner */}
      {provisionResult && (
        <div className={`mb-4 p-4 rounded-md border text-sm ${provisionResult.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          <div className="flex items-center justify-between">
            <span>{provisionResult.success ? provisionResult.message as string : provisionResult.error as string}</span>
            <button onClick={() => setProvisionResult(null)} className="ml-2"><X size={14} /></button>
          </div>
          {typeof provisionResult.connectionString === 'string' && (
            <pre className="mt-2 text-xs font-mono bg-zinc-900 p-2 rounded overflow-auto text-zinc-300">
              {provisionResult.connectionString}
            </pre>
          )}
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projectsList.map((project) => {
            const expanded = expandedId === project.id;
            const domain = project.customDomain ?? (project.subdomain ? `${project.subdomain}.triarch.dev` : null);
            const stack = project.techStack as Record<string, string>;

            return (
              <div key={project.id} className={`rounded-lg border bg-zinc-900/50 overflow-hidden transition-colors ${expanded ? 'border-zinc-600' : 'border-zinc-800'}`}>
                {/* Card header */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white truncate">{project.name}</h3>
                        {project.currentVersion && (
                          <span className="text-[10px] font-mono text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">{project.currentVersion}</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{project.description}</p>
                    </div>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] border flex-shrink-0 ${STATUS_COLORS[project.status] ?? 'bg-zinc-700 text-zinc-400 border-zinc-600'}`}>
                      {project.status}
                    </span>
                  </div>

                  {/* Quick info */}
                  <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                    {domain && (
                      <a href={project.deployedUrl ?? `https://${domain}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-teal-400 transition-colors">
                        <Globe size={11} /> {domain}
                      </a>
                    )}
                    {project.crdbDatabase && (
                      <span className="flex items-center gap-1">
                        <Database size={11} /> {project.crdbDatabase}
                      </span>
                    )}
                    {project.githubRepo && (
                      <a href={`https://github.com/${project.githubRepo}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-teal-400 transition-colors">
                        <GitBranch size={11} /> {project.githubRepo.split('/')[1]}
                      </a>
                    )}
                    {project.firebaseProjectId && (
                      <span className="flex items-center gap-1">
                        <Server size={11} /> {project.firebaseProjectId}
                      </span>
                    )}
                  </div>

                  {/* Tech stack pills */}
                  {Object.keys(stack).length > 0 && (
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      {Object.entries(stack).map(([key, val]) => (
                        <span key={key} className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{val}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expand toggle */}
                <div className="border-t border-zinc-800">
                  <button
                    onClick={() => setExpandedId(expanded ? null : project.id)}
                    className="w-full flex items-center justify-center gap-1 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {expanded ? 'Collapse' : 'Infrastructure Details'}
                  </button>
                </div>

                {/* Expanded details */}
                {expanded && (
                  <div className="border-t border-zinc-800 p-4 space-y-3">
                    <BuildTriggerSection project={project} onSaved={fetchProjects} />
                    {/* Infrastructure grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-zinc-500 block mb-0.5">CRDB Cluster</span>
                        <span className="text-zinc-300 font-mono text-[10px]">{project.crdbCluster ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block mb-0.5">CRDB Database</span>
                        <span className="text-zinc-300">{project.crdbDatabase ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block mb-0.5">CRDB User</span>
                        <span className="text-zinc-300">{project.crdbUser ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block mb-0.5">Firebase Project</span>
                        <span className="text-zinc-300">{project.firebaseProjectId ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block mb-0.5">Ecosystem</span>
                        <span className="text-zinc-300">{project.ecosystem}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block mb-0.5">API Key</span>
                        <span className="text-zinc-300 font-mono text-[10px]">{project.apiKey ? `${project.apiKey.slice(0, 12)}...` : '—'}</span>
                      </div>
                    </div>

                    {/* Provisioning actions */}
                    <div className="pt-2 border-t border-zinc-800 flex items-center gap-2 flex-wrap">
                      {!project.crdbDatabase && (
                        <button
                          onClick={() => provisionDatabase(project.id, project.key)}
                          disabled={provisioning === project.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-600/30 disabled:opacity-50"
                        >
                          {provisioning === project.id ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                          Create Database
                        </button>
                      )}
                      {!project.subdomain && project.ecosystem === 'triarch-dev' && (
                        <button
                          onClick={() => {
                            const sub = prompt('Subdomain (e.g., my-project):');
                            if (sub) provisionDns(project.id, sub);
                          }}
                          disabled={provisioning === project.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-md hover:bg-purple-600/30 disabled:opacity-50"
                        >
                          <Globe size={12} /> Add Subdomain
                        </button>
                      )}
                      <button
                        onClick={() => appRouter.push(`/admin/platform/projects/${project.key}/members`)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-zinc-700/30 text-zinc-400 border border-zinc-600/30 rounded-md hover:bg-zinc-700/50"
                      >
                        <Users size={12} /> Manage Members
                      </button>
                      <button
                        onClick={() => deleteProject(project.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-zinc-600 hover:text-red-400 ml-auto"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
