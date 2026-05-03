import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { menuPages } from '@/db/schema';

export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { sectionId, key, label, icon, path, sortOrder, minRole, badgeSource } = body;

  if (!sectionId || !key || !label || !path) {
    return NextResponse.json({ error: 'sectionId, key, label, and path are required' }, { status: 400 });
  }

  const [page] = await db.insert(menuPages).values({
    sectionId,
    key,
    label,
    icon: icon ?? null,
    path,
    sortOrder: sortOrder ?? 0,
    minRole: minRole ?? 'admin',
    badgeSource: badgeSource ?? null,
  }).returning();

  return NextResponse.json(page, { status: 201 });
}
