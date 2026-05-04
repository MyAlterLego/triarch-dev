'use client';
import { signOut } from 'next-auth/react';

interface Props {
  projectName: string;
}

export default function CustomerHeader({ projectName }: Props) {
  return (
    <header className="h-14 px-8 flex items-center justify-between
                       border-b border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-zinc-400 tracking-widest uppercase">
          Triarch Dev
        </span>
        <span className="text-zinc-700">·</span>
        <span className="text-sm text-zinc-300">{projectName}</span>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        Sign out
      </button>
    </header>
  );
}
