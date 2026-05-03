import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { serviceOfferings, offeringComponents, offeringMilestones } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name, shortDescription, fullDescription, category, status, pricingModel, pricingDetails, durationMonths, websiteVisible, websiteSortOrder, websiteFeatures, websiteCtaText, websiteCtaUrl } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (shortDescription !== undefined) updates.shortDescription = shortDescription;
  if (fullDescription !== undefined) updates.fullDescription = fullDescription;
  if (category !== undefined) updates.category = category;
  if (status !== undefined) updates.status = status;
  if (pricingModel !== undefined) updates.pricingModel = pricingModel;
  if (pricingDetails !== undefined) updates.pricingDetails = pricingDetails;
  if (durationMonths !== undefined) updates.durationMonths = durationMonths;
  if (websiteVisible !== undefined) updates.websiteVisible = websiteVisible;
  if (websiteSortOrder !== undefined) updates.websiteSortOrder = websiteSortOrder;
  if (websiteFeatures !== undefined) updates.websiteFeatures = websiteFeatures;
  if (websiteCtaText !== undefined) updates.websiteCtaText = websiteCtaText;
  if (websiteCtaUrl !== undefined) updates.websiteCtaUrl = websiteCtaUrl;

  const [updated] = await db.update(serviceOfferings).set(updates).where(eq(serviceOfferings.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const [deleted] = await db.delete(serviceOfferings).where(eq(serviceOfferings.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
