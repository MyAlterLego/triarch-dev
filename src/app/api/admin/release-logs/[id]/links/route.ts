import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { releaseLogLinks, bugReports, featureRequests } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireStaff } from '@/lib/api-auth';

const VALID_LINK_TYPES = ['bug', 'feature', 'external'] as const;
type LinkType = (typeof VALID_LINK_TYPES)[number];

export type ReleaseLogLink = {
  id: string;
  releaseId: string;
  linkType: LinkType;
  bugId: string | null;
  featureId: string | null;
  externalUrl: string | null;
  source: 'commit' | 'manual';
  createdAt: string;
  bugTitle?: string;
  featureTitle?: string;
};

/**
 * GET /api/admin/release-logs/[id]/links
 * Returns all links for the given release, augmented with bug/feature titles.
 * Staff-only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;

  const rows = await db
    .select()
    .from(releaseLogLinks)
    .where(eq(releaseLogLinks.releaseId, id));

  // Batch-augment bug titles
  const bugIds = rows.filter((r) => r.bugId !== null).map((r) => r.bugId as string);
  const bugTitleMap = new Map<string, string>();
  if (bugIds.length > 0) {
    const bugs = await db
      .select({ id: bugReports.id, title: bugReports.title })
      .from(bugReports)
      .where(inArray(bugReports.id, bugIds));
    for (const bug of bugs) {
      bugTitleMap.set(bug.id, bug.title);
    }
  }

  // Batch-augment feature titles
  const featureIds = rows.filter((r) => r.featureId !== null).map((r) => r.featureId as string);
  const featureTitleMap = new Map<string, string>();
  if (featureIds.length > 0) {
    const features = await db
      .select({ id: featureRequests.id, title: featureRequests.title })
      .from(featureRequests)
      .where(inArray(featureRequests.id, featureIds));
    for (const feature of features) {
      featureTitleMap.set(feature.id, feature.title);
    }
  }

  const links: ReleaseLogLink[] = rows.map((r) => ({
    id: r.id,
    releaseId: r.releaseId,
    linkType: r.linkType as LinkType,
    bugId: r.bugId,
    featureId: r.featureId,
    externalUrl: r.externalUrl,
    source: r.source as 'commit' | 'manual',
    createdAt: r.createdAt.toISOString(),
    ...(r.bugId ? { bugTitle: bugTitleMap.get(r.bugId) } : {}),
    ...(r.featureId ? { featureTitle: featureTitleMap.get(r.featureId) } : {}),
  }));

  return NextResponse.json({ links });
}

/**
 * POST /api/admin/release-logs/[id]/links
 * Creates a manual link for the given release. Staff-only.
 * Body: { linkType: 'bug'|'feature'|'external', bugId?, featureId?, externalUrl? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;

  let body: { linkType?: string; bugId?: string; featureId?: string; externalUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { linkType, bugId, featureId, externalUrl } = body;

  // Validate linkType discriminant
  if (!linkType || !(VALID_LINK_TYPES as readonly string[]).includes(linkType)) {
    return NextResponse.json(
      { error: 'invalid_link_type', valid: VALID_LINK_TYPES },
      { status: 400 },
    );
  }

  // Validate discriminant-matching ID/URL is present
  if (linkType === 'bug' && !bugId) {
    return NextResponse.json({ error: 'bugId required when linkType=bug' }, { status: 400 });
  }
  if (linkType === 'feature' && !featureId) {
    return NextResponse.json({ error: 'featureId required when linkType=feature' }, { status: 400 });
  }
  if (linkType === 'external' && !externalUrl) {
    return NextResponse.json({ error: 'externalUrl required when linkType=external' }, { status: 400 });
  }

  const [inserted] = await db
    .insert(releaseLogLinks)
    .values({
      releaseId: id,
      linkType,
      bugId: linkType === 'bug' ? (bugId ?? null) : null,
      featureId: linkType === 'feature' ? (featureId ?? null) : null,
      externalUrl: linkType === 'external' ? (externalUrl ?? null) : null,
      source: 'manual',
    })
    .returning();

  revalidatePath('/admin/modules/release-logs');

  // Augment with title if bug or feature
  let bugTitle: string | undefined;
  let featureTitle: string | undefined;

  if (inserted.bugId) {
    const [bug] = await db
      .select({ title: bugReports.title })
      .from(bugReports)
      .where(eq(bugReports.id, inserted.bugId));
    bugTitle = bug?.title;
  }
  if (inserted.featureId) {
    const [feature] = await db
      .select({ title: featureRequests.title })
      .from(featureRequests)
      .where(eq(featureRequests.id, inserted.featureId));
    featureTitle = feature?.title;
  }

  const link: ReleaseLogLink = {
    id: inserted.id,
    releaseId: inserted.releaseId,
    linkType: inserted.linkType as LinkType,
    bugId: inserted.bugId,
    featureId: inserted.featureId,
    externalUrl: inserted.externalUrl,
    source: inserted.source as 'commit' | 'manual',
    createdAt: inserted.createdAt.toISOString(),
    ...(bugTitle ? { bugTitle } : {}),
    ...(featureTitle ? { featureTitle } : {}),
  };

  return NextResponse.json({ link }, { status: 201 });
}
