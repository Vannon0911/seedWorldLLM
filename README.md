# SeedWorld

SeedWorld ist jetzt auf drei Wahrheiten reduziert:

- deterministischer Kernel
- reproduzierbare seed-basierte Ausfuehrung
- autoritative Spielinhalte

Aktueller Release-Stand: `0.3.1a`

## Pflichtpfad

```bash
npm run check:required
npm run check:required:verify-only

# oder als Gesamtlinie
npm run check:advisory
```

`check:required` ist der kanonische Green-Path mit teilautomatischem Sync fuer deterministische Artefakte.
`check:required:verify-only` ist fail-closed (kein Auto-Write) fuer pre-push/CI/release.
Ein gueltiger Erfolg ist nur `PASS_REPRODUCED` plus belegbare Evidence-Artefakte.

## Repo-Kern

- `app/src/kernel/` deterministische Kernel-Ausfuehrung
- `app/src/game/` autoritative Inhalte und Regelinterpretation
- `dev/tests/modules/` doppelte Reproduktionssuiten
- `dev/scripts/` Run-/Pair-Evidence und Comparator
- `dev/tools/runtime/verify-testline-integrity.mjs` finaler Schlusstest
- `dev/tools/runtime/run-required-checks.mjs` kanonischer Gate-Runner + Proof-Report
- `docs/V2/` fuehrende Doku-, Plan- und Archivschicht
- `app/src/sot/STRING_MATRIX.json` maschinenlesbare String-Disziplin fuer aktive Spiel- und Doku-Pfade

## Aus dem Pflichtpfad entfernt

- Server- und Browser-Pfade
- Patch-/Hotfix-/Remote-Mechanik
- Playwright-/CDP-Gates
- Preflight-, Hook- und Hygiene-Gates ohne Reproduktionsbeweis

Die maschinenlesbare Grenzziehung liegt in `app/src/sot/source-of-truth.json`, `app/src/sot/repo-boundaries.json` und `app/src/sot/testline-integrity.json`.

## Start Here

- [Documentation 2.0 Home](./docs/V2/HOME.md)
- [Release 0.3.1a](./docs/V2/RELEASE_0.3.1a.md)
- [Architecture Map](./docs/V2/ARCHITECTURE_MAP.md)
- [Last 20 Commits](./docs/V2/LAST_20_COMMITS.md)
- [Changelog](./CHANGELOG.md)
