# Test Layout

## Prinzip

- `tests/modules/*.module.mjs` sind die eigentlichen Test-Module.
- Jedes Modul exportiert `id` und `test(ctx)`.
- `tests/MainTest.mjs` ist der einzige Runner-Einstieg und führt Module sortiert aus.

## Abdeckung (aktuell)

- `00`: Smoke (`scripts/smoke-test.mjs`)
- `01`: Runtime-Guards (`scripts/runtime-guards-test.mjs`)
- `02`: Patch-Flow und Server-Vertragschecks (`scripts/patch-flow-test.mjs`)
- `03`: Kernel-Determinismus für `same action + same tick`
- `04`: `patchUtils` Parse/Snapshot/Lock-Validation/Risk-Classification
- `05`: Static-Path-Security für HTTP-Static-Resolver
- `15`: WorldGen-Determinismus und Action-Shape

## Offene Testbereiche (nächste Kandidaten)

- UI-Rendering-Regression (Layering, Tile-Placement) via Browser-Snapshot-Tests
- Worker-Fallback-Pfad bei `worldRenderWorker` Fehlern
- Hook-Installation/Hook-Pfad-Verhalten (`.githooks`) in isolierter Repo-Kopie
