# LLM Policy

## Default-Pflichten

1. Pflicht-Lesereihenfolge strikt einhalten.
2. Nur atomare Arbeitspakete umsetzen.
3. Vor Commit lokal `npm run check:required` ausfuehren (teilautomatischer Sync + fail-closed Verify).
4. Vor Push `npm run check:required:verify-only` bestehen (kein Auto-Write).
5. Claims ueber Qualitaetsstatus nur aus Gate-Output + `runtime/evidence/required-check-report.json` ableiten.

## Commit-Blocker

- Fehlender ACK-Status (`runtime/.patch-manager/llm-read-state.json`)
- Hash-Mismatch zwischen ACK und Pflichtdokumenten
- Fehlende Runtime-Gegenpruefung
- Fehlende oder invalide Test-Evidence
- Testline-Integritaetsverletzung (Hash-Drift, Injection-Muster, Anti-Determinismus/BYPASS-Spuren)
- Fehlender oder invalider `runtime/evidence/required-check-report.json`
- Verify-Gate nicht komplett gruen (`tests -> evidence -> testline -> hygiene -> docs:v2`)

## Push-Sicherheitsregeln (verbindlich)

- `git push --force` und `git push --force-with-lease` sind verboten.
- Non-fast-forward Pushes (History-Rewrite) sind verboten.
- Remote-Ref-Löschungen via Push (`:<branch>`) sind verboten.
- `pre-push` blockiert diese Fälle mechanisch und erzwingt `check:required:verify-only`.

## Standardbefehle

```bash
npm run check:required
npm run check:required:verify-only
```
