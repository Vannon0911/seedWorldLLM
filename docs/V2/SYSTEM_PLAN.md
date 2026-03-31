# System Plan

Dies ist der laufende Systemplan fuer Documentation 2.0. Er deckt die aktiven Bereiche des Repos ab und verbindet sie mit offenen atomaren Tasks.

## Bereiche

### kernel-core

- Truth: Deterministic kernel execution and state transitions.
- Roots: `app/src/kernel`
- Open Tasks: `GOV-001`, `GOV-002`, `GOV-008`, `GOV-009`, `RT-001`

### gameplay-content

- Truth: Authoritative content, rules and world interpretation.
- Roots: `app/src/game`
- Open Tasks: `RT-015`, `RT-016`, `RT-017`, `RT-018`, `RT-020`

### reproduction-evidence

- Truth: Double-run proof, evidence validation and final testline consistency.
- Roots: `dev/scripts`, `dev/tests/modules`, `dev/tools/runtime/verify-testline-integrity.mjs`
- Open Tasks: `CF-011`, `CF-012`, `GOV-010`, `RT-001`

### browser-adapter

- Truth: Remaining browser path as adapter, not as competing domain truth.
- Roots: `app/src/main.js`, `app/src/ui`, `app/public`
- Open Tasks: `CF-003`, `CF-004`, `CF-005`, `CF-006`, `CF-007`, `CF-009`, `CF-012`, `LEG-003`

### documentation-v2

- Truth: Human-readable truth, atomic planning and archive automation.
- Roots: `docs/V2`, `tem/tasks`, `app/src/sot/docs-v2.json`
- Open Tasks: `GOV-006`, `GOV-009`, `LEG-001`, `RT-015`

### governance-procedure

- Truth: Pflichtprozess fuer LLM/Sub_Agent-Governance und Finding-zu-Task-Mapping; strikt fail-closed, nicht Runtime-Simulation.
- Roots: `docs/LLM`, `Sub_Agent`, `dev/tools/runtime/governance-llm-verify.mjs`, `dev/tools/runtime/governance-subagent-verify.mjs`, `dev/tools/runtime/governance-modularity-verify.mjs`, `dev/tools/runtime/governance-findings-materialize.mjs`, `dev/tools/runtime/governance-findings-verify.mjs`
- Open Tasks: `GOV-006`, `RT-004`, `RT-013`

### legacy-cleanup

- Truth: Tracked migration residue that must not create unregistered plan drift.
- Roots: `tem`, `docs/IN PLANUNG`
- Open Tasks: keine

