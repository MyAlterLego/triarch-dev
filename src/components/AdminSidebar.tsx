'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DynamicSidebar } from '@myalterlego/shared-ui';
import { APP_VERSION } from '@/lib/version';

/**
 * AdminSidebar — thin wrapper around DynamicSidebar from @myalterlego/shared-ui (DEV-04)
 * Navigation data fetched from /api/platform/navigation
 * Preserves named export so admin/layout.tsx needs no changes.
 */
export function AdminSidebar() {
  const pathname = usePathname();

  const logoSlot = (
    <div className="px-5 py-5">
      <span
        className="text-xl font-bold tracking-widest uppercase"
        style={{ color: 'var(--accent-gold)' }}
      >
        TRIARCH
      </span>
      <span
        className="block text-xs tracking-widest mt-0.5"
        style={{ color: 'var(--text-muted)' }}
      >
        DEV CONSOLE
      </span>
    </div>
  );

  const footerSlot = (
    <div className="px-5 py-3">
      <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
        {APP_VERSION}
      </span>
    </div>
  );

  return (
    <DynamicSidebar
      project="triarch-dev"
      authToken="cookie"
      userRole="admin"
      apiBase=""
      currentPath={pathname}
      logoSlot={logoSlot}
      footerSlot={footerSlot}
    />
  );
}
