import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEADMAN_FILES = [
  "tools/runtime/preflight.mjs",
  "tools/runtime/repoLock.mjs",
  "tools/runtime/validateBlueprintScopes.mjs",
  "src/kernel/interface.js",
  "src/kernel/runtimeGuards.js",
  "src/kernel/seedGuard.js",
  "src/kernel/store/createStore.js",
  "src/kernel/store/applyPatches.js",
  "src/kernel/llmGovernance.js",
  "docs/TRACEABILITY.json",
  "docs/BLUEPRINT_SCOPES.json"
];

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

async function hashFile(root, relPath) {
  const full = path.join(root, relPath);
  const content = await readFile(full, "utf8");
  return sha256(content);
}

export async function createDeadmanSnapshot(root) {
  // @doc-anchor DEADMAN-TRIGGER
  // @mut-point MUT-DEADMAN-SNAPSHOT
  const hashes = {};
  for (const rel of DEADMAN_FILES) {
    hashes[rel] = await hashFile(root, rel);
  }

  return {
    version: "deadman.v1",
    files: DEADMAN_FILES.slice(),
    hashes
  };
}

export async function assertDeadmanIntact(root, snapshot, context = "") {
  for (const rel of snapshot.files) {
    const current = await hashFile(root, rel);
    const expected = snapshot.hashes[rel];
    if (current !== expected) {
      throw new Error(
        `[DEADMAN_TRIGGER] ${context} Gate-Datei veraendert: ${rel} expected=${expected} current=${current}`
      );
    }
  }
}
