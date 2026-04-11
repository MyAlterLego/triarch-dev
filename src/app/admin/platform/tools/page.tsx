'use client';

import React, { useState, useCallback } from 'react';
import { useProjectOptions } from '@/lib/use-projects';
import {
  Wrench, GitBranch, Flame, Navigation, Copy, Check, ChevronDown, ChevronRight,
  FolderGit2, FileCode,
} from 'lucide-react';

type Tool = 'cicd' | 'firebase-config' | 'nav-templates';

interface GeneratedFiles {
  [filename: string]: string;
}

export default function ProjectToolsPage() {
  const PROJECTS = useProjectOptions();
  const projectsOnly = PROJECTS.filter((p) => p.value !== 'all');
  const [selectedProject, setSelectedProject] = useState('');
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [files, setFiles] = useState<GeneratedFiles | null>(null);
  const [templates, setTemplates] = useState<Record<string, { name: string }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const generate = useCallback(async (tool: Tool, extra?: Record<string, string>) => {
    if (!selectedProject && tool !== 'nav-templates') return;
    setLoading(true);
    setActiveTool(tool);
    setFiles(null);
    setTemplates(null);

    const res = await fetch('/api/platform/projects/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, projectKey: selectedProject, ...extra }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files) setFiles(data.files);
      if (data.templates) setTemplates(data.templates);
      if (data.template) {
        setFiles({ [`${extra?.templateKey}-nav-seed.json`]: JSON.stringify(data.template, null, 2) });
      }
    }
    setLoading(false);
  }, [selectedProject]);

  const copyToClipboard = useCallback((filename: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2000);
  }, []);

  const generateScaffold = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    setActiveTool('scaffold' as Tool);
    setFiles(null);
    setTemplates(null);

    const res = await fetch('/api/platform/projects/tools/scaffold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: selectedProject }),
    });
    if (res.ok) {
      const data = await res.json();
      setFiles(data.files);
    }
    setLoading(false);
  }, [selectedProject]);

  const scaffoldRepo = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    setActiveTool('scaffold-repo' as Tool);
    setFiles(null);
    setTemplates(null);

    const res = await fetch('/api/platform/projects/scaffold-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: selectedProject }),
    });
    const data = await res.json();
    if (res.ok) {
      setFiles({ 'result.txt': `Repository created: ${data.repo}\nURL: ${data.url}\nClone: ${data.cloneUrl}` });
    } else {
      setFiles({ 'error.txt': `Error: ${data.error}` });
    }
    setLoading(false);
  }, [selectedProject]);

  const tools: Array<{ key: Tool | string; label: string; icon: React.ReactNode; description: string; needsProject: boolean; onClick?: () => void }> = [
    { key: 'scaffold', label: 'App Scaffold', icon: <FileCode size={16} />, description: 'Generate full Next.js starter with triarch conventions', needsProject: true, onClick: generateScaffold },
    { key: 'scaffold-repo', label: 'Create GitHub Repo', icon: <FolderGit2 size={16} />, description: 'Create a GitHub repo in MyAlterLego org and link to project', needsProject: true, onClick: scaffoldRepo },
    { key: 'cicd', label: 'CI/CD Workflows', icon: <GitBranch size={16} />, description: 'Generate GitHub Actions workflow files using shared-workflows', needsProject: true },
    { key: 'firebase-config', label: 'Firebase Config', icon: <Flame size={16} />, description: 'Generate .firebaserc, apphosting.yaml, firebase.json', needsProject: true },
    { key: 'nav-templates', label: 'Nav Templates', icon: <Navigation size={16} />, description: 'Pre-built navigation seed configs for common project types', needsProject: false },
  ];

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Wrench size={24} className="text-teal-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Project Tools</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Generators and templates for project provisioning</p>
        </div>
      </div>

      {/* Project selector */}
      <div className="mb-6">
        <label className="text-xs text-zinc-500 block mb-1.5 uppercase tracking-wider font-medium">Target Project</label>
        <select
          value={selectedProject}
          onChange={(e) => { setSelectedProject(e.target.value); setFiles(null); setTemplates(null); }}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500 w-64"
        >
          <option value="">Select project...</option>
          {projectsOnly.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Tool grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {tools.map((tool) => {
          const disabled = tool.needsProject && !selectedProject;
          return (
            <button
              key={tool.key}
              onClick={() => !disabled && (tool.onClick ? tool.onClick() : generate(tool.key as Tool))}
              disabled={disabled || loading}
              className={`p-4 rounded-lg border text-left transition-colors ${
                activeTool === tool.key
                  ? 'bg-teal-500/10 border-teal-500/30'
                  : disabled
                    ? 'bg-zinc-900/30 border-zinc-800 opacity-40 cursor-not-allowed'
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-teal-400">{tool.icon}</span>
                <span className="text-sm font-medium text-zinc-200">{tool.label}</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{tool.description}</p>
            </button>
          );
        })}
      </div>

      {/* Nav template selector */}
      {activeTool === 'nav-templates' && templates && (
        <div className="mb-6 flex gap-2">
          {Object.entries(templates).map(([key, tmpl]) => (
            <button
              key={key}
              onClick={() => generate('nav-templates', { templateKey: key })}
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:border-teal-500 transition-colors"
            >
              {tmpl.name}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="p-8 text-center">
          <div className="h-6 w-6 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin mx-auto" />
        </div>
      )}

      {/* Generated files */}
      {files && !loading && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Generated Files</h2>
          {Object.entries(files).map(([filename, content]) => {
            const isExpanded = expandedFile === filename;
            return (
              <div key={filename} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    onClick={() => setExpandedFile(isExpanded ? null : filename)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                    <span className="text-sm font-mono text-teal-400">{filename}</span>
                    <span className="text-[10px] text-zinc-600">{content.split('\n').length} lines</span>
                  </button>
                  <button
                    onClick={() => copyToClipboard(filename, content)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    {copiedFile === filename ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    {copiedFile === filename ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {isExpanded && (
                  <pre className="px-4 pb-4 text-xs text-zinc-400 font-mono overflow-x-auto whitespace-pre max-h-96">
                    {content}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
