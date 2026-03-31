# Release 0.3.1a

Release 0.3.1a schliesst die Reduktion von SeedWorld auf den deterministischen Kern nicht nur technisch, sondern auch dokumentarisch und hygienisch ab.

## Release-Fokus

- deterministischer Kernel
- reproduzierbare Doppel-Lauf-Evidence
- autoritative Spielinhalte
- Documentation V2 als fuehrende Doku-, Plan- und Archivschicht
- mechanisch erzwungene Projekthygiene

## Was neu ist

- Documentation V2 fuehrt jetzt Wahrheit, Plan und Archiv zusammen.
- Open Tasks leben nur noch als atomare JSON-Tasks.
- Ein Guard blockiert rohe Plan-Dateien und unregistrierte Aenderungen.
- Ein Vollrepo-Scanner prueft, dass alle Doku-/Plan-/Legacy-Dateien klassifiziert sind.
- Eine String-Matrix haelt aktive Spiel- und Doku-Strings synchron.
- Ein adversarial probe versucht das System gezielt zu brechen und verlangt, dass die Blocker wirklich greifen.

## Warum dieses Release wichtig ist

Vorher konnte das Projekt technisch reduziert sein, aber dokumentarisch und organisatorisch weiter auseinanderlaufen. Mit 0.3.1a ist der Dokumentations- und Hygiene-Raum selbst Teil des verifizierten Systems geworden.

## Pflichtlinie

```bash
npm run check:required
```

Diese Linie umfasst jetzt:

- Doppel-Lauf-Tests
- Evidence-Verification
- Testline-Integrity
- String-Matrix-Verification
- Documentation-V2-Verification
- Vollrepo-Coverage
- Adversarial Probe

## Kernreferenzen

- [HOME](./HOME.md)
- [TRUTH](./TRUTH.md)
- [SYSTEM_PLAN](./SYSTEM_PLAN.md)
- [RULES](./RULES.md)
- [PLAN](./PLAN.md)
- [ARCHIVE](./ARCHIVE.md)
- [ARCHITECTURE_MAP](./ARCHITECTURE_MAP.md)
- [LAST_20_COMMITS](./LAST_20_COMMITS.md)
