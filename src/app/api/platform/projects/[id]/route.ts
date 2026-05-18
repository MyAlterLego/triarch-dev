import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isValidBuildTriggerMode } from '@/lib/build-trigger-mode';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name, description, status, firebaseProjectId, crdbCluster, crdbDatabase, crdbUser, subdomain, customDomain, deployedUrl, githubRepo, techStack, currentVersion, ecosystem, buildTriggerMode, localPath } = body;

  // Phase 37 TRIG-05: validate buildTriggerMode at the boundary (DB has CHECK too; defense in depth).
  if (buildTriggerMode !== undefined && !isValidBuildTriggerMode(buildTriggerMode)) {
    return NextResponse.json({ error: 'invalid_build_trigger_mode' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (firebaseProjectId !== undefined) updates.firebaseProjectId = firebaseProjectId;
  if (crdbCluster !== undefined) updates.crdbCluster = crdbCluster;
  if (crdbDatabase !== undefined) updates.crdbDatabase = crdbDatabase;
  if (crdbUser !== undefined) updates.crdbUser = crdbUser;
  if (subdomain !== undefined) updates.subdomain = subdomain;
  if (customDomain !== undefined) updates.customDomain = customDomain;
  if (deployedUrl !== undefined) updates.deployedUrl = deployedUrl;
  if (githubRepo !== undefined) updates.githubRepo = githubRepo;
  if (techStack !== undefined) updates.techStack = techStack;
  if (currentVersion !== undefined) updates.currentVersion = currentVersion;
  if (ecosystem !== undefined) updates.ecosystem = ecosystem;
  if (buildTriggerMode !== undefined) updates.buildTriggerMode = buildTriggerMode;
  if (localPath !== undefined) updates.localPath = localPath;  // allows explicit null to clear

  const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const [deleted] = await db.delete(projects).where(eq(projects.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
