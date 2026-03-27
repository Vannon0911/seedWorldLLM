# Determinism Inventory

## Purpose

This inventory defines which runtime APIs are blocked in deterministic kernel scopes and which runtime sources are disallowed by policy.

## Blocked APIs (Guarded in Runtime)

- `Math.random()`: non-deterministic entropy source
- `Date.now()`: wall-clock variance
- `Date()` without fixed input: wall-clock variance
- `performance.now()`: execution-time variance
- `crypto.getRandomValues()`: non-deterministic entropy source
- `crypto.randomUUID()`: non-deterministic entropy source

Source implementation: `src/kernel/runtimeGuards.js`

## Disallowed Runtime Sources (Policy)

- `fetch` in deterministic kernel logic
- `IndexedDB` in deterministic kernel logic
- `Worker`/`SharedWorker` message timing in deterministic kernel logic
- any external I/O that can reorder or delay execution

These sources are not part of deterministic kernel contracts and must be rejected in patch review and gate policy.

## Expected Behavior on Violation

- Runtime guard violations throw `[KERNEL_GUARD]` errors immediately.
- Patch-flow policy violations fail closed in `policy-gates` with `LLM_GATE_DENIED`.
- Session final status remains one of:
  - `succeeded`
  - `failed_rolled_back`
  - `failed_partial`
