# Architecture Map

SeedWorld 0.3.1a ist auf wenige, klare Fluesse reduziert. Diese Karte beschreibt die aktiven Komponenten und ihre Beziehungen.

## 1. Truth Layers

### Kernel Core

- `app/src/kernel/deterministicKernel.js`
- `app/src/kernel/KernelController.js`
- `app/src/kernel/KernelRouter.js`
- `app/src/kernel/ActionRegistry.js`
- `app/src/kernel/runtimeGuards.js`
- `app/src/kernel/seedGuard.js`
- `app/src/kernel/fingerprint.js`

Aufgabe:
- deterministische Ausfuehrung
- Seed-Disziplin
- Guardrails gegen nichtdeterministische Inputs
- reproduzierbare Fingerprints

### Authoritative Gameplay Content

- `app/src/game/`

Aufgabe:
- Spielregeln
- Weltgenerierung
- Content-Interpretation
- Patch-Wuensche fuer den Kernel

### Reproduction and Evidence

- `dev/scripts/test-runner.mjs`
- `dev/scripts/evidence-shared.mjs`
- `dev/scripts/verify-evidence.mjs`
- `dev/tools/runtime/verify-testline-integrity.mjs`
- `runtime/evidence/`

Aufgabe:
- Doppel-Lauf-Orchestrierung
- Run-/Pair-Evidence
- Comparator
- finaler Testline-Schlusstest

## 2. Documentation and Hygiene

### Documentation V2

- `app/src/sot/docs-v2.json`
- `docs/V2/`
- `tem/tasks/open/`
- `tem/tasks/archive/`

Aufgabe:
- menschenlesbare Wahrheit
- atomare Planung
- Archivierung abgeschlossener Tasks
- Guard- und Coverage-SoT fuer den Dokumentationsraum

### Hygiene and Coverage

- `dev/tools/runtime/verify-docs-v2-guards.mjs`
- `dev/tools/runtime/verify-docs-v2-coverage.mjs`
- `dev/tools/runtime/probe-docs-v2-adversarial.mjs`
- `dev/tools/runtime/sync-string-matrix.mjs`
- `app/src/sot/STRING_MATRIX.json`

Aufgabe:
- blockiert rohe Plan-Dateien
- blockiert unregistrierte Aenderungen
- klassifiziert den Vollbestand der Doku-/Plan-/Legacy-Roots
- prueft die Guards per adversarial probe
- haelt aktive Spiel- und Doku-Strings mechanisch synchron

## 3. Browser Adapter

- `app/src/main.js`
- `app/src/ui/`
- `app/public/`

Aufgabe:
- schlanke Browser-Spielansicht
- keine fuehrende Wahrheit
- Adapter auf Kernel und Gameplay

## 4. Flow Map

1. Content oder Testinput liefert Action und Seed.
2. Gameplay-Schicht berechnet erlaubte Aenderungen.
3. Kernel fuehrt deterministisch aus.
4. Evidence-Schicht beweist Reproduktion in zwei Laeufen.
5. Doku-2.0-/Hygiene-Schicht blockiert unregistrierte oder unklassifizierte Doku-/Plan-Abweichungen.
6. String-Matrix und adversarial probe pruefen, dass Dokumentation und Guardrails nicht nur behauptet, sondern aktiv erzwungen werden.

## 5. Removed from the Leading Path

- Server- und Deployment-Pfade
- Patch-/Hotfix-/Remote-Mechanik
- Playwright-/Browser-Pflichtgates
- Preflight- und kosmetische Gruen-Semantik
- diffuse Planungsdateien ausserhalb von `tem/tasks/`
