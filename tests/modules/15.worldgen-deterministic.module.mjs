import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "15-worldgen-deterministic-and-shape";

export async function test({ assert, root }) {
  const worldGen = await import(pathToFileURL(path.join(root, "src/game/worldGen.js")));
  const gameLogicModule = await import(pathToFileURL(path.join(root, "src/game/GameLogicController.js")));

  const a = worldGen.generateWorld({ seed: "alpha", width: 16, height: 12 });
  const b = worldGen.generateWorld({ seed: "alpha", width: 16, height: 12 });
  const c = worldGen.generateWorld({ seed: "beta", width: 16, height: 12 });

  assert(JSON.stringify(a) === JSON.stringify(b), "Gleicher Seed muss identische Welt erzeugen.");
  assert(JSON.stringify(a) !== JSON.stringify(c), "Unterschiedliche Seeds muessen andere Welten erzeugen.");

  worldGen.validateWorldShape(a);
  assert(Array.isArray(a.tiles) && a.tiles.length === 16 * 12, "Tile-Anzahl ungueltig.");

  const hasEdgeWater = a.tiles.some(
    (tile) => tile.biome === "water" && (tile.x === 0 || tile.y === 0 || tile.x === 15 || tile.y === 11)
  );
  assert(hasEdgeWater, "Wasser-Biom muss am Kartenrand vorkommen.");

  const logic = new gameLogicModule.GameLogicController({
    plan: async () => ({}),
    apply: async () => ({})
  });
  const result = logic.calculateAction(
    {
      type: "generate_world",
      payload: {
        seed: "alpha",
        width: 16,
        height: 12
      }
    },
    {}
  );

  const paths = result.patches.map((patch) => patch.path);
  assert(paths.includes("world.seed"), "generate_world muss world.seed patchen.");
  assert(paths.includes("world.size"), "generate_world muss world.size patchen.");
  assert(paths.includes("world.meta"), "generate_world muss world.meta patchen.");
  assert(paths.includes("world.tiles"), "generate_world muss world.tiles patchen.");
}

export const run = test;
