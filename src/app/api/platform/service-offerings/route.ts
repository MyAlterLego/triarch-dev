import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { serviceOfferings, offeringComponents, offeringMilestones } from '@/db/schema';
import { eq, desc, asc } from 'drizzle-orm';

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;

  const [offerings, allComponents, allMilestones] = await Promise.all([
    db.select().from(serviceOfferings).orderBy(asc(serviceOfferings.createdAt)),
    db.select().from(offeringComponents).orderBy(asc(offeringComponents.sortOrder)),
    db.select().from(offeringMilestones).orderBy(asc(offeringMilestones.sortOrder)),
  ]);

  const result = offerings.map((offering) => ({
    ...offering,
    componentsList: allComponents.filter((c) => c.offeringId === offering.id),
    milestonesList: allMilestones.filter((m) => m.offeringId === offering.id),
  }));

  return NextResponse.json({ offerings: result });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { key, name, shortDescription, fullDescription, category, pricingModel, pricingDetails, durationMonths, websiteVisible, websiteFeatures, websiteCtaText, websiteCtaUrl } = body;

  if (!key || !name || !category || !pricingModel) {
    return NextResponse.json({ error: 'key, name, category, and pricingModel are required' }, { status: 400 });
  }

  const [offering] = await db.insert(serviceOfferings).values({
    key,
    name,
    shortDescription: shortDescription ?? null,
    fullDescription: fullDescription ?? null,
    category,
    pricingModel,
    pricingDetails: pricingDetails ?? {},
    durationMonths: durationMonths ?? null,
    websiteVisible: websiteVisible ?? false,
    websiteFeatures: websiteFeatures ?? [],
    websiteCtaText: websiteCtaText ?? 'Learn More',
    websiteCtaUrl: websiteCtaUrl ?? null,
    createdBy: session!.user?.email ?? null,
  }).returning();

  return NextResponse.json(offering, { status: 201 });
}
