import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projectMembers, projects } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

type Role = 'admin' | 'viewer';
const VALID_ROLES: ReadonlyArray<Role> = ['admin', 'viewer'];

async function requireStaff() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const ctx = await getCurrentUserContext(session);
  if (!ctx || !ctx.isStaff) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { error: null, ctx };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const guard = await requireStaff();
  if (guard.error) return guard.error;

  const { key } = await params;

  const [project] = await db
    .select({ key: projects.key, name: projects.name })
    .from(projects)
    .where(eq(projects.key, key));

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const members = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectKey, key));

  return NextResponse.json({ members, projectName: project.name });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const guard = await requireStaff();
  if (guard.error) return guard.error;

  const { key } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== 'string' || typeof body.role !== 'string') {
    return NextResponse.json(
      { error: 'email and role are required' },
      { status: 400 }
    );
  }

  const email = body.email.trim();
  const role = body.role as Role;

  if (!email.includes('@') || !email.includes('.')) {
    return NextResponse.json(
      { error: 'Enter a valid email address' },
      { status: 400 }
    );
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'role must be admin or viewer' },
      { status: 400 }
    );
  }

  // Confirm project exists (avoid orphan membership rows for typo'd keys).
  const [project] = await db
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.key, key));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Duplicate check (case-insensitive on email).
  const [existing] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectKey, key),
        sql`lower(${projectMembers.email}) = lower(${email})`
      )
    );
  if (existing) {
    return NextResponse.json(
      { error: `${email} is already a member of this project.` },
      { status: 409 }
    );
  }

  const [member] = await db
    .insert(projectMembers)
    .values({ projectKey: key, email, role })
    .returning();

  return NextResponse.json(member, { status: 201 });
}
