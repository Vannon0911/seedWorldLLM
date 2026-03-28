import { readFile } from "node:fs/promises";
import { REQUIRED_READ_ORDER, collectReadState, getWorkspacePaths } from "./llm-read-shared.mjs";

function fail(message) {
  console.error(`[LLM_GUARD] FAIL: ${message}`);
  console.error("[LLM_GUARD] Run: npm run llm:entry");
  process.exit(1);
}

async function main() {
  const root = process.cwd();
  const { statePath } = getWorkspacePaths(root);
  const current = await collectReadState(root);

  let saved = null;
  try {
    saved = JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    fail(`No ACK state found at ${statePath}`);
  }

  if (saved.combinedHash !== current.combinedHash) {
    fail("Docs changed since last ACK (combined hash mismatch)");
  }

  const expected = REQUIRED_READ_ORDER.join("|");
  const actual = Array.isArray(saved.requiredReadOrder) ? saved.requiredReadOrder.join("|") : "";
  if (actual !== expected) {
    fail("Saved read order is invalid or incomplete");
  }

  console.log(`[LLM_GUARD] OK (${saved.acknowledgedAt})`);
}

await main();
