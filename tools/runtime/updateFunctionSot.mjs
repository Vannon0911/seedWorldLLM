import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildFunctionSot } from "./functionSotShared.mjs";
import { withRepoLock } from "./repoLock.mjs";

async function main() {
  const root = process.cwd();
  await withRepoLock(root, async () => {
    const outPath = path.join(root, "docs/FUNCTION_SOT.json");
    const sot = await buildFunctionSot(root);
    await writeFile(outPath, `${JSON.stringify(sot, null, 2)}\n`, "utf8");
    console.log(`[FUNCTION_SOT] geschrieben: ${outPath}`);
  });
}

main().catch((error) => {
  console.error(`[FUNCTION_SOT][ERROR] ${error.message}`);
  process.exit(1);
});
