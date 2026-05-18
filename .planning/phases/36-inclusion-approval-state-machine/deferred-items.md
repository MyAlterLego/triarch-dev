# Phase 36 — Deferred Items (out of scope)

Items discovered during Plan 36-07 execution that are NOT directly caused by this plan's changes; logged here per SCOPE BOUNDARY guidance and left untouched.

## Pre-existing TS errors in portal/src/lib/portal-slack.test.ts

- **Discovered:** Plan 36-07 Task 1, during `npx tsc --noEmit`
- **Confirmation:** errors reproduce on `dev` branch HEAD (`dad6500`) with NO Plan 36-07 changes applied — pure pre-existing state
- **Error pattern:** ~10 occurrences of `TS2352: Conversion of type '[]' to type '[string, RequestInit]' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.`
- **Lines:** 216, 285, 313, 334, 369, 388, 411, 432, 456, 468 in `src/lib/portal-slack.test.ts`
- **Likely root cause:** mock-fetch test helper that casts an empty array tuple
- **Why deferred:** unrelated to inclusion-approval state machine; touches the slack interactivity test surface; should be its own focused fix
- **Recommendation:** open a separate hygiene task to either (a) widen the cast, (b) convert via `as unknown as [string, RequestInit]`, or (c) replace with a typed mock-fetch helper
