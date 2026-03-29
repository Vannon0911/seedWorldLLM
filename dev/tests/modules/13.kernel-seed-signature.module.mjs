import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "13-kernel-seed-signature";

/**
 * Compute the expected FNV-1a-based seed signature the same way KernelController does.
 * This is intentionally a local reimplementation to verify the output, not shared code.
 *
 * @param {string} seed - The seed string to hash.
 * @returns {string} 8-character lowercase hexadecimal signature.
 */
function expectedSeedSignature(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Tests that KernelController.#createInitialState correctly computes and stores
 * a deterministic seedSignature in statistics, based on the deriveSeedSignature
 * function added in this PR.
 *
 * @param {Object} ctx - Test context.
 * @param {Object} ctx.assert - Assertion utilities from the test harness.
 * @param {string} ctx.root - Filesystem root of the project.
 */
export async function test({ assert, root }) {
  const kernelModule = await import(
    pathToFileURL(path.join(root, "app/src/kernel/KernelController.js")).href
  );

  const { KernelController } = kernelModule;

  const seedA = "test-kernel-seed-alpha";
  const seedB = "test-kernel-seed-beta";

  // --- seedSignature appears in createInitialState result ---
  const kernelA = new KernelController({ seed: seedA });
  const initA = await kernelA.execute({ domain: "game", action: { type: "createInitialState" } });
  assert.ok(
    initA.result.statistics,
    "createInitialState result must include statistics"
  );
  assert.ok(
    typeof initA.result.statistics.seedSignature === "string",
    "statistics.seedSignature must be a string"
  );

  // --- signature is exactly 8 hex characters ---
  const sigA = initA.result.statistics.seedSignature;
  assert.match(sigA, /^[0-9a-f]{8}$/, "seedSignature must be exactly 8 lowercase hex characters");

  // --- signature matches expected FNV-1a computation ---
  const expectedA = expectedSeedSignature(seedA);
  assert.equal(sigA, expectedA, "seedSignature must match the FNV-1a hash of the seed");

  // --- different seed produces different signature ---
  const kernelB = new KernelController({ seed: seedB });
  const initB = await kernelB.execute({ domain: "game", action: { type: "createInitialState" } });
  const sigB = initB.result.statistics.seedSignature;
  assert.notEqual(sigA, sigB, "different seeds must produce different seedSignatures");

  // --- same seed always produces same signature (determinism) ---
  const kernelA2 = new KernelController({ seed: seedA });
  const initA2 = await kernelA2.execute({ domain: "game", action: { type: "createInitialState" } });
  assert.equal(
    initA2.result.statistics.seedSignature,
    sigA,
    "same seed must always produce the same seedSignature (determinism)"
  );

  // --- default seed ("default-seed") produces deterministic signature ---
  const kernelDefault = new KernelController({});
  const initDefault = await kernelDefault.execute({ domain: "game", action: { type: "createInitialState" } });
  const expectedDefault = expectedSeedSignature("default-seed");
  assert.equal(
    initDefault.result.statistics.seedSignature,
    expectedDefault,
    "default seed must produce the expected deterministic signature"
  );

  // --- signature for empty string seed is valid hex ---
  const kernelEmpty = new KernelController({ seed: "" });
  const initEmpty = await kernelEmpty.execute({ domain: "game", action: { type: "createInitialState" } });
  // seed defaults to "default-seed" when empty (from constructor logic)
  assert.ok(
    typeof initEmpty.result.statistics.seedSignature === "string" &&
    initEmpty.result.statistics.seedSignature.length === 8,
    "even with empty seed option, seedSignature must be a valid 8-char string"
  );

  // --- well-known short seed: single character ---
  const kernelSingle = new KernelController({ seed: "a" });
  const initSingle = await kernelSingle.execute({ domain: "game", action: { type: "createInitialState" } });
  const expectedSingle = expectedSeedSignature("a");
  assert.equal(
    initSingle.result.statistics.seedSignature,
    expectedSingle,
    "single-character seed must produce correct signature"
  );
}

export const run = test;