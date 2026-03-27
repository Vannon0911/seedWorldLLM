import { createMutFingerprint } from "./fingerprint.js";
import { withDeterminismGuards } from "./runtimeGuards.js";
import { assertSeedMatch } from "./seedGuard.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[KERNEL_DETERMINISM] ${message}`);
  }
}

function assertPlainObject(value, message) {
  assert(value && typeof value === "object" && !Array.isArray(value), message);

  const proto = Object.getPrototypeOf(value);
  assert(proto === Object.prototype || proto === null, message);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }

  return value;
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return function seedFn() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seedInt) {
  return function random() {
    let t = (seedInt += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function runDeterministicKernel(seed, ticks = 8, options = {}) {
  // @doc-anchor KERNEL-DETERMINISM
  // @doc-anchor KERNEL-GUARDS
  // @doc-anchor SEED-GUARD
  return withDeterminismGuards(async () => {
    assert(typeof seed === "string" && seed.trim().length > 0, "seed muss eine nicht-leere Zeichenkette sein");
    assert(Number.isInteger(ticks) && ticks > 0 && ticks <= 256, "ticks ausserhalb 1..256");
    assertPlainObject(options, "options fehlen oder sind kein Plain-Object");

    const seedHash = await assertSeedMatch(seed, options.expectedSeedHash);
    const seedFactory = xmur3(`${seed}:${seedHash}`);
    const random = mulberry32(seedFactory());

    let resources = 100;
    let stability = 50;
    const states = [];

    // @mut-point MUT-KERNEL-LOOP
    for (let tick = 1; tick <= ticks; tick += 1) {
      const drift = Math.floor(random() * 7) - 3;
      const production = 6 + Math.floor(random() * 5);
      const upkeep = 3 + Math.floor(random() * 4);

      resources = Math.max(0, resources + production - upkeep + drift);
      stability = Math.max(0, Math.min(100, stability + (drift > 0 ? 2 : -1)));

      states.push({ tick, resources, stability, drift, production, upkeep });
    }

    const mutFingerprint = await createMutFingerprint({
      kernel: "seedworld.v1",
      seedHash,
      ticks,
      states,
    });

    return deepFreeze({ seedHash, mutFingerprint, states });
  });
}
