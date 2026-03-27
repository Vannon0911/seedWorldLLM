# SeedWorld Dev Notes

## Aktive Entry-Points

- Web-Server: `npm run server`
- Patch-CLI: `npm run patch:apply -- --input <zip|json>`
- Test-Runner: `npm test`

## Patch-System v1

Der neue Flow ist absichtlich linear:

1. Intake
2. Normalize
3. Risk-Classify
4. Lock + Deadman
5. Terminal-only `llm-gates`
6. Backup
7. Apply
8. Verify
9. Test
10. Finalize + Release-Lock

## Browser-Vertrag

Aktive API:
- `POST /api/patch-sessions`
- `GET /api/patch-sessions/:id`
- `GET /api/patch-sessions/:id/events`
- `GET /api/patch-sessions/:id/logs`
- `GET /api/patch-sessions/:id/result`
- `POST /api/patch-sessions/:id/cancel`

Entfernt:
- alte `/api/patches`-Pfade
- alte `/api/hooks`-Freigaben
- direkte WebSocket-Apply-/Validate-Aktionen

## Hinweise fuer Implementierungen

- ZIP hat Vorrang vor verstreuten Einzeldateien und wird immer in `.patch-manager/intake/<session-id>/` entpackt.
- Manifest-Autofind bevorzugt `patches*.json`.
- Session-Statusdatei ist die Wahrheit fuer UI und Popup.
- Browser startet nur orchestrierte Sessions und fuehrt nie selbst Gates aus.
