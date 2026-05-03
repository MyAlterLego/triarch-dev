import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { menuSections, menuPages, menuSubpages } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

const PROJECT = 'triarch-dev';

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;

  const sections = await db
    .select()
    .from(menuSections)
    .where(eq(menuSections.project, PROJECT))
    .orderBy(asc(menuSections.sortOrder));

  const pages = await db
    .select()
    .from(menuPages)
    .orderBy(asc(menuPages.sortOrder));

  const subpageRows = await db
    .select()
    .from(menuSubpages)
    .orderBy(asc(menuSubpages.sortOrder));

  const tree = sections.map((section) => ({
    ...section,
    pages: pages
      .filter((p) => p.sectionId === section.id)
      .map((page) => ({
        ...page,
        subpages: subpageRows.filter((sp) => sp.pageId === page.id),
      })),
  }));

  return NextResponse.json({ sections: tree });
}
