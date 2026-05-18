/**
 * inclusion-state.ts
 *
 * State machine validator for bug_reports.inclusion_state / feature_requests.inclusion_state.
 * Phase 36 INCL-01..05 — manual transitions only. Auto-flips (built, deployed) are driven
 * by link-stamper (commit ingest) and releases/promoted route (prod deploy), NOT this module.
 *
 * CONTEXT.md D-02: backward transitions allowed only via INCL-05 "Remove from build"
 * (approved_for_build → pending_inclusion). Auto-states (built, deployed) reject all manual entry.
 *
 * CONTEXT.md <amendments> (2026-05-18 plan revision pass / B-3 fix):
 *   'rejected' is NOT exposed as a manual transition target by any Phase 36 UI surface.
 *   INCL-04 only enumerates pending_inclusion → approved_for_build OR deferred.
 *   The DB CHECK constraint still permits 'rejected' as a state value (DDL unchanged);
 *   the 'rejected → triaged' recovery path is preserved in case rows reach 'rejected'
 *   via DB back-compat, manual SQL, or future v3.0 customer-approval surfaces.
 */

export const INCLUSION_STATES = [
  'triaged',
  'pending_inclusion',
  'approved_for_build',
  'built',
  'deployed',
  'deferred',
  'rejected',
] as const;

export type InclusionState = typeof INCLUSION_STATES[number];

// Allowed manual transitions. Empty arrays mean "no manual entry" (built/deployed are auto-only).
// NOTE per B-3 fix: 'rejected' removed from forward target lists — no Phase 36 UI drives it.
const MANUAL_TRANSITIONS: Record<InclusionState, readonly InclusionState[]> = {
  triaged:            ['pending_inclusion', 'deferred'],
  pending_inclusion:  ['approved_for_build', 'deferred'],
  approved_for_build: ['pending_inclusion'],  // INCL-05 "Remove from build" only
  built:              [],                      // auto-only via link-stamper
  deployed:           [],                      // auto-only via releases/promoted
  deferred:           ['triaged', 'pending_inclusion'],
  rejected:           ['triaged'],             // recovery path kept for back-compat
};

export function canManuallyTransition(from: InclusionState, to: InclusionState): boolean {
  return MANUAL_TRANSITIONS[from]?.includes(to) ?? false;
}
