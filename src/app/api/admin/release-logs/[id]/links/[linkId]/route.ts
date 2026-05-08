import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { releaseLogLinks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireStaff } from '@/lib/api-auth';

/**
 * DELETE /api/admin/release-logs/[id]/links/[linkId]
 * Deletes a link scoped to both the release [id] AND the link [linkId].
 * A mismatched releaseId returns 404, not silent success.
 * Staff-only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id, linkId } = await params;

  // Scope the DELETE to BOTH (id, linkId) — mismatched releaseId = 404
  const deleted = await db
    .delete(releaseLogLinks)
    .where(
      and(
        eq(releaseLogLinks.id, linkId),
        eq(releaseLogLinks.releaseId, id),
      ),
    )
    .returning({ id: releaseLogLinks.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  revalidatePath('/admin/modules/release-logs');

  return new NextResponse(null, { status: 204 });
}
