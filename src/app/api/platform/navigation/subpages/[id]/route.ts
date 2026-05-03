import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { menuSubpages } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { pageId, key, label, path, sortOrder, minRole, isActive } = body;

  const [updated] = await db.update(menuSubpages)
    .set({
      ...(pageId !== undefined && { pageId }),
      ...(key !== undefined && { key }),
      ...(label !== undefined && { label }),
      ...(path !== undefined && { path }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(minRole !== undefined && { minRole }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    })
    .where(eq(menuSubpages.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Subpage not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const [deleted] = await db.delete(menuSubpages)
    .where(eq(menuSubpages.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Subpage not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
