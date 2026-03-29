import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "10-reduce-game-state";

/**
 * Tests for reduceGameState (exported) and GameLogicController.applyActionLocally,
 * covering patch application, immutability, error handling, and set_tile_type behavior.
 *
 * @param {Object} ctx - Test context.
 * @param {Object} ctx.assert - Assertion utilities from the test harness.
 * @param {string} ctx.root - Filesystem root of the project.
 */
export async function test({ assert, root }) {
  const gameLogicModule = await import(
    pathToFileURL(path.join(root, "app/src/game/GameLogicController.js")).href
  );

  const { reduceGameState, GameLogicController } = gameLogicModule;

  // --- reduceGameState: empty patches returns deep clone ---
  const base = { resources: { ore: 50 }, level: 1 };
  const result0 = reduceGameState(base, []);
  assert.deepEqual(result0, base, "empty patches must produce a deep clone equal to input");
  assert.notEqual(result0, base, "empty patches must return a new object, not the same reference");

  // --- reduceGameState: single set patch on top-level key ---
  const patches1 = [{ op: "set", domain: "game", path: "level", value: 7 }];
  const result1 = reduceGameState(base, patches1);
  assert.equal(result1.level, 7, "set patch must update the target key");
  assert.equal(base.level, 1, "input state must not be mutated by reduceGameState");

  // --- reduceGameState: nested path creates intermediate objects ---
  const patches2 = [{ op: "set", domain: "game", path: "meta.revision", value: 42 }];
  const result2 = reduceGameState({}, patches2);
  assert.equal(result2.meta.revision, 42, "nested set patch must create intermediate object and assign value");

  // --- reduceGameState: multiple patches applied in order ---
  const patches3 = [
    { op: "set", domain: "game", path: "resources.ore", value: 100 },
    { op: "set", domain: "game", path: "resources.ore", value: 200 }
  ];
  const result3 = reduceGameState(base, patches3);
  assert.equal(result3.resources.ore, 200, "later patches must overwrite earlier ones");

  // --- reduceGameState: non-set operation throws ---
  assert.throws(
    () => reduceGameState({}, [{ op: "delete", path: "resources.ore", value: null }]),
    /Unsupported patch operation/,
    "non-set operation must throw"
  );

  // --- reduceGameState: non-plain-object state is treated as empty ---
  const resultNull = reduceGameState(null, [{ op: "set", domain: "game", path: "x", value: 1 }]);
  assert.equal(resultNull.x, 1, "null state must be treated as empty object");

  // --- applyActionLocally: returns previewState reflecting patches ---
  const logic = new GameLogicController({
    plan: async () => ({}),
    apply: async () => ({})
  });

  const worldState = logic.applyActionLocally(
    { type: "generate_world", payload: { seed: "reduce-test", width: 4, height: 4 } },
    {}
  ).previewState;

  assert.ok(worldState.world, "generate_world must produce world in previewState");
  assert.equal(worldState.world.size.width, 4, "world width must match payload");
  assert.equal(worldState.world.size.height, 4, "world height must match payload");
  assert.equal(worldState.world.tiles.length, 16, "4x4 world must have 16 tiles");

  // --- applyActionLocally: set_tile_type sets all tile fields correctly ---
  const setResult = logic.applyActionLocally(
    { type: "set_tile_type", payload: { x: 1, y: 1, tileType: "storage" } },
    worldState
  );
  const storageTile = setResult.previewState.world.tiles.find((t) => t.x === 1 && t.y === 1);
  assert.equal(storageTile?.type, "storage", "set_tile_type storage must set type to storage");
  assert.equal(storageTile?.outputText, "Lager", "set_tile_type storage must set German output label");
  assert.equal(storageTile?.isActive, true, "set_tile_type storage must mark tile as active");
  assert.equal(storageTile?.isEmpty, false, "set_tile_type storage must not mark tile as empty");

  // --- applyActionLocally: set_tile_type "factory" ---
  const factoryResult = logic.applyActionLocally(
    { type: "set_tile_type", payload: { x: 0, y: 0, tileType: "factory" } },
    worldState
  );
  const factoryTile = factoryResult.previewState.world.tiles.find((t) => t.x === 0 && t.y === 0);
  assert.equal(factoryTile?.type, "factory", "set_tile_type factory must set type to factory");
  assert.equal(factoryTile?.outputText, "Fabrik", "set_tile_type factory must set German output label");

  // --- applyActionLocally: set_tile_type "connector" ---
  const connectorResult = logic.applyActionLocally(
    { type: "set_tile_type", payload: { x: 2, y: 2, tileType: "connector" } },
    worldState
  );
  const connectorTile = connectorResult.previewState.world.tiles.find((t) => t.x === 2 && t.y === 2);
  assert.equal(connectorTile?.type, "connector", "set_tile_type connector must set type");
  assert.equal(connectorTile?.outputText, "Verbindung", "set_tile_type connector must set label");

  // --- applyActionLocally: set_tile_type "empty" sets inactive/empty ---
  const filledState = setResult.previewState;
  const clearResult = logic.applyActionLocally(
    { type: "set_tile_type", payload: { x: 1, y: 1, tileType: "empty" } },
    filledState
  );
  const clearedTile = clearResult.previewState.world.tiles.find((t) => t.x === 1 && t.y === 1);
  assert.equal(clearedTile?.type, "empty", "clearing tile must set type to empty");
  assert.equal(clearedTile?.isActive, false, "empty tile must not be active");
  assert.equal(clearedTile?.isEmpty, true, "empty tile must have isEmpty=true");
  assert.equal(clearedTile?.outputText, "", "empty tile must have empty output text");

  // --- applyActionLocally: unknown tile type throws ---
  assert.throws(
    () => logic.applyActionLocally(
      { type: "set_tile_type", payload: { x: 0, y: 0, tileType: "lava" } },
      worldState
    ),
    /Unbekannter Tile-Typ/,
    "unknown tile type must throw"
  );

  // --- applyActionLocally: out-of-bounds coordinate throws ---
  assert.throws(
    () => logic.applyActionLocally(
      { type: "set_tile_type", payload: { x: 99, y: 99, tileType: "mine" } },
      worldState
    ),
    /Tile ausserhalb der Welt/,
    "out-of-bounds coordinates must throw"
  );

  // --- applyActionLocally: non-integer x throws ---
  assert.throws(
    () => logic.applyActionLocally(
      { type: "set_tile_type", payload: { x: 1.5, y: 0, tileType: "mine" } },
      worldState
    ),
    /muss eine ganze Zahl sein/,
    "non-integer x must throw coerceInteger error"
  );

  // --- applyActionLocally: input state not mutated ---
  const stateCopy = JSON.parse(JSON.stringify(worldState));
  logic.applyActionLocally(
    { type: "set_tile_type", payload: { x: 0, y: 0, tileType: "mine" } },
    worldState
  );
  assert.deepEqual(
    worldState.world.tiles.find((t) => t.x === 0 && t.y === 0)?.type,
    stateCopy.world.tiles.find((t) => t.x === 0 && t.y === 0)?.type,
    "applyActionLocally must not mutate the input state"
  );
}

export const run = test;