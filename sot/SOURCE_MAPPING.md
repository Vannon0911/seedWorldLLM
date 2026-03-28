# Source To SoT Mapping

- `src/game/contracts/ActionSchema.md` -> `sot/gameplay/action-schema.json`
- `src/game/contracts/MutationMatrix.md` -> `sot/gameplay/mutation-matrix.json`
- `src/game/contracts/mutationMatrixConstraints.js` -> `sot/gameplay/mutation-matrix.json`
- `src/game/worldGen.js` -> `sot/gameplay/worldgen-contract.json`
- `docs/DETERMINISM_INVENTORY.md` -> `sot/determinism/runtime-guard-policy.json`
- `src/kernel/runtimeGuards.js` -> `sot/determinism/runtime-guard-policy.json`
- `src/kernel/seedGuard.js` -> `sot/determinism/seed-policy.json`
- `src/kernel/fingerprint.js` -> `sot/determinism/seed-policy.json`
- `docs/llm-gate-policy.json` -> `sot/llm-governance/patch-gate-policy.json`
- `docs/WORKFLOW.md` -> `sot/llm-governance/patch-workflow-policy.json`
- `tools/patch/lib/constants.mjs` -> `sot/llm-governance/patch-workflow-policy.json`, `sot/llm-governance/lock-policy.json`
- `tools/patch/lib/lock.mjs` -> `sot/llm-governance/lock-policy.json`
- `tools/patch/lib/orchestrator.mjs` -> `sot/llm-governance/session-status.schema.json`
- `server/sessionRoutes.mjs` -> `sot/llm-governance/session-status.schema.json`
