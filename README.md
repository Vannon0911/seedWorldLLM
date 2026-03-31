# SeedWorld

SeedWorld ist jetzt auf drei Wahrheiten reduziert:

- deterministischer Kernel
- reproduzierbare seed-basierte Ausfuehrung
- autoritative Spielinhalte

Aktueller Release-Stand: `0.3.1a`

## Pflichtpfad

```bash
npm test
npm run evidence:verify
npm run testline:verify
npm run strings:verify
npm run docs:v2:verify
npm run docs:v2:coverage
npm run docs:v2:probe

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
