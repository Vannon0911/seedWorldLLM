# CF-001 Architektur-Notiz (RenderManager als SoT)

## Scope
Diese Notiz fixiert die Zielverantwortung fuer den Canvas-first Umbau.

## Source of Truth
- `viewport`: einzig ueber `RenderManager.state.viewport`
- `tileSize`: einzig ueber `RenderManager.state.tileSize`
- `gridBounds`: einzig ueber `RenderManager.state.gridBounds`
- `worldToScreen(x,y)`: zentral ueber `RenderManager.worldToScreen`
- `screenToTile(px,py)`: zentral ueber `RenderManager.screenToTile`

## Rollenverteilung
- `ViewportManager`: liefert nur Window-Snapshot-Events (Resize/Orientation)
- `RenderManager`: konsolidiert Viewport + Grid-Metriken und stellt Koordinaten-Math bereit
- `TileGridRenderer`: zeichnet, konsumiert nur Viewport/Grid-Werte, besitzt keine eigene globale Geometrie-Wahrheit
- `UIController`: orchestration layer, delegiert Geometrie-Entscheidungen an `RenderManager`

## Migrationsregel
Neue Render-/Input-Pfade duerfen keine zweite Geometriequelle einfuehren. Wenn Koordinaten gebraucht werden, muss der Call ueber `RenderManager` laufen.
