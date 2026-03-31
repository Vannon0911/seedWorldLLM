import { ensureCanonicalWorldModel } from "./worldState.js";
const DEFAULT_CHUNK_SIZE = 16;
const DEFAULT_GENERATOR_ID = "worldgen.v2.minimalist";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toInt(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(input) {
  let h = 2166136261 >>> 0;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashInts(a, b, c = 0, d = 0) {
  let h = 0x9e3779b9;
  h ^= Math.imul((a | 0) ^ 0x85ebca6b, 0xc2b2ae35);
  h = (h << 13) | (h >>> 19);
  h ^= Math.imul((b | 0) ^ 0x27d4eb2f, 0x165667b1);
  h = (h << 11) | (h >>> 21);
  h ^= Math.imul((c | 0) ^ 0x7f4a7c15, 0x85ebca77);
  h = (h << 7) | (h >>> 25);
  h ^= Math.imul((d | 0) ^ 0x94d049bb, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashToUnit(value) {
  return (value >>> 0) / 4294967295;
}

function createTileBase({ x, y }) {
  return {
    x,
    y,
    type: "empty",
    outputText: "",
    isActive: false,
    isEmpty: true,
    resource: "none"
  };
}

function createTerrainStamps() {
  return Object.freeze([
    {
      id: "ore-pocket-a",
      width: 3,
      height: 2,
      cells: [
        { x: 0, y: 0, resource: "ore" },
        { x: 1, y: 0, resource: "ore" },
        { x: 2, y: 0, resource: "none" },
        { x: 0, y: 1, resource: "none" },
        { x: 1, y: 1, resource: "ore" },
        { x: 2, y: 1, resource: "none" }
      ]
    },
    {
      id: "coal-pocket-b",
      width: 2,
      height: 3,
      cells: [
        { x: 0, y: 0, resource: "coal" },
        { x: 1, y: 0, resource: "none" },
        { x: 0, y: 1, resource: "coal" },
        { x: 1, y: 1, resource: "coal" },
        { x: 0, y: 2, resource: "none" },
        { x: 1, y: 2, resource: "coal" }
      ]
    }
  ]);
}

function applyDeterministicStamps(seedInt, width, height, tiles) {
  const tileMap = new Map(tiles.map((tile) => [`${tile.x}:${tile.y}`, tile]));
  const stamps = createTerrainStamps();
  const placements = [];

  const targetCount = Math.max(2, Math.round((width * height) / 110));
  let guard = 0;
  while (placements.length < targetCount && guard < targetCount * 20) {
    const pick = hashInts(seedInt, guard, 91, 17);
    const stamp = stamps[pick % stamps.length];
    const anchorX = hashInts(seedInt, guard, 92, 19) % Math.max(1, width - stamp.width + 1);
    const anchorY = hashInts(seedInt, guard, 93, 23) % Math.max(1, height - stamp.height + 1);
    guard += 1;

    const key = `${anchorX}:${anchorY}:${stamp.id}`;
    if (placements.some((x) => x.key === key)) {
      continue;
    }
    
    // Eligibility check is now just bounds-check (since no water/obstacles exist)
    if (anchorX + stamp.width > width || anchorY + stamp.height > height) {
      continue;
    }

    // Apply stamp
    for (const cell of stamp.cells) {
      const t = tileMap.get(`${anchorX + cell.x}:${anchorY + cell.y}`);
      if (t) {
        t.resource = cell.resource;
        if (cell.resource !== "none") {
          t.type = "mine"; // Auto-convert resource tiles to mine for voxel viz
        }
      }
    }

    placements.push({
      key,
      stampId: stamp.id,
      anchorX,
      anchorY
    });
  }

  return placements.map((x) => ({
    stampId: x.stampId,
    anchorX: x.anchorX,
    anchorY: x.anchorY
  }));
}

export function generateWorld(options = {}) {
  const seed = typeof options.seed === "string" && options.seed.trim() ? options.seed.trim() : "seedworld-default";
  const width = clamp(toInt(options.width, 16), 4, 256);
  const height = clamp(toInt(options.height, 12), 4, 256);
  const chunkSize = clamp(toInt(options.chunkSize, DEFAULT_CHUNK_SIZE), 4, 64);
  const seedInt = hashString(seed);

  const tiles = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push(createTileBase({ x, y }));
    }
  }

  const stampPlacements = applyDeterministicStamps(seedInt, width, height, tiles);
  const rawWorld = {
    seed,
    size: { width, height },
    tiles,
    meta: {
      version: 2,
      generatorId: DEFAULT_GENERATOR_ID,
      chunkSize,
      stampPlacements
    }
  };
  return ensureCanonicalWorldModel(rawWorld);
}

export function buildWorldFromState(state = {}, fallbackSeed = "seedworld-default") {
  const world = isPlainObject(state.world) ? state.world : {};
  const size = isPlainObject(world.size) ? world.size : {};
  return generateWorld({
    seed: typeof world.seed === "string" ? world.seed : fallbackSeed,
    width: toInt(size.width, 16),
    height: toInt(size.height, 12),
    chunkSize: toInt(world.meta?.chunkSize, DEFAULT_CHUNK_SIZE)
  });
}

export function validateWorldShape(world) {
  assert(isPlainObject(world), "[WORLD_GEN] world muss Objekt sein.");
  assert(typeof world.seed === "string" && world.seed.trim(), "[WORLD_GEN] world.seed fehlt.");
  assert(isPlainObject(world.size), "[WORLD_GEN] world.size fehlt.");
  assert(Number.isInteger(world.size.width) && world.size.width > 0, "[WORLD_GEN] world.size.width ungueltig.");
  assert(Number.isInteger(world.size.height) && world.size.height > 0, "[WORLD_GEN] world.size.height ungueltig.");
  assert(Array.isArray(world.tiles), "[WORLD_GEN] world.tiles muss Array sein.");
  assert(isPlainObject(world.meta), "[WORLD_GEN] world.meta fehlt.");
  assert(isPlainObject(world.volume), "[WORLD_GEN] world.volume fehlt.");
  assert(Array.isArray(world.blocks), "[WORLD_GEN] world.blocks muss Array sein.");
  assert(Array.isArray(world.chunks), "[WORLD_GEN] world.chunks muss Array sein.");
}
