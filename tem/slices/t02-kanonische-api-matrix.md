# T02 Kanonische API-Matrix

## Ziel
Fuer jedes Feature genau einen kanonischen Primaerpfad festziehen. Keine zweite Geometriequelle, kein heimlicher DOM-Shortcut, kein stiller Fallback als Ausrede.

## Basis
- Zielbild: `tem/cf-001-architektur-notiz.md`
- Aktuelle Runtime: `app/src/main.js`
- Reports: `tem/reported-bugs.md`, `tem/test-evidence-report.md`, `tem/langfristiger-bug-plan.md`

## Target-API-Matrix

| Feature | kanonischer Pfad | Legacy-Pfad | Migrationsschritt | Verifikation |
|---|---|---|---|---|
| Viewport-Snapshot / Resize | `app/src/ui/RenderManager.js#state.viewport`, `#subscribe()`, `#getSnapshot()` | `app/src/ui/ViewportManager.js#start()`, `#subscribe()` direkt in `app/src/main.js`, `app/public/game.html`, `app/src/plugins/radialBuildController.js` | `ViewportManager` bleibt nur Event-Quelle; alle Verbraucher lesen den Snapshot nur noch aus `RenderManager.subscribe(...)`. Direkte `viewportManager.subscribe(...)`-Callsites in UI-/Overlay-Code abbauen. | Resize- oder Orientation-Update muss in einem Bootstrap-Test bis `RenderManager` und weiter bis `TileGridRenderer.onViewportChange()` durchlaufen; `rg -n "viewportManager.subscribe|window.addEventListener\\(\"resize\""` darf nur noch die erlaubten Stellen zeigen; `npm test`, `test:playwright:fulltiles`. |
| Grid-Bounds / Tile-Size | `RenderManager.state.gridBounds`, `RenderManager.state.tileSize`, `RenderManager.setGrid(...)` | Hardcoded `16/12/84` in `app/src/ui/UIController.js#ensureTileGrid()`, `app/src/ui/GameUIController.js#createGameWorld()`, `app/public/game.html#readTerrainParams()` | Grid-Metrik einmalig aus dem Bootstrap-/World-Source in `RenderManager` setzen. `TileGridRenderer` und World-Render-Code nur noch aus dem Snapshot bedienen, nicht aus eigenen Konstanten. | Ein gezielter Resync-Test muss belegen, dass ein neues `setGrid()` die Grid-Masse in UI und Terrain-Render synchron haelt; kein harter `16/12/84`-Pfad mehr ausser der zentralen Bootstrap-Quelle; `npm run evidence:verify` plus ein Bootstrap-Regressionstest. |
| World -> Screen | `RenderManager.worldToScreen(x, y)` | Direkte Pixel-Math und DOM-Zentrierung in `app/public/game.html#getTileCenter()`, `app/src/plugins/radialBuildController.js#getTileCenter()`; ad hoc Tile-Pixel-Math in rendernahen Hilfen | Overlay-, Effekt- und Linienpositionen ueber `RenderManager.worldToScreen(...)` berechnen. DOM-Rects bleiben Render-Detail, aber nicht die Geometriequelle. | Visual-Smoke nach Resize/Zoom muss zeigen, dass Overlay-Linien und Effektmarker auf dem Tile-Zentrum bleiben; `test:playwright:fulltiles` und ein kurzer Screenshot-Vergleich. |
| Screen -> Tile Hit-Test | `RenderManager.screenToTile(px, py)` | DOM-Tile-Rects, `dataset.x/y`-Abfragen und `getBoundingClientRect()`-Logik in `app/src/ui/TileGridRenderer.js`, `app/public/game.html`, `app/src/plugins/radialBuildController.js` | Pointer-, Hover- und Drag-Logik von DOM-Rects auf `screenToTile(...)` umstellen. `TileGridRenderer` bleibt Darstellung und Tile-Identity, aber nicht mehr die zweite Hit-Test-Wahrheit. | Edge-/Corner-Test fuer Grenzpixel und High-DPI muss gruen sein; keine direkte `getBoundingClientRect()`-Abhaengigkeit mehr im aktiven Input-Pfad; `npm test` plus gezielter Hit-Test-Smoke. |
| World-Render-Parameter / Terrain-Sync | `RenderManager.getSnapshot().gridBounds` und `tileSize` als Input fuer den World-Layer | `ui.tileGridRenderer.width/height/tileSize` in `app/public/game.html#readTerrainParams()` | World-Terrain-Worker und SVG-Layer aus dem `RenderManager`-Snapshot speisen. `UIController` darf die Grid-Masse nicht mehr als private Renderer-Interna auslesen. | Bootstrap- und Resize-Test muss zeigen, dass World-Render und Grid denselben Snapshot sehen; `app/public/game.html` darf im Render-Pfad keine direkte Abfrage von `ui.tileGridRenderer.*` mehr brauchen. |

## Abschlussregel
Wenn ein Feature keinen eindeutigen kanonischen Pfad hat, ist die Spezifikation noch nicht fertig. Dann wird nicht migriert, sondern erst geklaert.
