import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { reportSectionTypes } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;

  const types = await db.select().from(reportSectionTypes)
    .where(eq(reportSectionTypes.isActive, true))
    .orderBy(asc(reportSectionTypes.sortOrder));

  return NextResponse.json({ types });
}
