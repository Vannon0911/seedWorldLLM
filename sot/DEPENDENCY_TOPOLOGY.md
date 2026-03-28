# SoT Dependency Topology

## Topological Order
1. `sot/gameplay/action-schema.json`
2. `sot/gameplay/mutation-matrix.json`
3. `sot/gameplay/worldgen-contract.json`
4. `sot/determinism/runtime-guard-policy.json`
5. `sot/determinism/seed-policy.json`
6. `sot/llm-governance/patch-gate-policy.json`
7. `sot/llm-governance/patch-workflow-policy.json`
8. `sot/llm-governance/lock-policy.json`
9. `sot/llm-governance/session-status.schema.json`

## Edges
- `sot/gameplay/mutation-matrix.json -> sot/llm-governance/patch-gate-policy.json`
- `sot/llm-governance/patch-workflow-policy.json -> sot/llm-governance/session-status.schema.json`
- `sot/llm-governance/lock-policy.json -> sot/llm-governance/session-status.schema.json`
