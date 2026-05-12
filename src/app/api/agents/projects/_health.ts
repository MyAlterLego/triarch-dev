// Health rollup for /api/agents/projects/*
//
// Rules (per H-DISCOVERY.md, confirmed by Mike):
//   red    — prod older than 30 days OR any critical bug unresolved OR latest dev release rejected
//   yellow — prod older than 14 days OR any high bug unresolved OR open bugs > 10 OR requested features > 20
//   green  — otherwise
//
// `pending_approval` release status is treated as NEUTRAL (does not downgrade health).

import { releaseLogs } from '@/db/schema';

type ReleaseRow = typeof releaseLogs.$inferSelect;

export interface HealthInput {
  openBugs: number;
  requestedFeatures: number;
  latestDev: ReleaseRow | undefined;
  latestProd: ReleaseRow | undefined;
  criticalBugsOpen?: number;
  highBugsOpen?: number;
}

export interface HealthResult {
  rollup: 'green' | 'yellow' | 'red';
  reasons: string[];
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PROD_STALE_RED_DAYS = 30;
const PROD_STALE_YELLOW_DAYS = 14;
const OPEN_BUGS_YELLOW_THRESHOLD = 10;
const REQUESTED_FEATURES_YELLOW_THRESHOLD = 20;

function daysAgo(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / ONE_DAY_MS);
}

export function computeHealth(input: HealthInput): HealthResult {
  const reasons: string[] = [];

  const prodAge = daysAgo(input.latestProd?.deployedAt ?? null);

  // ── RED conditions ─────────────────────────────────────────────
  if (prodAge !== null && prodAge > PROD_STALE_RED_DAYS) {
    reasons.push(`prod_stale_${prodAge}d`);
  }
  if ((input.criticalBugsOpen ?? 0) > 0) {
    reasons.push(`critical_bugs_open_${input.criticalBugsOpen}`);
  }
  if (input.latestDev?.status === 'rejected') {
    reasons.push('latest_dev_rejected');
  }

  if (reasons.length > 0) {
    return { rollup: 'red', reasons };
  }

  // ── YELLOW conditions ──────────────────────────────────────────
  if (prodAge !== null && prodAge > PROD_STALE_YELLOW_DAYS) {
    reasons.push(`prod_aging_${prodAge}d`);
  }
  if ((input.highBugsOpen ?? 0) > 0) {
    reasons.push(`high_bugs_open_${input.highBugsOpen}`);
  }
  if (input.openBugs > OPEN_BUGS_YELLOW_THRESHOLD) {
    reasons.push(`many_open_bugs_${input.openBugs}`);
  }
  if (input.requestedFeatures > REQUESTED_FEATURES_YELLOW_THRESHOLD) {
    reasons.push(`many_requested_features_${input.requestedFeatures}`);
  }

  if (reasons.length > 0) {
    return { rollup: 'yellow', reasons };
  }

  return { rollup: 'green', reasons: [] };
}
