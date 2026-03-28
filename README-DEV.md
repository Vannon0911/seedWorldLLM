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
5. Terminal-only `policy-gates`
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
  - Header `X-Patch-Cancel-Token` oder Body-Fallback `{ cancelToken }`

Entfernt:
- alte `/api/patches`-Pfade
- alte `/api/hooks`-Freigaben
- direkte WebSocket-Apply-/Validate-Aktionen

## Hinweise fuer Implementierungen

- ZIP hat Vorrang vor verstreuten Einzeldateien und wird immer in `.patch-manager/intake/<session-id>/` entpackt.
- Manifest-Autofind bevorzugt `patches*.json`.
- Session-Statusdatei ist die Wahrheit fuer UI und Popup.
- Browser startet nur orchestrierte Sessions und fuehrt nie selbst Gates aus.
- `policy-gates` verwenden die statische Policy in `docs/llm-gate-policy.json`.
- Typed constraints fuer Mutationen liegen in `src/game/contracts/mutationMatrixConstraints.js`.
- `npm test` erzeugt ein maschinenlesbares Evidence-Artefakt unter `.patch-manager/logs/`.
- Repo-Hygiene/Ownership-Graph: `npm run hygiene:map` (schreibt `docs/REPO_HYGIENE_MAP.md` + `.json`).
- Datei-Loeschentscheidung: `npm run hygiene:why -- <rel-path>` zeigt Owner + Inbound/Outbound-Abhaengigkeiten fuer die Datei.

## Kernel Governance (erzwungen)

- `KernelController.#execute()` ist der einzige Governance-Chokepoint.
- Alle erlaubten Actions muessen in der `ActionRegistry` registriert sein (`domain`, `actionType`, `requiredGate`, `validator`, `handler`).
- Unbekannte Actions werden fail-closed geblockt (`ACTION_NOT_REGISTERED`) und bekommen eine `auditId`.
- Gate-Enforcement laeuft ueber `GateManager` + `KernelGates` vor dem Routing.
- Konsistenzcheck: `npm run governance:verify` (Registry/Gates/Architektur-Lint).
- Template fuer neue Actions: `node tools/runtime/new-action-template.mjs <domain> <actionType> <requiredGate>`.
- UI/Dev-Command-Mapping laeuft ueber `src/kernel/interface.js` (`state.get`, `patch.list`, `gate.status`, `event.recent`, `kernel.reset`, `gate.check.*`, `gate.execute.*`).

## Rendering und Resize

- `src/ui/ViewportManager.js` ist die zentrale Resize-Quelle (Single-Listener auf `window`).
- `src/main.js` erstellt den `ViewportManager` und exposed ihn als `window.seedWorldViewportManager`.
- `public/game.html` (World-Layer), `radialBuildController` (SVG-Layer) und `UIController/TileGridRenderer` (DOM-Grid) beziehen Resize-Updates aus dieser einen Quelle.
- Der Worker-basierte World-Canvas wird mit `max-width: 100%` + `max-height: 100%` gemountet und bei Viewport-Änderungen debounce-t neu gerendert.

## TileAnimationSDK Status

- `src/ui/TileAnimationSDK.js` ist aktuell nicht in den aktiven UI-Flow verdrahtet (keine Instanziierung im Runtime-Pfad).
- Die Datei bleibt als vorbereitete Effekt-Schicht mit eigener `resize(width, height, tileSize)`-API bestehen.
- Bei Reaktivierung sollte die SDK-Instanz auf denselben `ViewportManager` subscriben, statt einen eigenen `window.resize`-Pfad aufzubauen.
