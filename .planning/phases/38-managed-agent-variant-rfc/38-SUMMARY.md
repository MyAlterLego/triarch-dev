---
phase: 38-managed-agent-variant-rfc
plan: 00
subsystem: design
tags: [rfc, managed-agent, anthropic-agents-api, design-only, trust-boundary, webhook-contract, opt-in-mechanic]

requires:
  - phase: 37
    provides: "projects.build_trigger_mode varchar enum with 'managed_agent' value already provisioned (37-01 commit 7da1127); approval_events table entity-agnostic shape ready for new decision/surface values"

provides:
  - ".planning/research/MANAGED-AGENT-RFC.md — 941-line design doc covering all 6 AGENT-01 required sections + Executive Summary + Open Questions + Cross-References + Required Statements"
  - "Specified v2.5 schema additions (agent_sessions table + 3 new projects columns + new decision/surface values on approval_events) — design only, not yet shipped"
  - "Specified tool catalog (7 tools), deny-list (path + workflow-name + admin-side), and 5-layer trust boundary"
  - "7 open questions explicitly enumerated for v2.5 planning kickoff to answer before implementation"

affects:
  - "v2.5 milestone planning (RFC will be the input to Phase 39+ implementation phases)"
  - "Project admin UI (37-04 already renders managed_agent radio as disabled; v2.5 flips to live)"
  - "Generate Build modal (37-05; v2.5 adds 'Dispatch to Managed Agent' button rendering)"
  - "Approval audit page (37-06; v2.5 adds rendering for new agent_* decision badges)"

tech-stack:
  added: []  # design-only phase; no deps shipped
  patterns:
    - "Layered defense for autonomous-agent trust boundary (5 independently-audit-able enforcement layers: playbook / tool catalog / admin handler validation / GitHub App permissions / workflow permissions block)"
    - "Workflow-only dispatch model — agent identity holds no contents:write; all code mutations occur inside dispatched workflow's own GITHUB_TOKEN scope"
    - "Two-layer callback auth (per-session Bearer hash + long-lived HMAC) — reuses /api/slack/interact signature pattern"
    - "Idempotency key derived from approval_events row id (one session per trigger; prevents double-dispatch on retry)"
    - "Entity-agnostic approval_events table reused for new event source (37-01's design intent realized — no schema change needed for agent_* decisions)"

key-files:
  created:
    - .planning/research/MANAGED-AGENT-RFC.md
    - .planning/phases/38-managed-agent-variant-rfc/38-SUMMARY.md
  modified:
    - .planning/REQUIREMENTS.md (AGENT-01 checkbox + traceability row marked Complete)

key-decisions:
  - "TMI pilot for v2.5 managed_agent — same pilot scope as v2.4 build cycle; local_claude remains default for the other 6 projects until pilot validation"
  - "Anthropic Agents API path chosen (over Computer Use or MCP); requires Agents API GA before v2.5 ship (Open Question Q1)"
  - "GitHub App over per-repo PAT for permission scoping + auditability (Open Question Q2; recommended decision documented)"
  - "Workflow-name allowlist with EXACTLY ONE allowed workflow (gsd-plan-and-execute.yml) — even the agent's own dispatched workflow cannot trigger other workflows"
  - "60-min clarification response timeout for v2.5 pilot; tunable based on TMI experience (Open Question Q3)"
  - "10.00 USD cost cap default per session; instrument and revisit after first 10 builds (Open Question Q4)"
  - "local_claude stays default indefinitely; managed_agent is opt-in per-project AND requires super-staff (project_key='*') to flip a separate boolean (defense in depth on opt-in)"

patterns-established:
  - "Design-only RFC format: 6 required sections + Executive Summary + Open Questions + Cross-References + Required Statements (mirrors AGENT-01 spec, suitable template for future agent-platform RFCs)"
  - "Explicit Required Statements section at end of RFC enumerates non-negotiable trust-boundary claims for audit clarity — pattern reusable for future security-sensitive design docs"

requirements-completed: [AGENT-01]

duration: ~12min (single-task design phase; mandatory file reads + RFC write + verify + commit + SUMMARY)
completed: 2026-05-18
---

# Phase 38: Managed Agent Variant RFC Summary

**Shipped a 941-line design RFC at `.planning/research/MANAGED-AGENT-RFC.md` covering the v2.5 managed-agent variant of Phase 37's Build Cycle trigger — platform fit, webhook contract, agent playbook, failure modes, opt-in mechanic, and 5-layer trust boundary. Zero code changes; v2.5 implementation phase will reference this RFC as input.**

## Performance

- **Duration:** ~12 min (single-task design phase)
- **Started:** 2026-05-18T~21:00Z
- **Completed:** 2026-05-18T~21:12Z
- **Tasks:** 1/1 (design-only deliverable per AGENT-01)
- **Files created/modified:** 3 (RFC + this SUMMARY + REQUIREMENTS.md update)
- **Lines authored:** 941 (RFC) + 90 (this SUMMARY)

## Accomplishments

- **RFC structurally complete** — all 6 AGENT-01 required sections present and named per spec:
  - § 1 Platform Fit Assessment (Anthropic Agents API path; pros/cons; TMI pilot recommendation)
  - § 2 Webhook Contract (dispatch payload + callback payload + mid-session tool-call contract; full JSON schemas)
  - § 3 Agent Playbook (file reads list, OBSERVE→PLAN→ACT loop, 7-tool catalog, 4-level deny-list, guardrails)
  - § 4 Failure Modes + Recovery (14 enumerated failures A-N; each routed to existing admin audit + Slack paths)
  - § 5 Opt-in Mechanic (uses existing projects.build_trigger_mode; v2.5 schema additions specified; UI flow walked end-to-end)
  - § 6 Trust Boundary (what agent CAN do; what it CANNOT do; 5-layer enforcement; concrete attack-matrix table)
- **Plus auxiliary sections per AGENT-01 spec:** Executive Summary (§ 0), Open Questions (§ 7 — 7 questions, ≥3 required), Cross-References (§ 8 — Phase 37 deps, CONTEXT.md citations, Anthropic public docs URLs, portfolio refs), and Required Statements (§ 9 — explicit audit-clarity restatement of trust-boundary claims).
- **All required negative statements present and unambiguous** — RFC explicitly states the agent CANNOT push code directly, CANNOT mutate admin schema, CANNOT deploy production, CANNOT change project secrets (§ 9 items 2-5, with cross-refs to the layers that enforce each).
- **Reuses Phase 37 substrate** — no parallel prompt generator, no parallel audit table, no new opt-in column. The RFC explicitly shows how every v2.5 capability layers on top of v2.4 outputs (§ 8.1).
- **Atomic commit landed** — single docs commit `e1326ab` on `feat/build-trigger`. `git status` clean afterward.
- **Zero code changes verified** — `git status --short` before commit showed only `.planning/research/MANAGED-AGENT-RFC.md` as untracked; nothing else in working tree.

## Task Commits

1. **Task 1: RFC + audit-cleanup** — `e1326ab` (docs)

(Final metadata commit for this SUMMARY + REQUIREMENTS update follows separately.)

## Files Created/Modified

- `.planning/research/MANAGED-AGENT-RFC.md` — 941-line RFC (NEW)
- `.planning/phases/38-managed-agent-variant-rfc/38-SUMMARY.md` — this file (NEW)
- `.planning/REQUIREMENTS.md` — AGENT-01 checkbox marked complete; traceability row updated to Complete

## Deviations from Plan

**None.** Plan executed exactly as specified in the AGENT-01 deliverable. No deviation rules triggered:

- No Rule 1 (Bug) — design-only phase, no executing code to bug-fix
- No Rule 2 (Missing functionality) — RFC scope was fully defined by AGENT-01; nothing missing
- No Rule 3 (Blocking) — single self-contained writing task; no blockers encountered
- No Rule 4 (Architectural) — RFC itself documents architectural decisions deferred to v2.5; this phase is the architectural design, not its implementation

## Authentication Gates / Pending Human Actions

**None for this phase.** The RFC enumerates auth gates that the *v2.5 implementation* will require (Anthropic API key provisioning, GitHub App installation, HMAC secret coordination), but those are deferred to the implementation phase and explicitly listed as Open Questions Q1-Q2 for v2.5 review.

## What this enables

- **v2.5 milestone planning** can proceed with a written design artifact as input rather than ad-hoc discussion
- **Decision-makers** (Mike + future Triarch staff) have explicit Required Statements (§ 9) to audit the trust boundary against
- **Phase 37's `managed_agent` placeholder** (37-04 UI disabled radio + 37-01 schema enum value) now has documented intent — the disabled state is no longer mysterious; it points to this RFC
- **v2.5 implementation phases** (TBD numbering — likely 39-managed-agent-foundation, 40-managed-agent-tool-handlers, 41-managed-agent-ui-wiring or similar) can reference this RFC by section number rather than re-deriving designs
- **Future agent-platform RFCs** (Slack-side trigger, scheduled builds, customer-facing builds) can reuse this RFC's structural template (6 sections + open questions + required statements)

## Outstanding from this plan

- **None for v2.4.** AGENT-01 deliverable complete; v2.4 milestone closed once this commit + final metadata commit land and merge through dev → main.
- **For v2.5 planning kickoff:** answer the 7 Open Questions enumerated in RFC § 7 before phase decomposition starts.
- **For v2.5 implementation start:** author `.planning/research/managed-agent-playbook-v1.md` (the verbatim system prompt text) per RFC § 8.5.

## Cross-references

- **Drives:** v2.5 milestone (managed-agent implementation phases TBD)
- **Cites:** Phase 37 CONTEXT.md (line 39 — managed_agent disabled placeholder rationale); Phase 37-01 SUMMARY (build_trigger_mode enum + approval_events table); workspace CLAUDE.md (rules to bake into agent system prompt); dev/prod customer contract (CL-4 production gate that managed agent does NOT touch)
- **References (not fetched):** Anthropic Agents API docs URL, Computer Use API URL, MCP spec URL, Anthropic console URL — all listed as public references in RFC § 8.3

## Self-Check: PASSED

Verified all claims:

- `.planning/research/MANAGED-AGENT-RFC.md` — FOUND (941 lines; 6 required sections + auxiliary sections all present)
- All 6 required section headers present — VERIFIED via `grep -nE "^## " .planning/research/MANAGED-AGENT-RFC.md`
- All 4 required "cannot" statements present — VERIFIED via grep on lines 925, 927, 929, 931 (§ 9 items 2-5)
- 7 open questions (≥3 required) — VERIFIED via `grep -cE "^### Q[0-9]+:"` returning 7
- Commit `e1326ab` — FOUND in `git log --oneline -1`
- Zero code changes — VERIFIED via pre-commit `git status --short` showing only `.planning/research/MANAGED-AGENT-RFC.md`
- File at correct path per AGENT-01 spec (`.planning/research/MANAGED-AGENT-RFC.md`) — VERIFIED
