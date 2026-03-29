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
7. `policy-gates`
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
- `policy-gates` muessen mit `src/llm/llm-gate-policy.json` deterministisch auswerten.
- Cancel braucht Session-Token (`X-Patch-Cancel-Token`) und ist idempotent + rate-limitiert.
- Testlaeufe schreiben Evidence-Artefakte nach `.patch-manager/logs/test-run-<timestamp>.json`.

## GitHub Enforcements (No-Bypass)

1. Lokale Hooks sind nur Vorpruefung, nicht die finale Autoritaet.
2. Harte Merge-Sperre laeuft ueber GitHub Ruleset + Required Checks.
3. `main` darf nur per PR gemerged werden, nie per Direct Push.
4. Force-Push, Ref-Delete und Non-FF sind serverseitig blockiert.

### Setup (einmalig pro Repo)

```bash
npm run github:ruleset:apply
```

### Pflicht-Check in GitHub Actions

- Workflow: `.github/workflows/required-checks.yml`
- Required Context: `preflight-and-governance`
