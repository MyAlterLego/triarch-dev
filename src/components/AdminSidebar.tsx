'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronRight,
  Columns3,
  LayoutDashboard,
  Settings,
  Menu as MenuIcon,
  Bug,
  FileText,
  Shield,
  Activity,
  Briefcase,
  PanelLeft,
} from 'lucide-react';
import { APP_VERSION } from '@/lib/version';
import type { NavData, NavSection, NavPage } from '@/lib/navigation-types';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  'layout-dashboard': LayoutDashboard,
  'columns-3': Columns3,
  settings: Settings,
  bug: Bug,
  'file-text': FileText,
  shield: Shield,
  activity: Activity,
  briefcase: Briefcase,
};

function getIcon(iconName: string | null, size = 16) {
  if (!iconName) return null;
  const Icon = ICON_MAP[iconName];
  if (!Icon) return null;
  return <Icon size={size} />;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [navData, setNavData] = useState<NavData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch('/api/platform/navigation')
      .then((r) => r.json())
      .then((data) => {
        setNavData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Auto-expand sections containing the active page (runs on nav data load + route changes)
  useEffect(() => {
    if (!navData?.sections) return;
    const expanded = new Set<string>();
    navData.sections.forEach((section: NavSection) => {
      if (section.pages?.some((p: NavPage) => pathname.startsWith(p.path))) {
        expanded.add(section.id);
      }
    });
    setExpandedSections(expanded);
  }, [pathname, navData]);

  function toggleSection(sectionId: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  function navigate(path: string) {
    router.push(path);
    setMobileOpen(false);
  }

  const sidebarContent = (
    <div className="flex flex-col h-full border-r" style={{ background: 'var(--color-admin-bg)', borderColor: 'var(--color-admin-border)' }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--color-admin-border)' }}>
        {collapsed ? (
          <span className="font-bold text-lg" style={{ color: 'var(--color-admin-accent)' }}>T</span>
        ) : (
          <>
            <span className="text-xl font-bold tracking-widest uppercase" style={{ color: 'var(--color-admin-accent)' }}>
              TRIARCH
            </span>
            <span className="block text-xs tracking-widest mt-0.5" style={{ color: 'var(--color-admin-text-muted)' }}>
              DEV CONSOLE
            </span>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {loading && (
          <div className="space-y-2 px-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 bg-zinc-800/50 rounded animate-pulse" />
            ))}
          </div>
        )}
        {!loading && navData?.sections?.map((section) => (
          <div key={section.id} className="mb-1">
            {section.pages.length === 1 ? (
              // Single-page section: render as flat nav item
              <button
                onClick={() => navigate(section.pages[0].path)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
                  pathname === section.pages[0].path || pathname.startsWith(section.pages[0].path + '/')
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {getIcon(section.icon)}
                {!collapsed && <span>{section.label}</span>}
              </button>
            ) : (
              // Multi-page section: collapsible
              <>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {!collapsed && (
                    <ChevronRight
                      size={12}
                      className={`transition-transform ${expandedSections.has(section.id) ? 'rotate-90' : ''}`}
                    />
                  )}
                  {getIcon(section.icon, 14)}
                  {!collapsed && <span>{section.label}</span>}
                </button>
                {expandedSections.has(section.id) && !collapsed && (
                  <div className="ml-4 space-y-0.5">
                    {section.pages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => navigate(page.path)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                          pathname === page.path || pathname.startsWith(page.path + '/')
                            ? 'bg-zinc-800 text-white'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                        }`}
                      >
                        {getIcon(page.icon)}
                        <span>{page.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800">
        <div className="px-5 py-3">
          <span className="text-[11px] text-zinc-600 font-mono">{APP_VERSION}</span>
        </div>
        <div className="px-3 pb-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeft size={16} style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300"
      >
        <MenuIcon size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-60 h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div
        className="hidden lg:block flex-shrink-0 h-screen sticky top-0"
        style={{ width: collapsed ? '56px' : '240px', transition: 'width 0.15s ease' }}
      >
        {sidebarContent}
      </div>
    </>
  );
}
