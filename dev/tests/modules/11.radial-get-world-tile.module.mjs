import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "11-radial-get-world-tile";

/**
 * Tests for getWorldTile exported from radialBuildController.js.
 * Covers null/invalid world, non-finite coordinates, index-based lookup,
 * linear scan fallback, and string coordinate coercion.
 *
 * @param {Object} ctx - Test context.
 * @param {Object} ctx.assert - Assertion utilities from the test harness.
 * @param {string} ctx.root - Filesystem root of the project.
 */
export async function test({ assert, root }) {
  const radialModule = await import(
    pathToFileURL(path.join(root, "app/src/plugins/radialBuildController.js")).href
  );

  const { getWorldTile } = radialModule;

  // --- null/missing world ---
  assert.equal(getWorldTile(null, 0, 0), null, "null world must return null");
  assert.equal(getWorldTile(undefined, 0, 0), null, "undefined world must return null");
  assert.equal(getWorldTile("string", 0, 0), null, "non-object world must return null");

  // --- world without tiles array ---
  assert.equal(getWorldTile({}, 0, 0), null, "world with no tiles property must return null");
  assert.equal(getWorldTile({ tiles: null }, 0, 0), null, "world with null tiles must return null");
  assert.equal(getWorldTile({ tiles: "not-array" }, 0, 0), null, "world with non-array tiles must return null");

  // --- non-finite coordinates ---
  const world = { tiles: [{ x: 0, y: 0, type: "mine" }] };
  assert.equal(getWorldTile(world, NaN, 0), null, "NaN x must return null");
  assert.equal(getWorldTile(world, 0, NaN), null, "NaN y must return null");
  assert.equal(getWorldTile(world, "abc", 0), null, "non-numeric x string must return null");
  assert.equal(getWorldTile(world, Infinity, 0), null, "Infinity x must return null");

  // --- linear scan: tile found ---
  const worldNoWidth = {
    tiles: [
      { x: 0, y: 0, type: "empty" },
      { x: 1, y: 0, type: "mine" },
      { x: 0, y: 1, type: "storage" }
    ]
  };
  const found = getWorldTile(worldNoWidth, 1, 0);
  assert.equal(found?.type, "mine", "linear scan must find tile at (1,0)");

  // --- linear scan: tile not found ---
  assert.equal(getWorldTile(worldNoWidth, 5, 5), null, "missing tile must return null");

  // --- string coordinates coerced to numbers ---
  const foundString = getWorldTile(worldNoWidth, "0", "1");
  assert.equal(foundString?.type, "storage", "string coordinates must be coerced to numbers");

  // --- index-based lookup with size.width ---
  const worldWithSize = {
    size: { width: 3 },
    tiles: [
      { x: 0, y: 0, type: "empty" },
      { x: 1, y: 0, type: "mine" },
      { x: 2, y: 0, type: "factory" },
      { x: 0, y: 1, type: "storage" },
      { x: 1, y: 1, type: "connector" },
      { x: 2, y: 1, type: "empty" }
    ]
  };
  const indexed = getWorldTile(worldWithSize, 1, 1);
  assert.equal(indexed?.type, "connector", "index-based lookup must find tile at (1,1)");

  const indexedFirst = getWorldTile(worldWithSize, 0, 0);
  assert.equal(indexedFirst?.type, "empty", "index-based lookup must find tile at (0,0)");

  const indexedLast = getWorldTile(worldWithSize, 2, 1);
  assert.equal(indexedLast?.type, "empty", "index-based lookup must find tile at (2,1)");

  // --- index-based lookup: tile at computed index has wrong coordinates (falls back to find) ---
  const worldMisaligned = {
    size: { width: 3 },
    tiles: [
      { x: 5, y: 5, type: "mine" }, // index 0 but coordinates don't match (0,0)
      { x: 1, y: 0, type: "storage" }
    ]
  };
  const fallback = getWorldTile(worldMisaligned, 1, 0);
  assert.equal(fallback?.type, "storage", "when index-based lookup fails, linear find fallback must work");

  // --- tile with x/y as strings (coercion by Number) ---
  const worldStringCoords = {
    tiles: [{ x: "2", y: "3", type: "factory" }]
  };
  const foundCoerced = getWorldTile(worldStringCoords, 2, 3);
  assert.equal(foundCoerced?.type, "factory", "tiles with string x/y must be found via Number coercion");

  // --- empty tiles array ---
  assert.equal(getWorldTile({ tiles: [] }, 0, 0), null, "empty tiles array must return null");

  // --- boundary: negative coordinates ---
  assert.equal(getWorldTile(worldNoWidth, -1, 0), null, "negative x must return null if no matching tile");
}

export const run = test;