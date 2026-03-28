# System Sweep 2026-03-28

## Scope
- Gesamtscan über `src/`, `server/`, `tools/`, `scripts/`, `docs/`, `tests/`
- Sequenziell in 6 Foki: tote Strings, Gate-Bypässe, Funktionslogik/Regelbrüche, Monolithen, Evidence, SoT

## Findings
1. Stale/irreführende Governance-Daten: `docs/FUNCTION_SOT.json` enthält nicht existente Pfade.
2. `tools/runtime/updateFunctionSot.mjs` war faktisch `noop` (Drift-Risiko).
3. Gate-Weichheit/Bypass-Risiken: alte Soft-Fail-Muster, Direct-Write-Pfad, Legacy-Flow-Risiko.
4. Gameplay-Logikfehler: `transport` konnte Ressourcen inflaten, `build` konnte kostenfrei bauen.
5. Monolithen identifiziert: `src/game/GameLogicController.js`, `src/kernel/KernelController.js`, `src/game/worldGen.js`.
6. Evidence-Lage: Artefakte vorhanden, strict-verifizierte Evidence musste auf >=10 abgesichert werden.

## Applied Changes
1. Gameplay-Bugs gefixt und modularisiert:
   - `src/game/actions/transportAction.js`
   - `src/game/actions/buildAction.js`
   - `src/game/GameLogicController.js` delegiert an Action-Module
2. Governance/Determinismus gehärtet:
   - `src/kernel/interface.js` blockiert direkte `patch.plan/patch.apply`
   - `src/kernel/KernelGates.js` schluckt Hook-Fehler nicht mehr
   - `src/kernel/KernelController.js` erweitert verbotene Runtime-Pattern
   - `tools/patch/lib/orchestrator.mjs` fehlende Gate-Policy -> fail-closed
3. Cleanup-Scanner erweitert:
   - `scripts/repo-cleanup-baseline.mjs` erkennt `TODO|FIXME|NOTE|XXX|@todo|@fixme`
4. SoT-Struktur eingeführt:
   - `sot/` mit gameplay/determinism/llm-governance + Topology/Source-Mapping
5. Evidence-Bundle-Flow ergänzt:
   - `scripts/build-evidence-bundle.mjs`
   - `npm run evidence:bundle`

## Rule-Critical Risk Notes
1. `patchServer.mjs` enthält weiterhin Legacy-Funktionsblöcke (`handleApi`, `runPatchQueue`) die aktuell nicht aktiv geroutet sind, aber als Reaktivierungsrisiko bestehen bleiben.
2. `docs/FUNCTION_SOT.json` bleibt Traceability-Artefakt und ist nicht die operative SoT für Betriebspfade.

## No-Delete Guarantee
- Im Sweep wurden keine Dateien gelöscht.
- Evidence-/Artefakt-Bündelung arbeitet additiv.
