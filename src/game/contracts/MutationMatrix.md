# Mutation Matrix

## Zweck
Diese Matrix beschreibt, welche State-Pfade der `GameLogicController` fuer die Domain `game` patchen darf.

## Kanonische Whitelist

| Domain | Erlaubte Pfade |
|---|---|
| `game` | `resources.ore`, `resources.copper`, `resources.iron`, `resources.gears`, `machines.miners`, `machines.conveyors`, `machines.assemblers`, `logistics.storageA`, `logistics.storageB`, `meta.lastAction`, `meta.revision` |

## Patch-Regeln
- Ein Patch darf nur die Domain `game` tragen.
- Ein Patch-Pfad muss mit einem der oben gelisteten Pfade beginnen oder exakt darauf zeigen.
- Ungueltige Pfade wie `__proto__`, `prototype`, `constructor` und `eval` sind verboten.
- Root-Container-Replacements sind nicht vorgesehen.

## Controller-Verhalten
- Die Mutation-Matrix ist die technische Grenze fuer alle Game-Patches.
- Der Kernel darf nur schreiben, wenn ein Patch innerhalb dieser Whitelist liegt.
- Der Game-Logic-Controller darf keine Pfade ausserhalb dieser Matrix vorschlagen.

## Ziel-Datei
- `src/game/GameLogicController.js`
