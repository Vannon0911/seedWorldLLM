# Rules

Documentation 2.0 ist nicht nur Doku, sondern ein Guard-System fuer Planung und Archivierung.

## Harte Regeln

- Keine offene Planung ausserhalb von `tem/tasks/open/*.json`.
- Keine geaenderte Datei ohne Registrierung in `docs-v2.json`, Task-Scope oder Task-Source.
- Keine Testline ohne `docs:v2:guard` vor dem Scanner.
- Erledigte atomare Tasks werden vom Scanner nach `tem/tasks/archive/` verschoben.
- Menschenlesbare Fuehrungsseiten werden nur aus der Doku-2.0-SoT erzeugt.
- Keine Datei unter den Doku-/Plan-/Legacy-Roots darf unklassifiziert bleiben.
- Aktive Spiel- und Doku-Strings duerfen nicht ohne synchronisierte String-Matrix drift erzeugen.

## Guard Entry

- `dev/tools/runtime/verify-docs-v2-guards.mjs`

## Scanner Entry

- `dev/tools/runtime/scan-doc-tasks.mjs`

## Coverage Entry

- `dev/tools/runtime/verify-docs-v2-coverage.mjs`

## String Matrix Entry

- `dev/tools/runtime/sync-string-matrix.mjs`

## Adversarial Probe

- `dev/tools/runtime/probe-docs-v2-adversarial.mjs`
