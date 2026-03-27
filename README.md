# SeedWorld

SeedWorld nutzt einen einheitlichen Patch-Flow mit Terminal-Authority. Es gibt genau einen kanonischen Write-Einstieg:

```bash
npm run patch:apply -- --input <pfad-zur-zip-oder-json>
```

## Schnellstart

```bash
npm install
npm run server
```

- Game UI: `http://127.0.0.1:3000/`
- Patch Control: `http://127.0.0.1:3000/patch`
- Popup: `http://127.0.0.1:3000/popup`

## Patch-Flow

Optionaler Actor:

```bash
npm run patch:apply -- --input <pfad> --actor <name>
```

Phasen:

`intake -> unpack -> manifest-validate -> normalize -> risk-classify -> acquire-lock -> llm-gates -> backup -> apply -> verify -> test -> finalize -> release-lock`

## Browser Control Plane

Die Browser-UI darf nur:
- Session starten
- Session beobachten
- Logs und Summary lesen
- Cancel anfordern

Die Browser-UI darf nicht:
- `llm:*` Gates direkt ausfuehren
- direkte Execute-/Apply-/Validate-Endpunkte triggern
- Locking umgehen

Entfernte Legacy-Endpunkte:
- `GET /api/patches`
- `POST /api/patches`
- `DELETE /api/patches/:id`
- `GET /api/hooks`

## Session-Artefakte

- Lock: `.patch-manager/terminal-session.lock`
- Intake: `.patch-manager/intake/<session-id>/`
- Status: `.patch-manager/sessions/<session-id>.status.json`
- Logs: `.patch-manager/logs/<session-id>.jsonl`
- Summary: `.patch-manager/logs/<session-id>.summary.txt`

## Tests

```bash
npm test
```
