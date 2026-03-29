# Repo Hygiene Map

## Ownership
- **Kernel Core**: Determinism, governance, routing and patch acknowledgements
  prefixes: app/src/kernel/
- **Game Logic**: Action schema, mutation matrix, world/domain calculations
  prefixes: app/src/game/
- **UI Layer**: Rendering, input and browser-side orchestration
  prefixes: app/src/ui/, app/src/plugins/, app/src/workers/, app/src/browser/, app/src/main.js, app/src/styles.css, app/src/patch-control.css, app/src/SeedWorld_WorldGen.mjs, app/public/
- **Patch Tooling**: Terminal patch flow helpers, validation and manifest utilities
  prefixes: dev/tools/patch/, app/server/patchUtils.js
- **Runtime Tooling**: Verification, docs sync, runtime server entrypoints and regression harnesses
  prefixes: dev/tools/runtime/, dev/scripts/, dev/tests/, app/server/appServer.mjs, app/server/staticHandler.mjs, start-server.js
- **Documentation**: Contracts, orientation, audit and operational notes
  prefixes: docs/

## Entry Points
- app/src/main.js
- app/server/appServer.mjs
- start-server.js
- dev/tools/patch/apply.mjs
- dev/scripts/smoke-test.mjs
- dev/scripts/runtime-guards-test.mjs
- dev/tests/MainTest.mjs

## Unowned Files
- app/src/llm/llm-gate-policy.json
- app/src/sot/FUNCTION_SOT.json
- app/src/sot/REPO_HYGIENE_MAP.json
- app/src/sot/patches.schema.json
- app/src/sot/release-manifest.json
- app/src/sot/repo-boundaries.json
- app/src/sot/testline-integrity.json
- dev/tools/llm-preflight.mjs

## Unreachable Code Files (from configured entrypoints)
- app/server/patchUtils.js
- app/src/SeedWorld_WorldGen.mjs
- app/src/browser/BrowserPatchRunner.js
- app/src/browser/LogBus.js
- app/src/game/gameConstants.js
- app/src/kernel/deterministicKernel.js
- app/src/kernel/fingerprint.js
- app/src/kernel/seedGuard.js
- app/src/plugins/radialBuildController.js
- app/src/ui/BaseUIController.js
- app/src/ui/DevUIController.js
- app/src/ui/GameUIController.js
- app/src/ui/MainMenuController.js
- app/src/ui/TileAnimationSDK.js
- app/src/ui/events.js
- app/src/ui/plugins/ExampleUIPlugin.js
- app/src/workers/worldRenderWorker.js
- dev/scripts/build-evidence-bundle.mjs
- dev/scripts/playwright-tiles-full.mjs
- dev/scripts/repo-cleanup-baseline.mjs
- dev/scripts/test-runner.mjs
- dev/scripts/verify-evidence.mjs
- dev/tests/helpers/runScriptTest.mjs
- dev/tests/modules/00.smoke-script.module.mjs
- dev/tests/modules/01.runtime-guards-script.module.mjs
- dev/tests/modules/03.kernel-same-action-same-tick.module.mjs
- dev/tests/modules/04.patch-utils.module.mjs
- dev/tests/modules/05.static-handler-security.module.mjs
- dev/tests/modules/06.governance-enforcement.module.mjs
- dev/tests/modules/07.preflight-mutation-guard.module.mjs
- dev/tests/modules/08.kernel-replay-determinism.module.mjs
- dev/tests/modules/09.game-logic-tile-action.module.mjs
- dev/tests/modules/15.worldgen-deterministic.module.mjs
- dev/tools/llm-preflight.mjs
- dev/tools/patch/import-dispatch.mjs
- dev/tools/patch/patchMatrix.js
- dev/tools/patch/validate-patch-matrix.mjs
- dev/tools/runtime/apply-github-ruleset.mjs
- dev/tools/runtime/evidence-lock.mjs
- dev/tools/runtime/function-sot-shared.mjs
- dev/tools/runtime/governance-verify.mjs
- dev/tools/runtime/installGitHooks.mjs
- dev/tools/runtime/llm-entry.mjs
- dev/tools/runtime/llm-override.mjs
- dev/tools/runtime/llm-read-guard.mjs
- dev/tools/runtime/llm-read-shared.mjs
- dev/tools/runtime/new-action-template.mjs
- dev/tools/runtime/preflight-mutation-guard.mjs
- dev/tools/runtime/preflight.mjs
- dev/tools/runtime/release-guard.mjs
- dev/tools/runtime/repo-hygiene-map.mjs
- dev/tools/runtime/repo-hygiene-why.mjs
- dev/tools/runtime/signing-guard.mjs
- dev/tools/runtime/syncDocs.mjs
- dev/tools/runtime/update-testline-integrity.mjs
- dev/tools/runtime/updateFunctionSot.mjs
- dev/tools/runtime/updateRedActions.mjs
- dev/tools/runtime/verify-testline-integrity.mjs

## Zero Inbound Code Files (excluding entrypoints)
- app/server/patchUtils.js
- app/src/SeedWorld_WorldGen.mjs
- app/src/browser/BrowserPatchRunner.js
- app/src/game/gameConstants.js
- app/src/ui/MainMenuController.js
- app/src/ui/TileAnimationSDK.js
- app/src/ui/plugins/ExampleUIPlugin.js
- app/src/workers/worldRenderWorker.js
- dev/scripts/build-evidence-bundle.mjs
- dev/scripts/playwright-tiles-full.mjs
- dev/scripts/repo-cleanup-baseline.mjs
- dev/scripts/test-runner.mjs
- dev/scripts/verify-evidence.mjs
- dev/tests/modules/00.smoke-script.module.mjs
- dev/tests/modules/01.runtime-guards-script.module.mjs
- dev/tests/modules/03.kernel-same-action-same-tick.module.mjs
- dev/tests/modules/04.patch-utils.module.mjs
- dev/tests/modules/05.static-handler-security.module.mjs
- dev/tests/modules/06.governance-enforcement.module.mjs
- dev/tests/modules/07.preflight-mutation-guard.module.mjs
- dev/tests/modules/08.kernel-replay-determinism.module.mjs
- dev/tests/modules/09.game-logic-tile-action.module.mjs
- dev/tests/modules/15.worldgen-deterministic.module.mjs
- dev/tools/llm-preflight.mjs
- dev/tools/patch/import-dispatch.mjs
- dev/tools/patch/validate-patch-matrix.mjs
- dev/tools/runtime/apply-github-ruleset.mjs
- dev/tools/runtime/evidence-lock.mjs
- dev/tools/runtime/governance-verify.mjs
- dev/tools/runtime/installGitHooks.mjs
- dev/tools/runtime/llm-entry.mjs
- dev/tools/runtime/llm-override.mjs
- dev/tools/runtime/llm-read-guard.mjs
- dev/tools/runtime/new-action-template.mjs
- dev/tools/runtime/preflight-mutation-guard.mjs
- dev/tools/runtime/preflight.mjs
- dev/tools/runtime/release-guard.mjs
- dev/tools/runtime/repo-hygiene-map.mjs
- dev/tools/runtime/repo-hygiene-why.mjs
- dev/tools/runtime/signing-guard.mjs
- dev/tools/runtime/syncDocs.mjs
- dev/tools/runtime/update-testline-integrity.mjs
- dev/tools/runtime/updateFunctionSot.mjs
- dev/tools/runtime/updateRedActions.mjs
- dev/tools/runtime/verify-testline-integrity.mjs

## Cross-Owner Imports
- app/src/game/gameConstants.js (Game Logic) -> app/src/plugins/radialBuildController.js (UI Layer)
- app/src/main.js (UI Layer) -> app/src/game/GameLogicController.js (Game Logic)
- app/src/main.js (UI Layer) -> app/src/kernel/interface.js (Kernel Core)
- app/src/main.js (UI Layer) -> app/src/kernel/KernelController.js (Kernel Core)
- app/src/ui/UIController.js (UI Layer) -> app/src/game/worldGen.js (Game Logic)
- dev/scripts/runtime-guards-test.mjs (Runtime Tooling) -> app/src/kernel/runtimeGuards.js (Kernel Core)
- dev/scripts/smoke-test.mjs (Runtime Tooling) -> app/src/ui/UIPluginController.js (UI Layer)
- dev/scripts/test-runner.mjs (Runtime Tooling) -> app/src/kernel/deterministicKernel.js (Kernel Core)
- dev/scripts/test-runner.mjs (Runtime Tooling) -> app/src/kernel/fingerprint.js (Kernel Core)
- dev/tools/patch/lib/normalize.mjs (Patch Tooling) -> app/src/game/contracts/mutationMatrixConstraints.js (Game Logic)

## Notes
- Unreachable/zero-inbound are candidates, not auto-delete orders.
- Dynamic imports built from runtime strings are not fully discoverable.
- Ownership comes from app/src/sot/repo-boundaries.json.

