import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AdminSidebar } from '@/components/AdminSidebar';

export const metadata = {
  title: 'Admin | Triarch Dev',
};

const MARKETING_HOSTS = new Set(['triarch.dev', 'www.triarch.dev']);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = ((await headers()).get('host') ?? '').toLowerCase().split(':')[0];
  if (MARKETING_HOSTS.has(host)) {
    redirect('https://admin.triarch.dev/admin');
  }

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-200">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
