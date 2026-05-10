// Phase 24 / CI-03 — runtime-required env names for admin (admin.triarch.dev FAH backend triarch-dev).
// Cross-checked at boot by assertEnv() and at CI time by scripts/validate-apphosting.ts (Plan 24-03).
export const REQUIRED_ENV = [
  'NEXTAUTH_URL',
  'ADMIN_EMAIL',
  'DEPLOY_WEBHOOK_URL',
  'PORTAL_BASE_URL',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'DEPLOY_WEBHOOK_SECRET',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_PAYLOAD_SECRET',
  'SLACK_RELEASE_APPROVAL_CHANNEL',
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_INSTALLATION_ID',
  'FAH_PROMOTER_SA_KEY',
  'INTERNAL_HMAC_SECRET',
] as const;

export type RequiredEnvName = (typeof REQUIRED_ENV)[number];
