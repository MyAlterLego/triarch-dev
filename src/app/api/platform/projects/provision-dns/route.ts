import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';

const GODADDY_API_KEY = process.env.GODADDY_API_KEY;
const GODADDY_API_SECRET = process.env.GODADDY_API_SECRET;
const FIREBASE_APP_HOSTING_IP = '35.219.200.0';
const DOMAIN = 'triarch.dev';

export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { subdomain } = body;

  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain is required' }, { status: 400 });
  }

  // Validate subdomain
  if (!/^[a-z0-9-]+$/i.test(subdomain)) {
    return NextResponse.json({ error: 'Subdomain must be alphanumeric with hyphens only' }, { status: 400 });
  }

  if (!GODADDY_API_KEY || !GODADDY_API_SECRET) {
    return NextResponse.json({
      error: 'GoDaddy API credentials not configured. Set GODADDY_API_KEY and GODADDY_API_SECRET env vars.',
      manual_instructions: {
        domain: DOMAIN,
        subdomain,
        type: 'A',
        value: FIREBASE_APP_HOSTING_IP,
        ttl: 600,
      },
    }, { status: 503 });
  }

  try {
    const res = await fetch(
      `https://api.godaddy.com/v1/domains/${DOMAIN}/records/A/${subdomain}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ data: FIREBASE_APP_HOSTING_IP, ttl: 600 }]),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: `GoDaddy API error: ${res.status} ${errBody}` }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      subdomain,
      domain: DOMAIN,
      fullDomain: `${subdomain}.${DOMAIN}`,
      record: { type: 'A', data: FIREBASE_APP_HOSTING_IP, ttl: 600 },
      message: 'DNS record created. Propagation may take up to 10 minutes.',
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `DNS provisioning failed: ${message}` }, { status: 500 });
  }
}
