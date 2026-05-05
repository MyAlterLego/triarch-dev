import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

const MARKETING_HOSTS = new Set(['triarch.dev', 'www.triarch.dev']);

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = ((await headers()).get('host') ?? '').toLowerCase().split(':')[0];
  if (MARKETING_HOSTS.has(host)) {
    redirect('https://admin.triarch.dev/login');
  }
  return children;
}
