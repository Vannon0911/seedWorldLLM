# AKTUELLE RED ACTIONS

Dieser Stand wird automatisch vor Preflight/Commit synchronisiert.

- Snapshot: `ca1fccb4afe6f446`
- Candidate Changes: `8`

## Commit-Kandidat (Name-Status)
- `M` .githooks/pre-commit
- `M` .githooks/pre-push
- `M` app/src/sot/FUNCTION_SOT.json
- `M` dev/tools/runtime/installGitHooks.mjs
- `M` dev/tools/runtime/preflight-mutation-guard.mjs
- `M` dev/tools/runtime/preflight.mjs
- `M` dev/tools/runtime/syncDocs.mjs
- `M` package.json

## Red-Actions (risikoreiche Treffer)
- `hook-flow` -> `M` .githooks/pre-commit
- `hook-flow` -> `M` .githooks/pre-push
- `runtime-guard` -> `M` dev/tools/runtime/installGitHooks.mjs
- `runtime-guard` -> `M` dev/tools/runtime/preflight-mutation-guard.mjs
- `runtime-guard` -> `M` dev/tools/runtime/preflight.mjs
- `runtime-guard` -> `M` dev/tools/runtime/syncDocs.mjs
- `script-surface` -> `M` package.json

## Regel
- Jeder Commit muss diesen Stand widerspruchsfrei spiegeln.

