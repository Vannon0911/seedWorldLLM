# LLM Policy

## Default-Pflichten

1. Pflicht-Lesereihenfolge strikt einhalten.
2. Nur atomare Arbeitspakete umsetzen.
3. Vor Commit/Push: Guard + Sync + Preflight + Tests.

## Commit-Blocker

- Fehlender ACK-Status (`runtime/.patch-manager/llm-read-state.json`)
- Hash-Mismatch zwischen ACK und Pflichtdokumenten
- Fehlende Runtime-Gegenpruefung

## Standardbefehle

```bash
npm run llm:entry
npm run llm:guard
npm run sync:docs
npm run preflight
npm test
```
