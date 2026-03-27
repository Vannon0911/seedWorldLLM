import { sha256Hex } from "./fingerprint.js";

function guardError(message) {
  return new Error(`[SEED_GUARD] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw guardError(message);
  }
}

function normalizeHex64(value) {
  assert(typeof value === "string", "expectedSeedHash muss eine Zeichenkette sein");
  return value.trim().toLowerCase();
}

function isHex64(value) {
  return /^[0-9a-f]{64}$/.test(value);
}

function constantTimeHexEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

export async function assertSeedMatch(seed, expectedSeedHash) {
  // @doc-anchor SEED-GUARD
  // @mut-point MUT-SEED-GUARD
  assert(typeof seed === "string" && seed.trim().length > 0, "seed fehlt oder ungueltig");

  const normalizedExpected = normalizeHex64(expectedSeedHash);
  assert(isHex64(normalizedExpected), "expectedSeedHash muss 64 Hex Zeichen haben");

  const actualSeedHash = await sha256Hex(seed);
  const ok = constantTimeHexEqual(actualSeedHash, normalizedExpected);
  assert(ok, "Seed-Abgleich fehlgeschlagen (Hash mismatch)");

  return actualSeedHash;
}
