/**
 * Customer-facing URL helpers.
 *
 * Phase 20 (URL-01): all admin code that emits a customer-page URL must call
 * one of these helpers. After the Phase 25 cutover, PORTAL_BASE_URL points at
 * portal.triarch.dev and every Slack message / release note / email automatically
 * routes customers to the correct host without per-call-site changes.
 *
 * The ESLint rule in eslint.config.mjs (Phase 20-02) blocks raw
 * 'admin.triarch.dev/projects/' string literals outside this file.
 *
 * Env: PORTAL_BASE_URL (default 'https://portal.triarch.dev').
 * Read at call time, NOT module load — so test overrides and per-request env
 * changes are honored.
 */

const DEFAULT_PORTAL_BASE_URL = 'https://portal.triarch.dev';

function getPortalBaseUrl(): string {
  return process.env.PORTAL_BASE_URL ?? DEFAULT_PORTAL_BASE_URL;
}

export function customerProjectUrl(slug: string): string {
  return `${getPortalBaseUrl()}/projects/${slug}`;
}

export function customerReleaseUrl(slug: string): string {
  return `${getPortalBaseUrl()}/projects/${slug}/releases`;
}

export function customerBugUrl(slug: string, id: string): string {
  return `${getPortalBaseUrl()}/projects/${slug}/bugs/${id}`;
}

export function customerFeatureUrl(slug: string, id: string): string {
  return `${getPortalBaseUrl()}/projects/${slug}/features/${id}`;
}
