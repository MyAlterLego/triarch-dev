// Project lookup by id OR key.
// Per H-DISCOVERY confirmation: the agent API accepts either form on
// /api/agents/projects/[idOrKey] for ergonomics.

import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProjectRow = typeof projects.$inferSelect;

export async function findProject(idOrKey: string): Promise<ProjectRow | null> {
  const where = UUID_RE.test(idOrKey)
    ? eq(projects.id, idOrKey)
    : eq(projects.key, idOrKey);
  const [row] = await db.select().from(projects).where(where).limit(1);
  return row ?? null;
}
