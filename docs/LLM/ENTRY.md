# LLM Entry

Dieses Entry-Dokument ist der verpflichtende Einstieg fuer alle Arbeiten im Repo.

- Absoluter Pfad: `C:\Users\Vannon\seedWorldLLM\docs\LLM`
- Zweck: Bindeglied zwischen Projektindex und LLM-Policy.

## Pflicht-Lesereihenfolge

1. `docs/INDEX.md`
2. `docs/LLM/ENTRY.md`
3. `docs/LLM/POLICY.md`

## Arbeitsweise (atomar verpflichtend)

1. Ein Scope pro Arbeit (keine Mischthemen im selben Commit).
2. Vor Commit immer Gegenpruefung durch Guard/Hooks.
3. Runtime-Synchronitaet bleibt Pflicht (`sync:docs`, `preflight`, Tests).

## Runtime-Enforcement

- `npm run llm:entry` schreibt einen ACK-Status mit Docs-Hash.
- `npm run llm:guard` blockiert Commit/Push bei Hash-Drift oder fehlendem ACK.
- Hooks pruefen das standardmaessig vor jedem Commit/Push.
