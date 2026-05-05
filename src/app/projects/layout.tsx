import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const MARKETING_HOSTS = new Set(['triarch.dev', 'www.triarch.dev']);

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = ((await headers()).get('host') ?? '').toLowerCase().split(':')[0];
  if (MARKETING_HOSTS.has(host)) {
    redirect('https://admin.triarch.dev/projects');
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  return (
    <div className="bg-zinc-950 min-h-screen text-zinc-200 flex flex-col">
      {children}
    </div>
  );
}
