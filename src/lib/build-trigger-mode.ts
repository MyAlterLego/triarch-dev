/**
 * build-trigger-mode.ts
 *
 * Validator for projects.build_trigger_mode. Phase 37 TRIG-05 — per-project preference for how
 * the "Generate build" button on /admin/modules/next-build-plan/{slug} behaves.
 *
 * CONTEXT.md Decisions:
 *   - 'local_claude' (DEFAULT): show Copy + Open buttons; deep-link is primary action
 *   - 'managed_agent': button DISABLED with tooltip "Managed Agent variant ships in v2.5" (Phase 38 RFC)
 *   - 'manual': show ONLY Copy button (deep-link hidden) for staff who paste into any session/IDE
 */

export const BUILD_TRIGGER_MODES = ['local_claude', 'managed_agent', 'manual'] as const;

export type BuildTriggerMode = typeof BUILD_TRIGGER_MODES[number];

export function isValidBuildTriggerMode(value: unknown): value is BuildTriggerMode {
  return typeof value === 'string' && (BUILD_TRIGGER_MODES as readonly string[]).includes(value);
}
