# SeedWorld

SeedWorld ist jetzt auf drei Wahrheiten reduziert:

- deterministischer Kernel
- reproduzierbare seed-basierte Ausfuehrung
- autoritative Spielinhalte

## Pflichtpfad

```bash
npm test
npm run evidence:verify
npm run testline:verify

# oder als Gesamtlinie
npm run check:required
```

Ein gueltiger Erfolg ist nur `PASS_REPRODUCED`.
Ein einzelner gruener Lauf ohne Gegenlauf gilt nicht als Qualitaetsbeweis.

## Repo-Kern

- `app/src/kernel/` deterministische Kernel-Ausfuehrung
- `app/src/game/` autoritative Inhalte und Regelinterpretation
- `dev/tests/modules/` doppelte Reproduktionssuiten
- `dev/scripts/` Run-/Pair-Evidence und Comparator
- `dev/tools/runtime/verify-testline-integrity.mjs` finaler Schlusstest

## Aus dem Pflichtpfad entfernt

- Server- und Browser-Pfade
- Patch-/Hotfix-/Remote-Mechanik
- Playwright-/CDP-Gates
- Preflight-, Hook- und Hygiene-Gates ohne Reproduktionsbeweis

Die maschinenlesbare Grenzziehung liegt in `app/src/sot/source-of-truth.json`, `app/src/sot/repo-boundaries.json` und `app/src/sot/testline-integrity.json`.
