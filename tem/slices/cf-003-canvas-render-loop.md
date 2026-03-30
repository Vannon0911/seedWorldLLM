# CF-003 Canvas-Render-Loop

## Scope
Dieser Slice fuehrt den Canvas-Render-Loop als klaren Frame-Takt ein, ohne den DOM-Grid-Pfad abzubauen. Ziel ist ein stabiler Clear/Redraw-Ablauf mit definierter Layer-Reihenfolge: Canvas-Welt unten, Ueberlagerungen darueber, DOM-Grid weiterhin als Referenz und Interaktionsanker aktiv.

## Betroffene Dateien
- `app/src/ui/TileAnimationSDK.js`
- `app/src/ui/UIController.js`
- `app/src/ui/RenderManager.js`
- `app/src/main.js`
- `app/public/game.html`

## Konkrete Implementierungsschritte
1. Einen einzigen kanonischen Render-Scheduler festlegen: entweder der bestehende `requestAnimationFrame`-Pfad in `UIController` oder der Canvas-Loop in `TileAnimationSDK`, aber nicht beide parallel als aktive Frame-Treiber.
2. Den Frame-Ablauf aufteilen in `clear -> world redraw -> overlay redraw -> DOM-grid sync`, damit keine stale Frames oder doppelte Zeichenpfade entstehen.
3. `RenderManager` als Snapshot-Quelle fuer Viewport, Tile-Size und Grid-Bounds verwenden, damit der Canvas-Loop keine eigene Geometrie-Wahrheit einfuehrt.
4. In `game.html` den World-Canvas als unterste visuelle Ebene behandeln und das DOM-Grid darueber belassen; Pointer-Events fuer den World-Canvas bleiben deaktiviert.
5. Resize- und Viewport-Events nur als Invalidation benutzen, nicht als zweiten Render-Loop; der naechste Frame zieht die aktualisierten Massen.
6. Wenn der Worker-Renderpfad weiter genutzt wird, die Canvas-Mount-Logik und die Fallback-Logik so kapseln, dass der Frame-Takt davon nicht dupliziert wird.

## Abnahmekriterien
- Es existiert genau ein aktiver Frame-Scheduler fuer den Canvas-Renderpfad.
- Der Canvas wird pro Frame sauber geleert und neu aufgebaut, ohne Flackern oder ueberlagerte Altbilder.
- World-Canvas, Overlays und DOM-Grid bleiben in der korrekten Z-Reihenfolge.
- DOM-Grid bleibt funktional sichtbar und interaktiv; es wird in diesem Slice nicht entfernt.
- Resize/Viewport-Aenderungen fuehren zu einer sichtbaren, konsistenten Neuberechnung innerhalb des naechsten Frames.

## Testschritte
1. Anwendung starten und `game.html` oeffnen; pruefen, dass World-Canvas und DOM-Grid gemeinsam sichtbar sind.
2. Mehrere Sekunden laufen lassen und auf doppelte Animationen, Flackern oder ungeplante Re-Renders achten.
3. Browser-Fenster vergroessern/verkleinern und pruefen, dass Canvas und Grid nachziehen und nicht gegeneinander versetzt laufen.
4. Tile-/Tick-Aenderungen ausloesen und verifizieren, dass genau ein neuer Frame die Szene aktualisiert.
5. Vorhandene Smoke-/Playwright-Checks gegen den UI-Pfad laufen lassen, insbesondere den Fulltiles-Flow und die Browser-Konsole auf Fehler pruefen.

## Risiken
- Zwei parallele RAF-Schleifen koennen CPU verbrennen und Renderzustand gegeneinander ueberholen.
- Unterschiedliche DPR-/Rundungslogik zwischen Canvas und DOM-Grid kann sichtbare Off-by-one-Versatzfehler erzeugen.
- Worker- und Main-Thread-Renderpfade koennen sich auseinanderentwickeln, wenn beide weiter aktiv sind.
- Die Referenz durch das DOM-Grid kann einen falschen Eindruck von Stabilitaet vermitteln, obwohl der Canvas-Loop bereits driftet.

## Rollback
- Den neuen Canvas-Scheduler deaktivieren und auf den bisherigen DOM-dominierten Refresh-Pfad zurueckfallen.
- Canvas-Welt-Mounting in `game.html` auf den letzten stabilen Zustand zuruecksetzen.
- `TileAnimationSDK` bzw. den neuen Frame-Treiber wieder entkoppeln, falls sich Doppel-Rendering oder Geometrie-Drift zeigt.
- Den DOM-Grid-Pfad unveraendert lassen, damit die Referenz fuer weitere Fehlersuche erhalten bleibt.
