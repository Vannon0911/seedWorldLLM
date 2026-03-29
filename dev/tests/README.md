# Test Layout

## Prinzip

- `dev/tests/modules/*.module.mjs` sind die eigentlichen Test-Module.
- Jedes Modul exportiert `id` und `test(ctx)`.
- `dev/tests/MainTest.mjs` ist der einzige Runner-Einstieg und führt Module sortiert aus.

## Abdeckung (aktuell)

- `00`: Smoke (`dev/scripts/smoke-test.mjs`)
- `01`: Runtime-Guards (`dev/scripts/runtime-guards-test.mjs`)
- `03`: Kernel-Determinismus für `same action + same tick`
- `08`: Kernel-Replay-Determinismus mit Checkpoint-Hashes und erster Drift-Stelle
- `04`: `patchUtils` Parse/Snapshot/Lock-Validation/Risk-Classification
- `05`: Static-Path-Security für HTTP-Static-Resolver
- `15`: WorldGen-Determinismus und Action-Shape

## Offene Testbereiche (nächste Kandidaten)

- UI-Rendering-Regression (Layering, Tile-Placement) via Browser-Snapshot-Tests
- Worker-Fallback-Pfad bei `worldRenderWorker` Fehlern
- Hook-Installation/Hook-Pfad-Verhalten (`.githooks`) in isolierter Repo-Kopie
