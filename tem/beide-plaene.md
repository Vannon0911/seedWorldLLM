# Canvas-First Implementierungsplan (atomare Tasks)

## [CHECK] CF-001
**Ziel:** Bestand aufnehmen und Zielarchitektur fuer `RenderManager` festziehen (Canvas-first, gemeinsamer Koordinatenraum).

**Konkrete Dateien/Module:** `zu verifizieren` (vermutlich Rendering-Entry, Viewport-Logic, Input-Handler)

**Abnahmekriterium:** Architektur-Notiz im PR (kurz) mit finalen Verantwortlichkeiten: `viewport`, `tileSize`, `gridBounds`, `worldToScreen`, `screenToTile`.

**Risiko/Blocker:** Aktuelle Verantwortlichkeiten sind ueber mehrere Module verstreut; fehlende Dokumentation.

**Abhaengigkeiten/Sequenz:** Starttask, keine Abhaengigkeit.

## [CHECK] CF-002
**Ziel:** `RenderManager` als Source of Truth einfuehren (nur State/Math, noch kein komplettes Rendering).

**Konkrete Dateien/Module:** `zu verifizieren` (neues `RenderManager`-Modul + bestehende Viewport/Coord-Utilities)

**Abnahmekriterium:** Alle Koordinatenumrechnungen laufen ueber `RenderManager`; Legacy-Helper sind delegiert/deprecated, Verhalten bleibt gleich.

**Risiko/Blocker:** Regression bei Zoom/Resize durch Rundung/Off-by-one.

**Abhaengigkeiten/Sequenz:** Nach CF-001.

## CF-003
**Ziel:** Canvas-Render-Loop aufsetzen (Frame-Takt, Clear/Redraw, Layer-Reihenfolge), ohne DOM-Grid-Abbau.

**Konkrete Dateien/Module:** `zu verifizieren` (Game-Loop, Render-Entry, Canvas-Setup)

**Abnahmekriterium:** Canvas rendert stabil pro Frame; DOM-Grid bleibt parallel als Referenz aktiv.

**Risiko/Blocker:** Doppeltes Rendering kann Performance temporaer verschlechtern.

**Abhaengigkeiten/Sequenz:** Nach CF-002.

## CF-004
**Ziel:** Tile-Basisdarstellung von DOM nach Canvas migrieren (Grundzustaende ohne Hover/Selection/Effekte).

**Konkrete Dateien/Module:** `zu verifizieren` (Tile-Renderer, Tile-State-Model)

**Abnahmekriterium:** Sichtbare Tile-States (z. B. normal/blocked/active) sind auf Canvas deckungsgleich zur DOM-Referenz.

**Risiko/Blocker:** Isometrische Projektion kann bei Kanten ausfransen.

**Abhaengigkeiten/Sequenz:** Nach CF-003.

## CF-005
**Ziel:** Interaktive Tile-Layer auf Canvas ergaenzen (Hover, Selection, Icons, visuelle Effekte).

**Konkrete Dateien/Module:** `zu verifizieren` (Interaction-Visuals, Effect-Renderer, Icon-Atlas)

**Abnahmekriterium:** Hover/Selection/Icons/Effekte erscheinen korrekt und folgen Kamera/Zoom ohne Versatz.

**Risiko/Blocker:** Z-Order und Alpha-Blending koennen bestehende Effekte verfaelschen.

**Abhaengigkeiten/Sequenz:** Nach CF-004.

## CF-006
**Ziel:** World/Voxel-Hintergrund in denselben Koordinatenraum ziehen (kein separater Transform mehr).

**Konkrete Dateien/Module:** `zu verifizieren` (World-Background/Voxel-Renderer)

**Abnahmekriterium:** Hintergrund und Tiles bleiben bei Pan/Zoom/Resize deckungsgleich.

**Risiko/Blocker:** Bestehende Hintergrund-Optimierungen evtl. nicht kompatibel mit neuem Transform.

**Abhaengigkeiten/Sequenz:** Nach CF-004 (parallel zu CF-005 moeglich, wenn Layer entkoppelt).

## CF-007
**Ziel:** SVG auf Overlay-Rolle reduzieren (nur Linien/Pulse), mit sauberer Layer-Reihenfolge ueber Canvas.

**Konkrete Dateien/Module:** `zu verifizieren` (SVG-Overlay-Komponente, Overlay-Controller)

**Abnahmekriterium:** Nur Linien/Pulse laufen noch ueber SVG; Positionen bleiben bei Zoom/Resize korrekt.

**Risiko/Blocker:** Mismatch zwischen Canvas-Pixelratio und SVG-ViewBox.

**Abhaengigkeiten/Sequenz:** Nach CF-006.

## CF-008
**Ziel:** Input von DOM-Tile-Rects auf Canvas-Hit-Testing umstellen (`screenToTile`-basiert).

**Konkrete Dateien/Module:** `zu verifizieren` (Pointer/Mouse-Handler, Selection-Controller)

**Abnahmekriterium:** Click/Hover/Drag treffen korrekt inkl. edges/corners; DOM-rect-Abhaengigkeit entfernt.

**Risiko/Blocker:** Praezisionsfehler bei Grenzpixeln und hohen Zoomstufen.

**Abhaengigkeiten/Sequenz:** Nach CF-002 und CF-005.

## CF-009
**Ziel:** DOM-Grid abbauen; DOM nur noch fuer HUD/Panel behalten.

**Konkrete Dateien/Module:** `zu verifizieren` (Grid-Component, HUD/Panel-Container, CSS/Layout)

**Abnahmekriterium:** Kein visuelles Tile-Rendering mehr im DOM; HUD/Panel unveraendert funktionsfaehig.

**Risiko/Blocker:** Versteckte CSS-Abhaengigkeiten auf DOM-Grid fuer Layout/Events.

**Abhaengigkeiten/Sequenz:** Nach CF-008 (und CF-007 empfohlen).

## CF-010
**Ziel:** Debug-State und `render_game_to_text` fuer Canvas/Selection/Entities erweitern.

**Konkrete Dateien/Module:** `zu verifizieren` (Debug-State-Serializer, `render_game_to_text`, Dev-Overlay)

**Abnahmekriterium:** Debug-Ausgabe enthaelt Canvas-relevante Werte (viewport, tile hit, selection, entity layer) reproduzierbar.

**Risiko/Blocker:** Debug-Ausgabe driftet vom Runtime-State bei asynchronem Update-Takt.

**Abhaengigkeiten/Sequenz:** Nach CF-008, ideal nach CF-009.

## CF-011
**Ziel:** Test-Slice 1: Deckungsgleichheit + Resize/Zoom + SVG-Overlay validieren (manuell + automatisiert).

**Konkrete Dateien/Module:** `zu verifizieren` (E2E/Playwright o. ae., Visual-Regression-Tests)

**Abnahmekriterium:** Tests fuer Alignment, Overlay-Lage und Resize/Zoom sind gruen; keine kritischen Konsolenfehler.

**Risiko/Blocker:** Flaky visuelle Tests durch Timing/Antialiasing.

**Abhaengigkeiten/Sequenz:** Nach CF-007.

## CF-012
**Ziel:** Test-Slice 2: Canvas-Hit-Testing (edges/corners), HUD-Panels, Smoke/Automation stabilisieren.

**Konkrete Dateien/Module:** `zu verifizieren` (Interaction-Tests, Smoke-Suite, ggf. CI-Testjob)

**Abnahmekriterium:** Edge/Corner-Interaktionen, HUD-Interaktion und Smoke-Flow laufen stabil in Automation.

**Risiko/Blocker:** Testumgebung bildet reale DPI/Canvas-Scaling nur unvollstaendig ab.

**Abhaengigkeiten/Sequenz:** Nach CF-008 und CF-009.

## Empfohlene PR-Reihenfolge
`CF-001+CF-002 -> CF-003 -> CF-004 -> CF-005 -> CF-006 -> CF-007 -> CF-008 -> CF-009 -> CF-010 -> CF-011 -> CF-012`

---

# Legacy- und Wrapper-Entfernung (atomare Tasks)

| Task-ID | Ziel | Konkrete Dateien/Module | Abnahmekriterium | Risiko/Blocker |
|---|---|---|---|---|
| [CHECK] T01 | Vollstaendige Inventur aller Legacy-/Wrapper-/Fallback-Stellen erstellen (inkl. Referenzgraph). | `BaseUIController.js`, `MainMenuController.js`, `UIController.js`, runtime `preflight-mutation-guard` (Pfad zu verifizieren), `app/public/game.html`, world-render-Pfad (zu verifizieren), `legacy/UNVERFID` | Inventur-Dokument mit Fundstellen + Callern + "Delete/Migrate/Keep"-Status liegt vor; `rg`-basierte Referenzliste vorhanden. | Versteckte dynamische Imports/indirekte Events werden uebersehen. |
| [CHECK] T02 | Fuer jedes Feature genau einen kanonischen Primaerpfad festlegen (Target-API-Matrix). | API-/Interface-Definitionen (zu verifizieren), Event-Wrapper-Module (zu verifizieren) | Mapping "Feature -> kanonische API -> zu migrierende Caller" freigegeben; keine offenen Mehrdeutigkeiten. | Unklare Ownership/fehlende Spezifikation der Ziel-API. |
| [CHECK] T03 | Guardrail-Mechanik einfuehren: Wrapper mit Ablaufdatum/Removal-Flag markieren, keine Big-Bang-Loeschung. | Wrapper/Adapter-Module (zu verifizieren), ggf. zentrale Konfig/Feature-Flags (zu verifizieren) | Jeder verbleibende Wrapper hat Expiry-Date + Ticket-Referenz; CI schlaegt bei abgelaufenem Wrapper an (oder klarer Report). | CI-Integration fehlt; organisatorische Disziplin noetig. |
| T04 | Slice 1: Verbraucher von `BaseUIController` auf kanonische API migrieren (ein Feature-Cluster). | `BaseUIController.js` + konkrete Consumer-Module (zu verifizieren) | Fuer den gewaehlten Cluster keine Wrapper-Aufrufe mehr; Tests gruen (`check:required`, `npm test`, `test:playwright:fulltiles`). | Seiteneffekte in UI-Lifecycle/State-Sync. |
| T05 | Slice 2: Verbraucher von `MainMenuController` migrieren (ein Feature-Cluster). | `MainMenuController.js` + Consumer (zu verifizieren) | Menue-Interaktionen laufen ohne Fallback-Branch im migrierten Cluster; Browser-Interaktionstest gruen. | Regressionen in Navigation/Hotkeys. |
| T06 | Slice 3: Verbraucher von `UIController` migrieren (ein Feature-Cluster). | `UIController.js` + Consumer (zu verifizieren) | Ereignisfluss laeuft ueber kanonische Events/APIs; keine Legacy-Interface-Wrapper im Cluster. | Event-Reihenfolge aendert sich subtil. |
| T07 | Browser-Fallbacks im World-Render-Pfad auf produktiv noetige Minimum-Branches reduzieren. | World-Render-Module (zu verifizieren), ggf. Renderer/Bootstrap (zu verifizieren) | Pro Feature nur ein Primaerpfad aktiv; verbleibende Fallbacks sind dokumentiert und begruendet. | Alte Browser-/GPU-Kantenfaelle brechen. |
| T08 | `game.html`-Fallback-Bereinigung ohne Verhaltensverlust. | `app/public/game.html` | Entfernte Fallback-Zweige sind durch E2E/Interaktionstests abgesichert; keine toten Script-Pfade mehr. | Startreihenfolge/Script-Ladeabhaengigkeiten. |
| T09 | Event-/Interface-Wrapper entfernen, deren Caller vollstaendig migriert sind. | Wrapper-Module (zu verifizieren), betroffene Imports in Callern | `rg` findet keine produktiven Referenzen; Build + Tests gruen. | Versteckte Runtime-Registrierungen/Plugin-Hooks. |
| T10 | Legacy-Code + tote Acceptance-Paths entfernen; Navigation-Entries bereinigen. | Legacy-Ordner/Dateien (inkl. `legacy/UNVERFID` selektiv), Navigation-Konfig (zu verifizieren) | Keine unerreichbaren Acceptance-Pfade; Navigation zeigt nur aktive Features; keine Dead Links. | `UNVERFID` evtl. noch extern referenziert. |
| T11 | Obsolete JSON/Schema/Manifest-Artefakte bereinigen. | JSON/Schema/Manifest-Dateien (zu verifizieren) | Nur aktive Artefakte verbleiben; Schema-Validierung/Loader ohne Fehler. | Build-/Tooling erwartet alte Keys stillschweigend. |
| T12 | Adapter final loeschen (erst nach nachgewiesener Caller-Migration). | Adapter-Module (zu verifizieren) | Referenzgraph = 0 produktive Adapter-Caller; alle Pflichttests gruen. | Spaete Entdeckung eines Rand-Callers. |
| T13 | SoT-Dateien synchronisieren (`FUNCTION_SOT`, `REPO_HYGIENE_MAP`, Docs-Index, Release/Test-Baselines). | `FUNCTION_SOT` (Pfad zu verifizieren), `REPO_HYGIENE_MAP` (zu verifizieren), Docs-Index/Baselines (zu verifizieren) | SoT und Codezustand konsistent; Integrity-Checks final gruen. | Dokumentationsdrift bei parallelen PRs. |

## Sequenz und Abhaengigkeiten
1. `T01 -> T02 -> T03` (Pflicht vor Code-Loeschung).
2. Migrations-Slices: `T04`, `T05`, `T06` (nacheinander oder parallel, wenn Feature-disjunkt).
3. Runtime/Browser-Bereinigung: `T07 -> T08` (nach mind. einem erfolgreichen Controller-Slice).
4. Entfernen: `T09 -> T10 -> T11 -> T12` (hart abhaengig von nachgewiesener Caller-Migration).
5. Abschluss: `T13` zuletzt, nach finaler Integritaetspruefung.

## Validierung pro Slice (jede PR)
1. `check:required`
2. `npm test`
3. `test:playwright:fulltiles`
4. Browser-/Interaktions-Smoketest
5. Bei Abschlussrunde zusaetzlich SoT-/Integrity-Checks.
