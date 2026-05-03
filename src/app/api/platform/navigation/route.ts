import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { menuSections, menuPages, menuSubpages } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import type { NavSection, NavPage } from '@/lib/navigation-types';

const ROLE_ORDER: Record<string, number> = {
  super_admin: 2,
  admin: 1,
  user: 0,
};

function hasMinRole(userRole: string, minRole: string): boolean {
  return (ROLE_ORDER[userRole] ?? 0) >= (ROLE_ORDER[minRole] ?? 0);
}

const PROJECT = 'triarch-dev';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Triarch staff get the full menu (super_admin); customer-admin members
  // get the project-scoped menu (admin). DB error or missing context falls
  // back to admin so we never lock anyone out of menu items they can reach.
  const ctx = await getCurrentUserContext(session);
  const userRole = ctx?.isStaff ? 'super_admin' : 'admin';

  const sections = await db
    .select()
    .from(menuSections)
    .where(eq(menuSections.project, PROJECT))
    .orderBy(asc(menuSections.sortOrder));

  const pages = await db
    .select()
    .from(menuPages)
    .orderBy(asc(menuPages.sortOrder));

  const subpages = await db
    .select()
    .from(menuSubpages)
    .orderBy(asc(menuSubpages.sortOrder));

  // Build nested tree
  const navSections: NavSection[] = sections
    .filter((s) => s.isActive && hasMinRole(userRole, s.minRole))
    .map((section) => {
      const sectionPages: NavPage[] = pages
        .filter((p) => p.sectionId === section.id && p.isActive && hasMinRole(userRole, p.minRole))
        .map((page) => ({
          id: page.id,
          key: page.key,
          label: page.label,
          icon: page.icon,
          path: page.path,
          sortOrder: page.sortOrder,
          isActive: page.isActive,
          minRole: page.minRole,
          badgeSource: page.badgeSource,
          subpages: subpages
            .filter((sp) => sp.pageId === page.id && sp.isActive && hasMinRole(userRole, sp.minRole))
            .map((sp) => ({
              id: sp.id,
              key: sp.key,
              label: sp.label,
              path: sp.path,
              sortOrder: sp.sortOrder,
              isActive: sp.isActive,
              minRole: sp.minRole,
            })),
        }));

      return {
        id: section.id,
        key: section.key,
        label: section.label,
        icon: section.icon,
        sortOrder: section.sortOrder,
        isActive: section.isActive,
        minRole: section.minRole,
        pages: sectionPages,
      };
    });

  return NextResponse.json({ sections: navSections });
}
