import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { getEffectiveSetting, setSetting } from '@/lib/module-settings';

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const module = searchParams.get('module');
  const project = searchParams.get('project') ?? 'triarch-dev';

  if (!module) {
    return NextResponse.json({ error: 'module parameter is required' }, { status: 400 });
  }

  const settings = await getEffectiveSetting({
    project,
    module,
    userId: session!.user?.email ?? undefined,
  });

  return NextResponse.json({ settings: settings ?? {} });
}

export async function PUT(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { module, project = 'triarch-dev', scope = 'global', scopeId, settings } = body;

  if (!module || !settings) {
    return NextResponse.json({ error: 'module and settings are required' }, { status: 400 });
  }

  // For user scope, auto-fill scopeId from session
  const resolvedScopeId = scope === 'user' ? (scopeId ?? session!.user?.email ?? undefined) : scopeId;

  const id = await setSetting({
    project,
    module,
    scope,
    scopeId: resolvedScopeId,
    settings,
  });

  return NextResponse.json({ id, success: true });
}
