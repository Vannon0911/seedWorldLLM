# Langfristiger Bug-Plan

## Consolidated Findings
- Der aktuelle Verifikationsstand ist stabil: Die gemeldeten Testlaeufe sind gruen, `npm test` ist bestanden, `npm run evidence:verify` ist bestanden, und die Determinismuspruefung ist konsistent.
- In der bisherigen `RenderManager`-Integration wurde kein kritischer kausaler Bug reproduziert. Die Bootstrap-Reihenfolge `ViewportManager -> RenderManager -> UIController` ist konsistent, und der UI-Pfad ohne `RenderManager` bleibt funktionsfaehig.
- Das groesste technische Folgerisiko liegt in der Geometrie-Synchronisation: `TileGridRenderer` wird derzeit nur initial mit Grid-Metadaten versorgt. Wenn `gridBounds` oder andere Geometriewerte spaeter dynamisch aenderbar werden, ist kein belegter Live-Resync-Pfad vorhanden.
- Der Evidence-Bundle-Schritt ist blockiert: `dev/scripts/build-evidence-bundle.mjs` importiert `jszip`, aber `package.json` deklariert die Abhaengigkeit nicht und `package-lock.json` enthaelt keinen Treffer dafuer. Damit scheitert `npm run evidence:bundle` in diesem Workspace beim Modul-Load.
- `app/src/sot/testline-integrity.json` wurde nur ueber `generatedAt` beruehrt. Fuer diese Datei existiert bereits ein kanonischer Aktualisierungspfad ueber `dev/tools/runtime/update-testline-integrity.mjs`; manuelle Aenderungen koennen die Herkunft der Integrity-Basis von der Hash-Basis entkoppeln.
- Legacy- und Fallback-Pfade bleiben in `app/public/game.html` sowie in Runtime-Guards bewusst erhalten. Solange diese Branches existieren, koennen Primarpfad-Regressions durch Fallback-Verhalten verdeckt werden.

## Root-Cause Hypotheses
- Die Geometrie bleibt aktuell stabil, weil Bootstrap und Renderer auf einen einmaligen Initialisierungszustand ausgerichtet sind. Ein spaeterer Wechsel von `gridBounds` wird wahrscheinlich nicht automatisch bis zu `TileGridRenderer` durchgereicht, wenn keine explizite Update-Kopplung existiert.
- Der Evidence-Bundle-Fehler entsteht durch Manifest-Drift: Ein Build-Script wurde um `JSZip` erweitert, aber die Projektabhaengigkeiten wurden nicht synchron nachgezogen.
- Der Integrity-Drift-Risiko entsteht, weil die Datei ueber einen direkten Inhaltseingriff statt ueber den vorgesehenen Update-Workflow gepflegt werden kann. Dadurch bleibt der Zeitstempel lokal konsistent, aber die provenance-basierte Pflege wird inkonsistent.
- Legacy-Fallbacks wurden wahrscheinlich bewusst zur Rueckwaertskompatibilitaet belassen. Genau das macht sie langfristig riskant: Sie sichern alte Pfade ab, koennen aber Unterschiede zwischen Hauptpfad und Ersatzpfad kaschieren.

## Long-Term Mitigation Plan
### Phase 1: Toolchain und Evidenz absichern
- Die fehlende `jszip`-Abhaengigkeit im Manifest schliessen oder den Bundle-Mechanismus so umstellen, dass er ohne verdeckte Zusatzabhaengigkeit laeuft.
- Den kanonischen Update-Workflow fuer `app/src/sot/testline-integrity.json` verbindlich machen, damit Baseline- und Hash-Pflege nicht auseinanderlaufen.
- Einen gezielten Bootstrap-Regressionstest fuer Resize/Initialisierung anlegen, der den Weg vom `RenderManager` bis zum `TileGridRenderer` abdeckt.

### Phase 2: Geometrie als einziges Wahrheitsmodell
- Sicherstellen, dass alle Geometrie- und Koordinatenpfade nur ueber `RenderManager` laufen.
- Einen Live-Update-Pfad fuer geaenderte `gridBounds`, Viewport-Werte und verwandte Metriken definieren.
- Eingabe- und Hit-Test-Pfade gegen dieselbe Geometriequelle binden, damit Resize, Zoom und Tile-Hit-Testing nicht auseinanderdriften.

### Phase 3: Legacy- und Fallback-Pfade reduzieren
- Die in `game.html` und in Runtime-Guards verbleibenden Ersatzpfade nur noch dort behalten, wo sie nachweislich noetig sind.
- Sobald der Primarpfad in Tests und Smoke-Checks konstant gruen bleibt, die verbleibenden Fallback-Zweige schrittweise entfernen.
- Jede Restausnahme mit klarer Begruendung, Besitzer und Ablaufkriterium versehen.

### Phase 4: Verifikation und Release-Gates verstaerken
- Die kritischen Verifikationen in einer festen Reihenfolge betreiben: funktionale Tests, Evidence-Verifikation, Determinismus, dann Bundle-Erzeugung.
- Fuer Geometrieaenderungen eine Kombination aus automatisiertem Playwright-Smoke und gezielter Modulpruefung verpflichtend machen.
- Release- oder Merge-Gates so definieren, dass Evidence-Bundle, Testline-Integrity und Determinismus nicht nur dokumentiert, sondern erzwungen werden.

## Execution Backlog
| Prioritaet | Task | Owner-Vorschlag | Exit-Kriterium |
|---|---|---|---|
| P0 | Fehlende `jszip`-Abhaengigkeit im Evidence-Bundle-Skript beheben oder den Import entfernen. | Build/Tooling | `npm run evidence:bundle` laeuft in einer frischen Installation ohne Modul-Load-Fehler durch. |
| P0 | Bootstrap-Regressionstest fuer `RenderManager`-Resize und `TileGridRenderer`-Synchronisation anlegen. | Rendering/QA | Ein Test belegt den Resync-Pfad nach Resize oder Grid-Aenderung, und der Test ist gruen. |
| P0 | Den Update-Pfad fuer `app/src/sot/testline-integrity.json` auf den kanonischen Updater festziehen. | Repo Hygiene | Die Datei wird nur noch ueber `dev/tools/runtime/update-testline-integrity.mjs` geaendert, und die Verifikation bleibt gruen. |
| P1 | `RenderManager` als alleinige Geometriequelle fuer Koordinaten- und Hit-Test-Pfade absichern. | Rendering | Alle relevanten Berechnungen laufen nachweislich ueber `RenderManager`, ohne zweite Geometriequelle. |
| P1 | Live-Resync fuer dynamische `gridBounds` und Viewport-Werte implementieren. | Rendering | Geometrieaenderungen bleiben nach init, resize und zoom synchron, ohne manuelle Neuinitialisierung. |
| P1 | Resize-, Zoom- und Edge-Hit-Tests fuer Eingabe und Darstellung erweitern. | QA | Automatisierte Tests decken Standardfall und Grenzfaelle ab und laufen in CI stabil. |
| P2 | Legacy- und Fallback-Zweige in `app/public/game.html` und Runtime-Guards minimieren. | Runtime/Frontend | Nicht mehr noetige Ersatzpfade sind entfernt oder mit klarer Begruendung dokumentiert. |
| P2 | Evidence- und Determinismus-Gates fuer Release- und Merge-Prozesse verbindlich machen. | Release/Governance | `npm test`, `npm run evidence:verify` und die relevanten Integrity-Checks sind als Pflichtgates definiert. |

## Verification Strategy
### Phase 1
- `npm test`
- `npm run evidence:verify`
- `npm run evidence:bundle`
- `npm run gate:testline:verify`

### Phase 2
- Zielgerichteter Modul- oder Bootstrap-Test fuer `RenderManager` und `TileGridRenderer`
- `npm run test:playwright:fulltiles`
- Resize- und Zoom-Smoke mit Konsolenpruefung

### Phase 3
- Browser-Smoke fuer den Hauptpfad und die noch vorhandenen Ersatzpfade
- Sichtpruefung auf Konsolenfehler, doppelte Renderpfade und unerwartete Fallback-Aktivierung
- `check:required`

### Phase 4
- `npm test`
- `npm run evidence:verify`
- Determinismus- und Integrity-Pruefung auf dem letzten Evidence-Artifact
- Bundle-Erzeugung als Pflichtschritt vor dem Abschluss

## Risk Register
| Risiko | Eintrittswahrscheinlichkeit | Impact | Trigger |
|---|---|---|---|
| Geometrie driftet nach Resize oder spaeterer Grid-Aenderung auseinander. | Mittel | Hoch | `gridBounds`, Viewport oder Tile-Metriken werden nach dem Bootstrap geaendert. |
| Evidence-Bundle bricht in einer sauberen Umgebung wegen fehlender `jszip`-Abhaengigkeit. | Hoch | Mittel | `npm run evidence:bundle` oder ein Fresh-Install laeuft ohne bereits vorhandenes lokales Modul-Residuum. |
| Integrity-Baselines driften, wenn `testline-integrity.json` manuell statt ueber den Updater gepflegt wird. | Mittel | Mittel | Direkte Aenderung von `app/src/sot/testline-integrity.json` ausserhalb des vorgesehenen Scripts. |
| Legacy-Fallbacks verdecken einen Fehler im Primarpfad oder erzeugen abweichendes Verhalten. | Mittel | Hoch | Worker-Ausfall, No-Worker-Fall oder andere Bedingungen aktivieren den Ersatzpfad. |
| Grenzfaelle im Hit-Testing werden bei Zoom oder Edge-Positionen falsch zugeordnet. | Mittel | Mittel | Input- oder Rendering-Aenderungen betreffen `screenToTile`, Corner-Faelle oder High-DPI-Skalierung. |
