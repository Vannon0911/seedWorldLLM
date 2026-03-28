# Subagent Reports (Sequential, 6 Focus Areas)

## Agent 1: Tote Strings / alte Scope-Daten
- Stale Referenzen in `docs/FUNCTION_SOT.json` auf fehlende Dateien.
- `tools/runtime/updateFunctionSot.mjs` war `noop`.
- Cleanup-Scanner erfasste nur `TODO|FIXME`.

## Agent 2: Umgehbare Gates / fail-open
- Soft-fail Muster in Legacy-Run-Flow erkannt.
- Manifest-gesteuerte Allowlist/Protected-Target-Bypass als Risiko markiert.
- Legacy-API-Pfade als Reaktivierungsrisiko identifiziert.

## Agent 3: Funktionslogik / Regelbrüche
- Gameplay-Bugs bestätigt:
  - `transport` konnte Ressourcen inflaten.
  - `build` konnte bei Unterdeckung kostenlos erhöhen.
- Determinismus-/Governance-Härtungspunkte in Kernel validiert.

## Agent 4: Monolithen / Modularisierung
- Monolith-Hotspots:
  - `src/game/GameLogicController.js`
  - `src/kernel/KernelController.js`
  - `src/game/worldGen.js`
- Ziel: modulare Action-/Validation-/Progression-Aufteilung.

## Agent 5: Evidence / Artefakte / ZIP
- Evidence-Inventar aufgebaut (`.patch-manager/logs`, `output/playwright`).
- Konzept für additiven ZIP-Bundle-Flow mit Manifest und SHA256 bestätigt.

## Agent 6: SoT nach Abhängigkeiten
- Minimale SoT-Zielstruktur für:
  - Gameplay
  - Determinism
  - LLM Governance
- Topologische Reihenfolge und Source-Mapping spezifiziert.
