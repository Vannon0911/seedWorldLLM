# Changelog

## 0.3.1a - 2026-03-31

### Added

- Documentation V2 as the primary documentation, planning and archive system.
- Full repository documentation coverage verification.
- Adversarial probe that intentionally creates invalid temporary artifacts and proves that the guards block them.
- String Matrix as a synchronized source of truth for active gameplay and documentation strings.
- Architecture map for the reduced deterministic core.

### Changed

- Mandatory quality line now includes Documentation V2 verification, full coverage verification, string matrix verification and adversarial probe.
- Project documentation is now led by `docs/V2/` instead of diffuse planning and legacy process documents.
- Open work is now tracked only as atomic tasks under `tem/tasks/open/*.json`.
- Completed documentation slices archive automatically to `tem/tasks/archive/*.json`.

### Removed

- Legacy `syncDocs.mjs` documentation generator from the leading path.
- More obsolete UI, wrapper, plugin and bridge paths from the active repository truth.

### Verified

- `npm run check:required`
- `PASS_REPRODUCED`
- `DOCS_V2_COVERAGE OK`
- `DOCS_V2_PROBE OK`
