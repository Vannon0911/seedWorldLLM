# Human Truth

Diese Seite macht die fuehrende SoT menschenlesbar. Sie ersetzt die JSON-Dateien nicht, sondern erklaert sie knapp.

## Fuehrende Quellen

- [source-of-truth.json](../../app/src/sot/source-of-truth.json)
- [repo-boundaries.json](../../app/src/sot/repo-boundaries.json)
- [docs-v2.json](../../app/src/sot/docs-v2.json)
- [STRING_MATRIX.json](../../app/src/sot/STRING_MATRIX.json)

## Klassen

- `Archive`: Historical reference only.
- `Content-Authoritative`: Authoritative gameplay content, rules and contracts consumed by the kernel.
- `Deprecated`: Superseded runtime or tooling path retained temporarily.
- `Kernel-Authoritative`: Deterministic simulation, state transitions, seed handling and kernel execution truth.
- `Out-of-Scope`: Present in repo but not part of kernel truth or mandatory quality gates.
- `Reproduction/Evidence`: Machine-readable proof artifacts, comparators and evidence contracts.
- `Test/Gate-Core`: Only the mandatory double-run gates that prove reproduction.
- `Transitional`: Active migration residue with planned removal.

## Repo-Grenzen

- `Kernel Core`: Deterministic execution and seed-bound kernel state transitions
- `Authoritative Content`: Canonical gameplay content and deterministic interpretation rules
- `Reproduction Evidence`: Double-run orchestration, evidence generation, comparison and final proof
- `Documentation V2`: Human-readable truth, atomic planning tasks, string matrix discipline and archive automation
- `Deprecated Runtime`: No longer part of mandatory truth or gates

## Doku-2.0-System

- Offene Tasks liegen unter `tem/tasks/open`.
- Archivierte Tasks liegen unter `tem/tasks/archive`.
- Der Scanner schreibt Evidence nach `runtime/evidence/docs-v2-scan.json`.
- Der Guard laeuft ueber `dev/tools/runtime/verify-docs-v2-guards.mjs`.
- Der Vollrepo-Scanner schreibt Evidence nach `runtime/evidence/docs-v2-coverage.json`.
- Die String-Matrix wird ueber `dev/tools/runtime/sync-string-matrix.mjs` synchronisiert.
- Nur atomare Einzel-Tasks duerfen in den offenen Planungspfad.

## Systemplan

- `kernel-core`: Deterministic kernel execution and state transitions. Roots: `app/src/kernel`
- `gameplay-content`: Authoritative content, rules and world interpretation. Roots: `app/src/game`
- `reproduction-evidence`: Double-run proof, evidence validation and final testline consistency. Roots: `dev/scripts`, `dev/tests/modules`, `dev/tools/runtime/verify-testline-integrity.mjs`
- `browser-adapter`: Remaining browser path as adapter, not as competing domain truth. Roots: `app/src/main.js`, `app/src/ui`, `app/public`
- `documentation-v2`: Human-readable truth, atomic planning and archive automation. Roots: `docs/V2`, `tem/tasks`, `app/src/sot/docs-v2.json`
- `legacy-cleanup`: Tracked migration residue that must not create unregistered plan drift. Roots: `tem`, `docs/IN PLANUNG`, `legacy/UNVERFID`
