# Action Schema

## Zweck
Dieses Schema beschreibt die Aktionen, die der `GameLogicController` in SeedWorld verarbeiten darf.

## Kanonische Aktionen

| Action | Pflichtfelder | Bedeutung |
|---|---|---|
| `produce` | `resource`, `amount` | Erhoeht eine Resource deterministisch. |
| `consume` | `resource`, `amount` | Senkt eine Resource deterministisch. |
| `transport` | `from`, `to`, `amount` | Verschiebt Menge zwischen zwei Lager-Slots. |
| `build` | `machine`, `count` | Erhoeht eine Maschinenanzahl und bucht Kosten ab. |
| `inspect` | keine | Reine Analyse, keine State-Aenderung. |
| `generate_world` | `seed` | Generiert deterministische World-Daten (seed/size/meta/tiles). |
| `regenerate_world` | `seed` | Regeneriert die World-Daten mit neuem/gleichbleibendem Seed. |

## Payload-Regeln
- `action` ist immer ein Plain-Object.
- `action.type` ist ein nicht-leerer String.
- `action.payload` ist immer ein Plain-Object.
- Keine Getter, Setter, `__proto__`, `prototype`, `constructor` oder `eval`.

## Controller-Verhalten
- Der Game-Logic-Controller erzeugt nur Patch-Wuensche.
- Direkte State-Writes sind ausgeschlossen.
- Der Kernel entscheidet, ob die vorgeschlagenen Patches geschrieben werden.

## Ziel-Datei
- `src/game/GameLogicController.js`
