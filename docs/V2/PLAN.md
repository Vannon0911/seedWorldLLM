# Planning Path

Offene Planung liegt nur noch als atomare Einzel-Tasks vor. Ein Task bleibt offen, bis sein deklarierter Scope im aktuellen Aenderungssatz vollstaendig getroffen wurde. Dann verschiebt der Scanner ihn ins Archiv.

## Open Tasks

### CF-003 Einen einzigen aktiven Frame-Scheduler festziehen

- JSON: `tem/tasks/open/CF-003.json`
- Track: `canvas-migration`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/ui/UIController.js`, `app/src/ui/RenderManager.js`, `app/src/main.js`, `app/public/game.html`
- Description: Doppelte Render-Loops entfernen und nur einen aktiven Scheduler fuer die Browseransicht lassen.

### CF-004 Tile-Basisdarstellung auf Canvas ziehen

- JSON: `tem/tasks/open/CF-004.json`
- Track: `canvas-migration`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/ui/TileGridRenderer.js`, `app/src/ui/RenderManager.js`, `app/src/ui/UIController.js`, `app/public/game.html`, `app/src/ui/tileGrid.css`
- Description: Canvas als primaren Tile-Pfad setzen und DOM nur noch als Restadapter behandeln.

### CF-005 Hover, Selection und Effekte als Canvas-Layer ziehen

- JSON: `tem/tasks/open/CF-005.json`
- Track: `canvas-migration`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/ui/IconAnimations.js`, `app/src/ui/RenderManager.js`, `app/src/ui/UIController.js`
- Description: Overlay-, Hover- und Effektlogik in denselben Canvas-Koordinatenraum ziehen.

### CF-006 World-Hintergrund in denselben Koordinatenraum ziehen

- JSON: `tem/tasks/open/CF-006.json`
- Track: `canvas-migration`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/ui/RenderManager.js`, `app/src/ui/UIController.js`, `app/public/game.html`
- Description: World- oder Hintergrundlayer mit derselben Geometrie wie die Tile-Darstellung verbinden.

### CF-007 SVG-Overlay auf Restlinien reduzieren

- JSON: `tem/tasks/open/CF-007.json`
- Track: `canvas-migration`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/ui/RenderManager.js`, `app/src/ui/UIController.js`, `app/public/game.html`
- Description: SVG nur noch fuer unvermeidliche Linien- oder Pulseffekte behalten und Layer-Reihenfolge absichern.

### CF-009 DOM-Grid abbauen

- JSON: `tem/tasks/open/CF-009.json`
- Track: `canvas-migration`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/ui/TileGridRenderer.js`, `app/public/game.html`, `app/src/ui/tileGrid.css`
- Description: DOM soll nur noch HUD oder Panel tragen, nicht mehr die Tile-Flaeche selbst.

### CF-011 Canvas-Deckungsgleichheit per Tests absichern

- JSON: `tem/tasks/open/CF-011.json`
- Track: `canvas-migration`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `dev/scripts/test-runner.mjs`, `dev/scripts/verify-evidence.mjs`, `dev/tools/runtime/verify-testline-integrity.mjs`
- Description: Resize, Zoom und Overlay-Verhalten in der Testlinie maschinenlesbar absichern.

### CF-012 Canvas-Hit-Testing und HUD-Smokes stabilisieren

- JSON: `tem/tasks/open/CF-012.json`
- Track: `canvas-migration`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/ui/UIController.js`, `app/src/ui/RenderManager.js`, `dev/scripts/test-runner.mjs`
- Description: Interaktion und HUD sollen nach der Canvas-Migration ohne Sonderpfade testbar bleiben.

### GOV-001 Run-Required-Checks in modulare Runner aufteilen

- JSON: `tem/tasks/open/GOV-001.json`
- Track: `governance-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `dev/tools/runtime/run-required-checks.mjs`, `dev/tools/runtime/runtime-shared.mjs`, `app/src/kernel/GovernanceEngine.js`
- Description: Der Required-Runner soll in kleine, testbare Module zerlegt werden (git-metadata, step-exec, findings, manifest), damit die Modularity-Allowlist für run-required-checks entfernt werden kann.

### GOV-002 KernelController entmonolithisieren

- JSON: `tem/tasks/open/GOV-002.json`
- Track: `governance-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/kernel/KernelController.js`, `app/src/kernel/KernelRouter.js`, `app/src/kernel/GateManager.js`
- Description: KernelController soll entlang klarer Verantwortungen (routing, policy-bridge, audit) in Module gesplittet werden, damit File-Size-Allowlist bis Sunset entfernt werden kann.

### GOV-003 Mutation-Guard in deterministische Teilmodule splitten

- JSON: `tem/tasks/open/GOV-003.json`
- Track: `governance-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `dev/tools/runtime/preflight-mutation-guard.mjs`, `dev/tools/runtime/llm-read-shared.mjs`, `dev/tools/runtime/repo-hygiene-map.mjs`
- Description: preflight-mutation-guard muss in parser, classifier und writer getrennt werden, damit die derzeitige Max-Size-Ausnahme mit Sunset ausläuft.

### GOV-004 Docs-V2 Sync-Chain modularisieren

- JSON: `tem/tasks/open/GOV-004.json`
- Track: `governance-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `dev/tools/runtime/sync-docs-v2.mjs`, `dev/tools/runtime/repo-hygiene-map.mjs`, `dev/tools/runtime/docs-v2-shared.mjs`
- Description: sync-docs-v2 und repo-hygiene-map sollen in klar getrennte Phasen zerlegt werden, damit Ausnahmen in der Modularity-Regel entfallen.

### GOV-006 Governance-Prozedur Security Threat Model fest verankern

- JSON: `tem/tasks/open/GOV-006.json`
- Track: `governance-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `docs/LLM/POLICY.md`, `docs/MANUEL/WORKFLOW.md`, `docs/V2/TRUTH.md`
- Description: Bedrohungsmodell fuer Governance-Artefakte, Hooks und Claim-Proofs soll als kontrolliertes Dokument mit Verify-Referenz eingebunden werden.

### GOV-008 Render-Plan-Gate als Pflichtvertrag erzwingen

- JSON: `tem/tasks/open/GOV-008.json`
- Track: `governance-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/render/renderPlan.js`, `app/src/kernel/KernelGates.js`, `app/src/kernel/gates/render-plan-gate.js`
- Description: Validiert Render-Payloads fail-closed ueber expectedWorldHash, Chunk-Liste und Preset-Whitelist.

### GOV-009 Preset-Registry fuer Renderpfad kanonisieren

- JSON: `tem/tasks/open/GOV-009.json`
- Track: `governance-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/render/renderPresets.js`, `app/src/kernel/gates/render-plan-gate.js`, `docs/V2/TRUTH.md`
- Description: Erlaubt in Produktion nur versionierte Kamera-/Licht-/Material-/Schatten-Presets.

### GOV-010 Render-Evidence-Manifest als Pflichtartefakt aufnehmen

- JSON: `tem/tasks/open/GOV-010.json`
- Track: `governance-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `runtime/evidence/render-manifest.json`, `dev/scripts/verify-evidence.mjs`, `dev/tools/runtime/run-required-checks.mjs`
- Description: Verankert ein render-manifest mit Hash-/Preset-/Chunk-Referenzen als zwingende Verify-Basis.

### LEG-001 Legacy-Archivpfad UNVERFID vollstaendig abbauen

- JSON: `tem/tasks/open/LEG-001.json`
- Track: `legacy-cleanup`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `legacy/UNVERFID/`, `app/src/sot/docs-v2.json`, `app/src/sot/source-of-truth.json`, `docs/INDEX.md`, `docs/V2/ARCHIVE.md`, `docs/V2/SYSTEM_PLAN.md`, `docs/V2/TRUTH.md`
- Description: Entfernt das Verzeichnis legacy/UNVERFID und bereinigt alle aktiven SoT-/Docs-Referenzen auf diesen Pfad.

### LEG-003 TileGridRenderer auf Debug-/Inspection-Rolle reduzieren

- JSON: `tem/tasks/open/LEG-003.json`
- Track: `legacy-cleanup`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/ui/TileGridRenderer.js`, `app/src/ui/UIController.js`, `app/public/game.html`
- Description: Entkoppelt den TileGridRenderer vom Produktionspfad und behaelt ihn nur als Debug-Overlay.

### RT-001 Kernel validator unter Determinism-Guards erzwingen

- JSON: `tem/tasks/open/RT-001.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/kernel/KernelController.js`, `app/src/kernel/runtimeGuards.js`, `dev/tests/modules/10.determinism-seed-proof-suite.module.mjs`
- Description: Validator-Ausfuehrung darf keine Entropie vor Guard einschleusen; Action-Input muss immutable durch den Ausfuehrungspfad laufen.

### RT-004 Proof-Frische und Manifest-Konsistenz erzwingen

- JSON: `tem/tasks/open/RT-004.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `dev/tools/runtime/run-required-checks.mjs`, `dev/tools/runtime/governance-findings-verify.mjs`, `.github/workflows/required-checks.yml`
- Description: verify-only muss Report/Manifest/Findings gegen aktuellen Lauf kryptografisch querpruefen; stale Artefakte duerfen nie als gruen gelten.

### RT-013 Governance-Modularity Limits durch echte Modul-Splits einhalten

- JSON: `tem/tasks/open/RT-013.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `dev/tools/runtime/docs-v2-shared.mjs`, `dev/tools/runtime/governance-findings-shared.mjs`, `dev/tools/runtime/governance-llm-verify.mjs`, `dev/tools/runtime/governance-subagent-verify.mjs`, `dev/tools/runtime/run-required-checks.mjs`, `dev/tools/runtime/governance-modularity-verify.mjs`, `runtime/evidence/governance-modularity.json`
- Description: Uebergrosse Governance-Dateien muessen in stabile Teilmodule aufgeteilt werden; verify darf weder Ausnahmen noch Size-Bypass akzeptieren.

### RT-015 Hash- und Versionsvertrag fuer World/Render fixieren

- JSON: `tem/tasks/open/RT-015.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/render/renderFingerprint.js`, `app/src/game/worldHash.js`, `docs/V2/TRUTH.md`
- Description: Definiert deterministische worldHash/renderHash-Vertraege ohne implizite Inputs.

### RT-016 WorldGen auf Sampler-Schnittstellen ausrichten

- JSON: `tem/tasks/open/RT-016.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/game/worldSampler.js`, `app/src/game/worldGen.js`
- Description: Fuehrt deterministische Sampler-Schnittstellen ein und entkoppelt Full-Scan-Logik.

### RT-017 Block- und Chunk-Compiler einfuehren

- JSON: `tem/tasks/open/RT-017.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/game/blockCompiler.js`, `app/src/game/chunkCompiler.js`, `app/src/game/worldGen.js`
- Description: Normalisiert Weltaufbau ueber compileBlock/compileChunk statt impliziter Tile-Kopplung.

### RT-018 Biome-/Materiallogik auf Blockebene verankern

- JSON: `tem/tasks/open/RT-018.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/game/blockCompiler.js`, `app/src/game/chunkCompiler.js`, `app/src/render/renderState.js`
- Description: Macht Biome-/Transition-/Materialentscheidungen auf Block-/Chunk-Daten fuer den Renderpfad nutzbar.

### RT-019 Chunk-Offscreen-Worker als Executor einfuehren

- JSON: `tem/tasks/open/RT-019.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/workers/chunkRenderWorker.js`, `app/src/workers/worldRenderWorker.js`, `app/src/render/renderPlan.js`
- Description: Fuehrt deterministisches Chunk-Offscreen-Rendering ueber freigegebenen Render-Plan ein.

### RT-020 Dirty-Chunk-ReRender deterministisch steuern

- JSON: `tem/tasks/open/RT-020.json`
- Track: `red-team-hardening`
- Match: `all_scope_paths_touched`
- Source: `docs/V2/SYSTEM_PLAN.md`
- Scope: `app/src/game/chunkState.js`, `app/src/game/mutationQueue.js`, `app/src/workers/chunkRenderWorker.js`
- Description: Markiert und rendert nur betroffene Chunks inkl. notwendiger Nachbarn fuer Schatten/Occlusion neu.

