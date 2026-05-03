import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { menuSections, menuPages, menuSubpages } from '@/db/schema';
import { eq } from 'drizzle-orm';

interface ReorderItem {
  id: string;
  sortOrder: number;
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { type, items } = body as { type: 'section' | 'page' | 'subpage'; items: ReorderItem[] };

  if (!type || !items?.length) {
    return NextResponse.json({ error: 'type and items are required' }, { status: 400 });
  }

  const table = type === 'section' ? menuSections : type === 'page' ? menuPages : menuSubpages;

  for (const item of items) {
    await db.update(table)
      .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
      .where(eq(table.id, item.id));
  }

  return NextResponse.json({ success: true });
}
