import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { menuSubpages } from '@/db/schema';

export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { pageId, key, label, path, sortOrder, minRole } = body;

  if (!pageId || !key || !label || !path) {
    return NextResponse.json({ error: 'pageId, key, label, and path are required' }, { status: 400 });
  }

  const [subpage] = await db.insert(menuSubpages).values({
    pageId,
    key,
    label,
    path,
    sortOrder: sortOrder ?? 0,
    minRole: minRole ?? 'admin',
  }).returning();

  return NextResponse.json(subpage, { status: 201 });
}
