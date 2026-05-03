import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { menuSections } from '@/db/schema';

const PROJECT = 'triarch-dev';

export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { key, label, icon, sortOrder, minRole } = body;

  if (!key || !label) {
    return NextResponse.json({ error: 'key and label are required' }, { status: 400 });
  }

  const [section] = await db.insert(menuSections).values({
    project: PROJECT,
    key,
    label,
    icon: icon ?? null,
    sortOrder: sortOrder ?? 0,
    minRole: minRole ?? 'admin',
  }).returning();

  return NextResponse.json(section, { status: 201 });
}
