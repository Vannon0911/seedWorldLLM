# Repo Hygiene Map

## Ownership
- **Kernel Core**: Determinism, governance, routing and patch acknowledgements
  prefixes: src/kernel/
- **Game Logic**: Action schema, mutation matrix, world/domain calculations
  prefixes: src/game/
- **UI Layer**: Rendering, input and browser-side orchestration
  prefixes: src/ui/, src/plugins/, src/workers/, src/browser/, src/main.js, src/styles.css, src/patch-control.css, src/SeedWorld_WorldGen.mjs
- **Patch Runtime**: Terminal patch flow and browser control-plane API
  prefixes: tools/patch/, server/patchServer.mjs, public/patchUI.html, public/patch-popup.html, public/index.html, public/menu.html, public/game.html, server/patchUtils.js
- **Runtime Tooling**: Verification, docs sync, server handlers and regression harnesses
  prefixes: tools/runtime/, scripts/, tests/, server/
- **Documentation**: Contracts, orientation, audit and operational notes
  prefixes: docs/

## Entry Points
- src/main.js
- server/patchServer.mjs
- start-server.js
- scripts/smoke-test.mjs
- scripts/runtime-guards-test.mjs
- scripts/patch-flow-test.mjs
- tests/MainTest.mjs

## Unowned Files
- src/llm/llm-gate-policy.json
- src/sot/FUNCTION_SOT.json
- src/sot/REPO_HYGIENE_MAP.json
- src/sot/patches.schema.json
- src/sot/release-manifest.json
- src/sot/repo-boundaries.json
- start-server.js

## Unreachable Code Files (from configured entrypoints)
- scripts/build-evidence-bundle.mjs
- scripts/playwright-tiles-full.mjs
- scripts/repo-cleanup-baseline.mjs
- scripts/test-runner.mjs
- scripts/verify-evidence.mjs
- server/runtimeCheckHandler.mjs
- src/SeedWorld_WorldGen.mjs
- src/browser/BrowserPatchRunner.js
- src/browser/LogBus.js
- src/game/gameConstants.js
- src/kernel/deterministicKernel.js
- src/kernel/fingerprint.js
- src/kernel/seedGuard.js
- src/plugins/radialBuildController.js
- src/ui/BaseUIController.js
- src/ui/DevUIController.js
- src/ui/GameUIController.js
- src/ui/MainMenuController.js
- src/ui/TileAnimationSDK.js
- src/ui/events.js
- src/ui/plugins/ExampleUIPlugin.js
- src/workers/worldRenderWorker.js
- tests/helpers/runScriptTest.mjs
- tests/modules/00.smoke-script.module.mjs
- tests/modules/01.runtime-guards-script.module.mjs
- tests/modules/02.patch-flow-script.module.mjs
- tests/modules/03.kernel-same-action-same-tick.module.mjs
- tests/modules/04.patch-utils.module.mjs
- tests/modules/05.static-handler-security.module.mjs
- tests/modules/06.governance-enforcement.module.mjs
- tests/modules/15.worldgen-deterministic.module.mjs
- tools/patch/apply.mjs
- tools/patch/patchMatrix.js
- tools/patch/validate-patch-matrix.mjs
- tools/runtime/governance-verify.mjs
- tools/runtime/installGitHooks.mjs
- tools/runtime/new-action-template.mjs
- tools/runtime/preflight.mjs
- tools/runtime/release-guard.mjs
- tools/runtime/repo-hygiene-map.mjs
- tools/runtime/repo-hygiene-why.mjs
- tools/runtime/signing-guard.mjs
- tools/runtime/syncDocs.mjs
- tools/runtime/updateFunctionSot.mjs

## Zero Inbound Code Files (excluding entrypoints)
- scripts/build-evidence-bundle.mjs
- scripts/playwright-tiles-full.mjs
- scripts/repo-cleanup-baseline.mjs
- scripts/test-runner.mjs
- scripts/verify-evidence.mjs
- server/runtimeCheckHandler.mjs
- src/SeedWorld_WorldGen.mjs
- src/browser/BrowserPatchRunner.js
- src/game/gameConstants.js
- src/ui/MainMenuController.js
- src/ui/TileAnimationSDK.js
- src/ui/plugins/ExampleUIPlugin.js
- src/workers/worldRenderWorker.js
- tests/modules/00.smoke-script.module.mjs
- tests/modules/01.runtime-guards-script.module.mjs
- tests/modules/02.patch-flow-script.module.mjs
- tests/modules/03.kernel-same-action-same-tick.module.mjs
- tests/modules/04.patch-utils.module.mjs
- tests/modules/05.static-handler-security.module.mjs
- tests/modules/06.governance-enforcement.module.mjs
- tests/modules/15.worldgen-deterministic.module.mjs
- tools/patch/apply.mjs
- tools/patch/validate-patch-matrix.mjs
- tools/runtime/governance-verify.mjs
- tools/runtime/installGitHooks.mjs
- tools/runtime/new-action-template.mjs
- tools/runtime/preflight.mjs
- tools/runtime/release-guard.mjs
- tools/runtime/repo-hygiene-map.mjs
- tools/runtime/repo-hygiene-why.mjs
- tools/runtime/signing-guard.mjs
- tools/runtime/syncDocs.mjs
- tools/runtime/updateFunctionSot.mjs

## Cross-Owner Imports
- scripts/patch-flow-test.mjs (Runtime Tooling) -> server/patchServer.mjs (Patch Runtime)
- scripts/patch-flow-test.mjs (Runtime Tooling) -> tools/patch/lib/constants.mjs (Patch Runtime)
- scripts/patch-flow-test.mjs (Runtime Tooling) -> tools/patch/lib/intake.mjs (Patch Runtime)
- scripts/patch-flow-test.mjs (Runtime Tooling) -> tools/patch/lib/lock.mjs (Patch Runtime)
- scripts/patch-flow-test.mjs (Runtime Tooling) -> tools/patch/lib/normalize.mjs (Patch Runtime)
- scripts/patch-flow-test.mjs (Runtime Tooling) -> tools/patch/lib/orchestrator.mjs (Patch Runtime)
- scripts/patch-flow-test.mjs (Runtime Tooling) -> tools/patch/lib/session-store.mjs (Patch Runtime)
- scripts/runtime-guards-test.mjs (Runtime Tooling) -> src/kernel/runtimeGuards.js (Kernel Core)
- scripts/smoke-test.mjs (Runtime Tooling) -> server/patchServer.mjs (Patch Runtime)
- scripts/smoke-test.mjs (Runtime Tooling) -> src/ui/UIPluginController.js (UI Layer)
- scripts/test-runner.mjs (Runtime Tooling) -> src/kernel/deterministicKernel.js (Kernel Core)
- scripts/test-runner.mjs (Runtime Tooling) -> src/kernel/fingerprint.js (Kernel Core)
- server/patchServer.mjs (Patch Runtime) -> server/sessionRoutes.mjs (Runtime Tooling)
- server/patchServer.mjs (Patch Runtime) -> server/staticHandler.mjs (Runtime Tooling)
- server/patchServer.mjs (Patch Runtime) -> src/kernel/interface.js (Kernel Core)
- server/sessionRoutes.mjs (Runtime Tooling) -> tools/patch/lib/constants.mjs (Patch Runtime)
- server/sessionRoutes.mjs (Runtime Tooling) -> tools/patch/lib/orchestrator.mjs (Patch Runtime)
- server/sessionRoutes.mjs (Runtime Tooling) -> tools/patch/lib/session-store.mjs (Patch Runtime)
- src/game/gameConstants.js (Game Logic) -> src/plugins/radialBuildController.js (UI Layer)
- src/main.js (UI Layer) -> src/game/GameLogicController.js (Game Logic)
- src/main.js (UI Layer) -> src/kernel/interface.js (Kernel Core)
- src/main.js (UI Layer) -> src/kernel/KernelController.js (Kernel Core)
- src/ui/UIController.js (UI Layer) -> src/game/worldGen.js (Game Logic)
- start-server.js (UNOWNED) -> server/patchServer.mjs (Patch Runtime)
- tools/patch/lib/normalize.mjs (Patch Runtime) -> src/game/contracts/mutationMatrixConstraints.js (Game Logic)

## Notes
- Unreachable/zero-inbound are candidates, not auto-delete orders.
- Dynamic imports built from runtime strings are not fully discoverable.
- Ownership comes from src/sot/repo-boundaries.json.

