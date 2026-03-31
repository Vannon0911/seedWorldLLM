import { writeFile } from "node:fs/promises";
import { buildGovernanceModularityEvidence } from "./governance-modularity-verify.mjs";

const root = process.cwd();

async function main() {
  const { evidencePath, expectedEvidence } = await buildGovernanceModularityEvidence(root, { readExisting: false });
  const payload = {
    generated_at: new Date().toISOString(),
    ...expectedEvidence
  };
  await writeFile(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[GOVERNANCE_MODULARITY] SYNCED ${evidencePath}`);
}

await main();

