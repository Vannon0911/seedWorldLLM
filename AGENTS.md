# Patch Rules

- Es gibt genau einen Write-Einstieg: `npm run patch:apply -- --input <zip|json>`.
- Ein Agent arbeitet immer nur an einem Patch-Lauf gleichzeitig.
- `llm-gates` duerfen nur im terminalseitigen Orchestrator laufen.
- Browser-UI ist nur Control-Plane und darf keine direkten Gate-/Execute-Pfade anstossen.
- Locking ist verpflichtend. Stale-Locks duerfen nur ueber TTL/Deadman uebernommen werden.
- Bei Policy-Verletzung oder unklarer Lage gilt fail-closed.
