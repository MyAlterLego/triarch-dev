import { REQUIRED_ENV } from './env-schema';

export function assertEnv(): void {
  const missing: string[] = [];
  for (const name of REQUIRED_ENV) {
    const v = process.env[name];
    if (v === undefined || v === '') missing.push(name);
  }
  if (missing.length > 0) {
    const message = `[assertEnv] FATAL: missing required env vars: ${missing.join(', ')}`;
    // eslint-disable-next-line no-console
    console.error(message);
    throw new Error(message);
  }
}
