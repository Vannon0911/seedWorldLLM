# Architecture

Tags: `architecture` `kernel` `ui` `boundaries`

## Layer map

- `src/kernel/`: deterministic runtime, routing, governance, gate enforcement
- `src/game/`: domain actions, patch proposals, mutation constraints
- `src/ui/`: DOM/SVG/Canvas rendering and interaction layer
- `tools/patch/`: terminal authority patch pipeline
- `tools/runtime/`: quality, sync and governance checks

## Execution flow

1. UI/game/system submits action
2. `KernelController.#execute()` validates action registry entry
3. `GateManager` enforces required gate
4. `KernelRouter` routes to registered domain handler
5. Determinism guards wrap execution path

## Ownership and boundaries

- Ownership config: [repo-boundaries.json](https://github.com/Vannon0911/seedWorldLLM/blob/main/src/sot/repo-boundaries.json)
- Hygiene graph: [REPO_HYGIENE_MAP](https://github.com/Vannon0911/seedWorldLLM/blob/main/docs/SOT/REPO_HYGIENE_MAP.md)

## Related Pages

- [Home](Home)
- [Kernel Governance](Kernel-Governance)
- [Patch Flow](Patch-Flow)
