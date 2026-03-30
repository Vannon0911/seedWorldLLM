# T01 Inventur Legacy / Wrapper / Fallback

## Legacy-Archiv und Navigation
- Referenz in `docs/INDEX.md:42` auf `legacy/UNVERFID/CANDIDATES.md`
- Referenz in `dev/tools/runtime/syncDocs.mjs:103` auf `legacy/UNVERFID/CANDIDATES.md`
- Archivinhalt liegt unter `legacy/UNVERFID/**`

## UI Wrapper / Fallback Kandidaten
- `app/src/ui/BaseUIController.js`
- `app/src/ui/MainMenuController.js`
- `app/src/ui/UIController.js`

## Runtime Compatibility
- `dev/tools/runtime/preflight-mutation-guard.mjs`
  - explizite legacy-pfade/marker-state vorhanden (`legacy`-Lock/Fault-Handling)

## Browser-Fallbacks
- `app/public/game.html:400-401` Worker-Error -> `IsometricWorldGen` Fallback
- `app/public/game.html:408-409` no-Worker -> `IsometricWorldGen` Fallback

## Klassifikation (erste Runde)
- `legacy/UNVERFID/**`: **KEEP (archiviert)** bis Navigation-Entkopplung beschlossen
- UI-Controller Wrapper: **MIGRATE** in kanonische Controller-Pfade
- preflight legacy-Branches: **KEEP** bis Nachweis, dass keine Legacy-Locks mehr auftreten
- game.html Worker-Fallbacks: **MIGRATE/REDUCE** sobald World-Render-Pfad stabil nachgewiesen

## Offene Verifikationen
- exakter "world-render-path" in Runtime-Modulen final zuordnen
- dynamische Import-/Event-Registrierungen auf versteckte Wrapper-Nutzung pruefen
