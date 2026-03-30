# Test Evidence Report

**Executed Tests**
- `dev/tests/modules/00.smoke-script.module.mjs` -> PASS (`[smoke-test] ok`, 193ms)
- `dev/tests/modules/01.runtime-guards-script.module.mjs` -> PASS (`[runtime-guards-test] ok`, 121ms)
- `dev/tests/modules/03.kernel-same-action-same-tick.module.mjs` -> PASS (36ms)
- `dev/tests/modules/04.patch-utils.module.mjs` -> PASS (21ms)
- `dev/tests/modules/05.static-handler-security.module.mjs` -> PASS (5ms)
- `dev/tests/modules/06.governance-enforcement.module.mjs` -> PASS (27ms)
- `dev/tests/modules/07.preflight-mutation-guard.module.mjs` -> PASS (`07-preflight-mutation-guard-attestation`, 24ms)
- `dev/tests/modules/08.kernel-replay-determinism.module.mjs` -> PASS (57ms)
- `dev/tests/modules/09.game-logic-tile-action.module.mjs` -> PASS (22ms)
- `dev/tests/modules/10.reduce-game-state.module.mjs` -> PASS (28ms)
- `dev/tests/modules/11.radial-get-world-tile.module.mjs` -> PASS (4ms)
- `dev/tests/modules/12.challenge-block-messages.module.mjs` -> PASS (18ms)
- `dev/tests/modules/13.kernel-seed-signature.module.mjs` -> PASS (31ms)
- `dev/tests/modules/15.worldgen-deterministic.module.mjs` -> PASS (`15-worldgen-deterministic-and-shape`, 25ms)

**Evidence**
- Verified the latest evidence artifact with `npm run evidence:verify`.
- Verified artifact: `runtime/.patch-manager/logs/test-run-2026-03-30T20-00-43-821Z.json`.
- Artifact status: `passed`.
- Gate decision: `runtime_and_kernel_verified`.
- Determinism check: `consistent: true`.
- Aggregate reference check: `npm test` passed and `MainTest` reported `14/14 Module PASS`.
- Optional bundle attempt: `npm run evidence:bundle`.
- Bundle outcome: failed during module load with `ERR_MODULE_NOT_FOUND` for package `jszip` imported from `dev/scripts/build-evidence-bundle.mjs`.

**Contradictions**
- None observed.
- All 14 individual module runs passed, and the aggregate `MainTest` run also passed, so there is no module-level mismatch to report.

**Conclusion**
- The individual test modules all pass.
- Evidence verification passes.
- Evidence bundling is currently blocked by a missing `jszip` dependency, so the bundle step is not usable in this workspace without restoring that package.
