# Patch Flow

Tags: `patching` `pipeline` `locks` `policy-gates`

## Canonical entrypoint

```bash
npm run patch:apply -- --input <zip|json>
```

## Pipeline

`intake -> unpack -> manifest-validate -> normalize -> risk-classify -> acquire-lock -> policy-gates -> backup -> apply -> verify -> test -> finalize -> release-lock`

## Safety invariants

- terminal authority is exclusive
- lock is mandatory
- policy-gates are deterministic and fail-closed
- browser UI cannot run direct apply/execute/gate paths

## References

- Workflow: [WORKFLOW](https://github.com/Vannon0911/seedWorldLLM/blob/main/docs/MANUEL/WORKFLOW.md)
- Gate policy: [llm-gate-policy.json](https://github.com/Vannon0911/seedWorldLLM/blob/main/src/llm/llm-gate-policy.json)

## Related Pages

- [Home](Home)
- [Kernel Governance](Kernel-Governance)
