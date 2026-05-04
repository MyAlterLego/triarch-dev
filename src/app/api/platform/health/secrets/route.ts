import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { getSecret } from '@myalterlego/secrets';

/**
 * The 7 shared secrets migrated to triarch-vault in v2.0 Phase 01 (VAULT-02).
 * Order matches the alphabetical order of VAULT-02 requirement listing.
 * Adding to this list requires also granting IAM in Plan 01-03.
 */
export const VAULT_KEYS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'SLACK_BOT_TOKEN',
  'SLACK_PAYLOAD_SECRET',
  'SLACK_SIGNING_SECRET',
  'SLACK_USER_MAP',
] as const;

type SecretCheck =
  | { key: string; ok: true; length: number }
  | { key: string; ok: false; error: string };

/**
 * GET /api/platform/health/secrets
 * Staff-only. Calls getSecret() for each of the 7 vault keys and reports per-key status.
 * Used post-deploy to confirm vault wiring (per CONTEXT.md D-11).
 */
export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;

  const results = await Promise.allSettled(
    VAULT_KEYS.map(async (key): Promise<SecretCheck> => {
      const value = await getSecret(key);
      return { key, ok: true, length: value.length };
    }),
  );

  const secrets: SecretCheck[] = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { key: VAULT_KEYS[i], ok: false, error: (r.reason as Error).message },
  );

  const allOk = secrets.every((s) => s.ok);
  return NextResponse.json({ ok: allOk, secrets }, { status: allOk ? 200 : 207 });
}
