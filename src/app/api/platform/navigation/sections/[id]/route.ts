import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { menuSections } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { key, label, icon, sortOrder, minRole, isActive } = body;

  const [updated] = await db.update(menuSections)
    .set({
      ...(key !== undefined && { key }),
      ...(label !== undefined && { label }),
      ...(icon !== undefined && { icon }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(minRole !== undefined && { minRole }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    })
    .where(eq(menuSections.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const [deleted] = await db.delete(menuSections)
    .where(eq(menuSections.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
