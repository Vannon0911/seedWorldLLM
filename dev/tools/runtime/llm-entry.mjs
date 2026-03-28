import { REQUIRED_READ_ORDER, writeAckState } from "./llm-read-shared.mjs";

function printOrder() {
  console.log("[LLM_ENTRY] Pflicht-Lesereihenfolge:");
  REQUIRED_READ_ORDER.forEach((relPath, index) => {
    console.log(`  ${index + 1}. ${relPath}`);
  });
  console.log("[LLM_ENTRY] Arbeitsregel: atomar arbeiten (ein Scope, ein Commit, volle Gegenpruefung).");
}

async function main() {
  printOrder();
  const { payload, statePath } = await writeAckState(process.cwd(), "llm-entry");
  console.log(`[LLM_ENTRY] ACK gespeichert: ${statePath}`);
  console.log(`[LLM_ENTRY] Docs-Hash: ${payload.combinedHash}`);
}

await main();
