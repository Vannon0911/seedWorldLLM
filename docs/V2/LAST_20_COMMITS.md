# Last 20 Commits

Diese Seite erklaert die letzten 20 Commits von SeedWorld 0.3.1a in einer Form, die fuer Maintainer und Leser schnell erfassbar bleibt.

## Leitmotive

- deterministischer Kern statt Betriebsballast
- reproduzierbare Evidence statt kosmetischer Gruen-Signale
- radikal verkleinerter Browser-/UI-Pfad
- Documentation V2 als fuehrende Doku-, Plan- und Archivschicht
- Projekthygiene als erzwungenes System statt als Wunsch

## Commit-Linie

### Dokumentation, Hygiene und Verifikation

- `8b19cc9` Harden Documentation V2 with probes and string matrix  
  Fuehrt adversarial probe und String-Matrix ein. Das System prueft jetzt aktiv, ob rohe Plan-Dateien und unklassifizierte Artefakte wirklich blockiert werden.

- `92a19c8` Enforce full Documentation V2 coverage  
  Fuehrt einen Vollrepo-Scanner fuer Doku-/Plan-/Legacy-Bereiche ein und verlangt vollstaendige Klassifikation.

- `5adc9d8` Migrate project documentation to Documentation V2  
  Macht `docs/V2/` zur fuehrenden menschenlesbaren Projektflaeche.

- `a770aeb` Enforce Documentation V2 task and registry guards  
  Blockiert rohe Planung ausserhalb atomarer JSON-Tasks und stoppt unregistrierte neue Dateien.

- `206e81c` Tighten project documentation to current core  
  Zieht die fuehrende Doku auf den reduzierten Kernzustand.

- `12060d2` Sync SoT and active cleanup docs  
  Synchronisiert Function-SoT, Hygiene-Map und aktive Cleanup-Doku.

### Aktiver Pfad verkleinert

- `7703996` Remove unused kernel interface bridge  
  Entfernt eine tote Kernel-Bruecke.

- `7d48dec` Reduce UI controller to active game path  
  Macht den UI-Pfad deutlich kleiner und konzentriert ihn auf die aktive Spielansicht.

- `9788bb7` Remove radial build plugin path  
  Entfernt einen global gekoppelten Pluginpfad und reduziert Nebenlogik.

- `3a36c5a` Cut browser launcher and menu residue  
  Entfernt Menue- und Launcher-Reste.

- `121ecee` Cut dead wrapper and legacy UI stack  
  Loescht tote Wrapper- und Legacy-UI-Controller.

### Reproduktionsbeweis und Testlinie

- `a7d810e` Resolve remaining merge markers and refresh testline baseline  
  Raeumt Restmarker weg und stabilisiert die Testline-Basis.

- `eb3f64e` Minimize git hooks to reproduction checks (#18)  
  Merge der Hook-Reduktion auf die reproduzierbare Pflichtlinie.

- `9797985` Minimize git hooks to reproduction checks  
  Hooks fuehren nur noch die neue Kern-Qualitaetslinie aus.

- `8947967` Prove reproduction with double-run evidence gates  
  Fuehrt den harten Doppel-Lauf-Evidence-Pfad ein.

- `8ec631c` Reduce repo to deterministic kernel core  
  Schlaegt den großen Scope-Schnitt: nur noch Kernel, Reproduktion, Spielinhalte.

### Historischer Vorlauf der jetzigen Linie

- `8d41427` Codex lokal (#16)
- `9ff6443` Harden preflight guard and add workflow timeout (#15)
- `234cb67` Sync SoT/docs from code and add legacy audit
- `4c102cc` Stabilize testline, align canvas-first SoT, and modularize game logic

Diese vier Commits sind heute nicht mehr der Fuehrungskern, aber sie markieren die Anlaufphase vor der harten Reduktion.

## Technische Kernkomponenten

- Kernel: `app/src/kernel/`
- Gameplay/Content: `app/src/game/`
- Evidence/Testline: `dev/scripts/` und `dev/tools/runtime/verify-testline-integrity.mjs`
- Documentation V2: `docs/V2/`, `tem/tasks/`, `app/src/sot/docs-v2.json`
- Hygiene/Strings/Probe: `verify-docs-v2-guards.mjs`, `verify-docs-v2-coverage.mjs`, `probe-docs-v2-adversarial.mjs`, `sync-string-matrix.mjs`
