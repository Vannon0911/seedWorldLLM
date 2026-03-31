# Documentation 2.0

Documentation 2.0 verbindet drei Dinge in einem System: menschenlesbare Wahrheit, maschinenlesbare Planung und ein Archiv der abgeschlossenen Slices. Fuehrend sind weiter Kernel-Wahrheit, Reproduktionsbeweis und autoritative Inhalte. Documentation 2.0 ersetzt konzeptionell das alte `doc sync`-Denken: Wahrheit wird nicht mehr ueber einen separaten Sync-Schritt behauptet, sondern ueber registrierte Dateien, atomare Tasks, Scanner, Coverage und Archivierung erzwungen.

## Einstieg

- Wahrheit lesen: [TRUTH](./TRUTH.md)
- Offene Aufgaben lesen: [PLAN](./PLAN.md)
- Abgeschlossene Aufgaben lesen: [ARCHIVE](./ARCHIVE.md)
- Maschinenbasis: [app/src/sot/docs-v2.json](../../app/src/sot/docs-v2.json)

## Status

- Offene Tasks: 27
- Archivierte Tasks: 30
- Task-Schema: `2.0.0`
- SoT-Review: `2026-03-31`
- Harte Guards: rohe Plan-Dateien blocken, unregistrierte neue Dateien blocken
- Vollrepo-Coverage: alle Dateien unter den Doku-/Plan-Roots muessen klassifiziert sein
- String-Matrix: aktive Spiel- und Doku-Strings muessen synchronisiert sein
- Adversarial Probe: Guard und Coverage muessen absichtliche Regelverletzungen aktiv blockieren
