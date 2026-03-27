# Patch Workflow

## Kanonischer Einstieg

```bash
npm run patch:apply -- --input <zip|json> [--actor <name>]
```

## Ablauf

1. `intake`
2. `unpack`
3. `manifest-validate`
4. `normalize`
5. `risk-classify`
6. `acquire-lock`
7. `llm-gates`
8. `backup`
9. `apply`
10. `verify`
11. `test`
12. `finalize`
13. `release-lock`

## Regeln

- Terminal-Authority ist exklusiv.
- Browser startet nur orchestrierte Sessions.
- Lock-Bypass ist verboten.
- Fehler laufen fail-closed.
- Finalstatus ist nur `succeeded`, `failed_rolled_back` oder `failed_partial`.
