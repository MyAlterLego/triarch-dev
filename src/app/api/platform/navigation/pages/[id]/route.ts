import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { menuPages } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { sectionId, key, label, icon, path, sortOrder, minRole, isActive, badgeSource } = body;

  const [updated] = await db.update(menuPages)
    .set({
      ...(sectionId !== undefined && { sectionId }),
      ...(key !== undefined && { key }),
      ...(label !== undefined && { label }),
      ...(icon !== undefined && { icon }),
      ...(path !== undefined && { path }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(minRole !== undefined && { minRole }),
      ...(isActive !== undefined && { isActive }),
      ...(badgeSource !== undefined && { badgeSource }),
      updatedAt: new Date(),
    })
    .where(eq(menuPages.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const [deleted] = await db.delete(menuPages)
    .where(eq(menuPages.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
