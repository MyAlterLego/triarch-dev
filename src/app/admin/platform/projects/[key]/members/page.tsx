import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects, projectMembers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import MembersClient from './MembersClient';

export default async function MembersPage(
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx || !ctx.isStaff) {
    redirect('/admin');
  }

  const { key } = await params;

  const [project] = await db
    .select({ key: projects.key, name: projects.name })
    .from(projects)
    .where(eq(projects.key, key));
  if (!project) notFound();

  const members = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectKey, key));

  // Serialise dates for client (Drizzle returns Date objects).
  const initialMembers = members.map((m) => ({
    id: m.id,
    projectKey: m.projectKey,
    email: m.email,
    role: m.role as 'admin' | 'viewer' | 'staff',
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <MembersClient
      projectKey={project.key}
      projectName={project.name}
      initialMembers={initialMembers}
    />
  );
}
