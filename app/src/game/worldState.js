const DEFAULT_BLOCK_SPAN_TILES = 8;
const DEFAULT_CHUNK_SPAN_BLOCKS = 16;
const CANONICAL_MODEL_VERSION = "volume-blocks-chunks.v1";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toPositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function cloneObject(value) {
  return isPlainObject(value) ? { ...value } : {};
}

function deriveChunkGrid(size, chunkSpanBlocks) {
  const width = toPositiveInt(size?.width, 1);
  const height = toPositiveInt(size?.height, 1);
  return {
    width: Math.max(1, Math.ceil(width / chunkSpanBlocks)),
    height: Math.max(1, Math.ceil(height / chunkSpanBlocks)),
    depth: 1
  };
}

export function ensureCanonicalWorldModel(world = {}) {
  const normalizedWorld = cloneObject(world);
  const size = cloneObject(normalizedWorld.size);
  size.width = toPositiveInt(size.width, 16);
  size.height = toPositiveInt(size.height, 12);

  const meta = cloneObject(normalizedWorld.meta);
  const blockSpanTiles = toPositiveInt(meta.blockSpanTiles, DEFAULT_BLOCK_SPAN_TILES);
  const chunkSpanBlocks = toPositiveInt(meta.chunkSpanBlocks ?? meta.chunkSize, DEFAULT_CHUNK_SPAN_BLOCKS);
  const chunkGrid = deriveChunkGrid(size, chunkSpanBlocks);

  normalizedWorld.size = size;
  normalizedWorld.meta = {
    ...meta,
    canonicalWorldModel: CANONICAL_MODEL_VERSION,
    blockSpanTiles,
    chunkSpanBlocks,
    tilesRole: "legacy_debug_projection"
  };
  normalizedWorld.volume = isPlainObject(normalizedWorld.volume)
    ? normalizedWorld.volume
    : {
        schema: "world-volume.v1",
        width: size.width,
        height: size.height,
        depth: 1,
        blockSpanTiles,
        chunkSpanBlocks
      };
  normalizedWorld.blocks = Array.isArray(normalizedWorld.blocks) ? normalizedWorld.blocks : [];
  normalizedWorld.chunks = Array.isArray(normalizedWorld.chunks)
    ? normalizedWorld.chunks
    : [
        {
          id: "chunk:0:0:0",
          origin: { x: 0, y: 0, z: 0 },
          size: chunkGrid
        }
      ];
  normalizedWorld.tiles = Array.isArray(normalizedWorld.tiles) ? normalizedWorld.tiles : [];
  return normalizedWorld;
}

