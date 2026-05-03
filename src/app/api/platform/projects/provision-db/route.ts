import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { Pool } from 'pg';
import crypto from 'crypto';

const CLUSTER_URL = 'triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257';

export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { databaseName, userName } = body;

  if (!databaseName || !userName) {
    return NextResponse.json({ error: 'databaseName and userName are required' }, { status: 400 });
  }

  // Validate names (alphanumeric + underscores/hyphens only)
  if (!/^[a-z0-9_-]+$/i.test(databaseName) || !/^[a-z0-9_-]+$/i.test(userName)) {
    return NextResponse.json({ error: 'Names must be alphanumeric with underscores/hyphens only' }, { status: 400 });
  }

  const password = crypto.randomBytes(16).toString('base64url');

  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL! });

  try {
    // Create database
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);

    // Create user with password
    await adminPool.query(`CREATE USER "${userName}" WITH PASSWORD '${password}'`);

    // Grant permissions
    await adminPool.query(`GRANT ALL ON DATABASE "${databaseName}" TO "${userName}"`);

    const connectionString = `postgresql://${userName}:${password}@${CLUSTER_URL}/${databaseName}?sslmode=verify-full`;

    return NextResponse.json({
      success: true,
      databaseName,
      userName,
      password,
      cluster: CLUSTER_URL,
      connectionString,
      message: 'Database and user created. Store the password securely — it cannot be retrieved later.',
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Provisioning failed: ${message}` }, { status: 500 });
  } finally {
    await adminPool.end();
  }
}
