# SeedWorld LLM

[![CI](https://img.shields.io/badge/CI-required-success)](https://github.com/Vannon0911/seedWorldLLM/actions)
[![Governance](https://img.shields.io/badge/governance-fail--closed-blue)](./src/kernel/KernelController.js)
[![Docs](https://img.shields.io/badge/docs-synced-informational)](./docs/INDEX.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

SeedWorld LLM is a deterministic RTS playground with a strict terminal-authority patch pipeline and enforced kernel governance.

## Why this project

- Deterministic simulation core for repeatable runtime behavior
- Fail-closed patch orchestration with policy gates and lock discipline
- Governance-enforced action execution via action registry + gate manager
- Browser control plane separated from execution authority

## Quickstart

```bash
npm install
npm run server
```

Local endpoints:

- Game UI: `http://127.0.0.1:3000/`
- Main Menu: `http://127.0.0.1:3000/menu`
- Patch Control: `http://127.0.0.1:3000/patch`
- Popup: `http://127.0.0.1:3000/popup`

## Core Commands

```bash
# Required integrity line
npm run check:required

# Full automated tests
npm test
npm run test:playwright:fulltiles

# Governance & hygiene
npm run governance:verify
npm run hygiene:map
npm run hygiene:why -- src/ui/TileAnimationSDK.js
```

## Architecture at a glance

- `src/kernel/` deterministic routing, governance enforcement, patch acknowledgements
- `src/game/` action schema, mutation matrix, domain patch planning
- `src/ui/` rendering, input, viewport orchestration
- `tools/patch/` terminal patch apply workflow
- `tools/runtime/` verification, docs sync, hygiene tooling

Detailed docs:

- Docs Index: [docs/INDEX.md](./docs/INDEX.md)
- Orientation: [docs/SOT/ORIENTATION.md](./docs/SOT/ORIENTATION.md)
- Workflow: [docs/MANUEL/WORKFLOW.md](./docs/MANUEL/WORKFLOW.md)
- Determinism inventory: [docs/SOT/DETERMINISM_INVENTORY.md](./docs/SOT/DETERMINISM_INVENTORY.md)
- Repo hygiene map: [docs/SOT/REPO_HYGIENE_MAP.md](./docs/SOT/REPO_HYGIENE_MAP.md)
- Deployment guide: [docs/MANUEL/deployment/DEPLOYMENT.md](./docs/MANUEL/deployment/DEPLOYMENT.md)

## Governance & safety guarantees

- Single write entrypoint for patch apply:

```bash
npm run patch:apply -- --input <zip|json>
```

- `KernelController.#execute()` is the governance chokepoint
- Unknown actions are denied (`ACTION_NOT_REGISTERED`) with `auditId`
- Registry + gates are verified by `governance:verify`
- Browser UI cannot bypass terminal patch authority

## Wiki

Project wiki pages:

- [Home](./docs/MANUEL/wiki/Home.md)
- [Architecture](./docs/MANUEL/wiki/Architecture.md)
- [Kernel Governance](./docs/MANUEL/wiki/Kernel-Governance.md)
- [Patch Flow](./docs/MANUEL/wiki/Patch-Flow.md)
- [Developer Onboarding](./docs/MANUEL/wiki/Developer-Onboarding.md)
- [Cleanup & Removal Playbook](./docs/MANUEL/wiki/Cleanup-and-Removal-Playbook.md)

## Contributing

1. Run `npm run check:required`.
2. Keep action changes inside registry + gates.
3. Add/update tests for new behavior.
4. Sync docs with `npm run sync:docs`.

---

Canonical docs entry is [docs/INDEX.md](./docs/INDEX.md). Redundant notes are isolated under [UNVERFID](./UNVERFID/CANDIDATES.md).
