# Phase 22 — Deferred Items (out-of-scope discoveries)

## From 22-02 execution (2026-05-08)

### Pre-existing TypeScript errors in portal/src/lib/auth.test.ts

Three `TS2561` errors at lines 83/93/103: object literals use `projectKey`
(camelCase) where the `Membership` type requires `project_key` (snake_case).

These are pre-existing from Phase 18 (pre-22-02), unrelated to write paths,
and do not affect runtime (Vitest mocks bypass type checking). Tests still
pass. Tracked here per workspace scope rules — fix in a future maintenance
plan or alongside Phase 23 (which touches portal auth/membership shapes).

Reproduce: `cd portal && npx tsc --noEmit -p tsconfig.json`
