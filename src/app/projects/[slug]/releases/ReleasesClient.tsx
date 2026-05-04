'use client';
import type { ReleaseRow, UserRole } from './types';

interface Props {
  projectSlug: string;
  projectName: string;
  userRole: UserRole;
  currentUserEmail: string;
  initialReleases: ReleaseRow[];
  total: number;
  hasMore: boolean;
  pageSize: number;
}

export default function ReleasesClient(props: Props) {
  // Plan 05 replaces this placeholder with the full interactive table.
  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-white">{props.projectName} Releases</h1>
      <p className="text-sm text-zinc-500 mt-0.5">
        {props.total} release{props.total !== 1 ? 's' : ''} · {props.projectName}
      </p>
      <pre className="mt-6 text-xs text-zinc-500">
        {JSON.stringify({ userRole: props.userRole, count: props.initialReleases.length }, null, 2)}
      </pre>
    </div>
  );
}
