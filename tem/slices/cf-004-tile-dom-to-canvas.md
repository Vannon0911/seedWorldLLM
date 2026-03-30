# CF-004 Tile-Basisdarstellung DOM -> Canvas

## Ziel
Die Tile-Basisdarstellung wird von der DOM-Grid-Layer auf Canvas verlagert. Sichtbare Grundzustände wie normal, blocked und active sollen auf Canvas laufen. Hover, Selection, Icons und Effekte bleiben fuer die folgenden Slices getrennt.

## Scope
- Basis-Tile-Rendering auf Canvas
- Ein gemeinsamer Geometriepfad ueber `RenderManager`
- DOM-Grid als Referenz-/Strukturlayer, aber nicht mehr als visuelle Wahrheit fuer die Tile-Basis
- Keine Aenderung an Input-Hit-Testing, Hover oder Selection

## Nicht im Scope
- Hover-, Selection- und Effekt-Rendering
- DOM-Grid-Abbau
- Umstellung auf `screenToTile` fuer Pointer-Events
- SVG-Overlay-Reduktion

## Betroffene Dateien
- `app/src/ui/TileGridRenderer.js`
- `app/src/ui/TileAnimationSDK.js`
- `app/src/ui/RenderManager.js`
- `app/src/ui/UIController.js`
- `app/src/ui/GameUIController.js`
- `app/public/game.html`
- `app/src/ui/tileGrid.css`

## Konkrete Implementierungsschritte
1. Die visuelle Basisdarstellung der Tiles aus dem DOM-Renderer in eine Canvas-Layer ueberfuehren.
2. `RenderManager` als alleinige Quelle fuer `viewport`, `gridBounds` und `tileSize` verwenden, damit DOM und Canvas dieselbe Geometrie sehen.
3. Die DOM-Grid-Layer nur noch als strukturelle Referenz vorhalten und keine zweite visuelle Wahrheit fuer die Tile-Basis erzeugen.
4. Die Canvas-Zeichenreihenfolge so festziehen, dass Basis-Tiles unter spaeteren Overlay- und Effekt-Layern liegen.
5. Resize- und Bootstrap-Pfade pruefen, damit DOM- und Canvas-Masse nicht auseinanderlaufen.
6. Tile-State-Aenderungen nur einmal aus dem Spielzustand ableiten und nicht doppelt in DOM und Canvas berechnen.

## Abnahmekriterien
- Die Tile-Basiszustände sind auf Canvas sichtbar und deckungsgleich zur bisherigen DOM-Darstellung.
- Das DOM-Grid erzeugt keine konkurrierende visuelle Basisdarstellung mehr.
- Resize und Bootstrap halten Tile-Size und Grid-Bounds in Canvas und Referenzpfad synchron.
- Hover-, Selection- und Effektlogik bleibt ausserhalb dieses Slices.
- Die Canvas-Darstellung bleibt stabil, ohne Flackern oder sichtbaren Versatz.

## Testschritte
1. Anwendung starten und die Tile-Basisdarstellung im Canvas gegen die bisherige DOM-Referenz vergleichen.
2. Fenster vergroessern und verkleinern und verifizieren, dass Tile-Masse und Positionen identisch nachziehen.
3. Tile-Zustandswechsel ausloesen und pruefen, dass die Canvas-Layer ohne Doppelrender aktualisiert.
4. Vorhandene Smoke-/Playwright-Checks gegen den UI-Pfad laufen lassen und die Konsole auf Rendering-Fehler pruefen.

## Risiken
- Unterschiedliche Metrik zwischen DOM-Grid und Canvas fuehrt zu Versatz oder Pixelbruch.
- Doppelte Zeichenpfade koennen kurzzeitig zwei Wahrheiten erzeugen, die sich gegenseitig zerlegen.
- Rundung und DPR koennen an Kanten abweichen, wenn Canvas und DOM nicht exakt dieselbe Geometrie nutzen.
- Zu fruehe Vermischung mit Hover- oder Selection-Logik macht den Slice instabil.

## Rollback
- Die Canvas-Basisdarstellung deaktivieren und auf die bisherige DOM-Tile-Darstellung zurueckfallen.
- Neue Zeichenlogik hinter einem klar getrennten Entrypoint isolieren.
- DOM-Grid-Styling und Layout wieder als alleinige visuelle Basis verwenden, bis die Canvas-Variante sauber steht.
