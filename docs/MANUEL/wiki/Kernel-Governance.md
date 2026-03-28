# Kernel Governance

Tags: `governance` `kernel` `fail-closed` `security`

## Objectives

- no action execution without explicit registration
- no gate bypass through side channels
- fail-closed deny behavior with audit identifiers

## Enforced model

- Action definitions are centralized in `ActionRegistry`
- Every action declares `requiredGate`
- `KernelController.#execute()` denies unknown/invalid actions
- `GateManager` performs allow/deny decision before routing
- `KernelGates` requires strict validator contract (`{ valid: boolean }`)

## Verification

Run:

```bash
npm run governance:verify
```

Checks include:

- action-to-gate completeness
- gate existence
- forbidden direct orchestrator access
- static registry mismatch detection for `kernel.execute(...)`

## Related Pages

- [Home](Home)
- [Architecture](Architecture)
- [Developer Onboarding](Developer-Onboarding)
