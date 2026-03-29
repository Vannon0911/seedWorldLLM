import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const orientationTarget = path.join(root, "docs", "SOT", "ORIENTATION.md");
const indexTarget = path.join(root, "docs", "INDEX.md");
const llmIndexTarget = path.join(root, "docs", "LLM", "INDEX.md");
const writeMode = process.argv.includes("--write");
const today = new Date().toISOString().slice(0, 10);

function runTool(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      stdio: "inherit"
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptPath} failed with exit code ${code}`));
      }
    });
  });
}

const orientationContent = `# SeedWorld Orientation (Synced: ${today})

## 1) System Map

- \`app/src/ui/\`: Rendering und Input, keine direkten Domain-State Writes.
- \`app/src/game/\`: Gameplay-Regeln und erlaubte Patch-Berechnung.
- \`app/src/kernel/\`: Deterministische Domain-Grenzen und Mutationskontrolle.
- \`dev/tools/patch/\`: Intake, Locking, Normalisierung, Orchestrierung.
- \`dev/tests/\`: Einstieg \`dev/tests/MainTest.mjs\`, Module unter \`dev/tests/modules/\`.

## 2) Lokale Reihenfolge

\`\`\`bash
npm install
npm run sync:docs
npm run preflight
npm test
npm start
\`\`\`

## 3) Verifizierte Testlinie

- \`node dev/scripts/smoke-test.mjs\`
- \`node dev/scripts/runtime-guards-test.mjs\`
- \`node dev/scripts/patch-flow-test.mjs\`
- \`node dev/scripts/test-runner.mjs\`

## 4) Hinweise

- Patch-Server startet nur bei Direct-Run und blockiert keine Test-Imports.
- Terrain/DOM/SVG-Rendering ist getrennt: Canvas unten, DOM Mitte, SVG oben.
`;

const indexContent = `# SeedWorld Docs Index (Synced: ${today})

Dieser Ordner enthaelt nur dieses Mapping plus Bereichsordner.

## Bereiche

- \`SOT/\`: Source of Truth, maschinen-/prozessnahe Referenzen.
- \`MANUEL/\`: Handbuecher, Bedienung, Deployment, Wiki.
- \`LLM/\`: LLM-Policies und LLM-spezifische Regeln.
- \`IN PLANUNG/\`: Geplante Themen und isolierte Vorarbeiten.

## Wichtige Einstiegspunkte

- Root Start: \`README.md\`
- Runtime Entry: \`start-server.js\` + \`app/server/patchServer.mjs\`
- Test Entry: \`dev/tests/MainTest.mjs\`

## Mapping

- SOT:
  - [ORIENTATION](./SOT/ORIENTATION.md)
  - [DETERMINISM_INVENTORY](./SOT/DETERMINISM_INVENTORY.md)
  - [REPO_HYGIENE_MAP](./SOT/REPO_HYGIENE_MAP.md)
- MANUEL:
  - [WORKFLOW](./MANUEL/WORKFLOW.md)
  - [Deployment](./MANUEL/deployment/DEPLOYMENT.md)
  - [Wiki Home](./MANUEL/wiki/Home.md)
- LLM:
  - [LLM Index](./LLM/INDEX.md)
  - [LLM Entry](./LLM/ENTRY.md)
  - [LLM Policy](./LLM/POLICY.md)
  - [AKTUELLE RED ACTIONS](./LLM/AKTUELLE_RED_ACTIONS.md)
- Source SoT (Runtime/LLM):
  - [app/src/sot/repo-boundaries.json](../app/src/sot/repo-boundaries.json)
  - [app/src/sot/release-manifest.json](../app/src/sot/release-manifest.json)
  - [app/src/sot/patches.schema.json](../app/src/sot/patches.schema.json)
  - [app/src/sot/FUNCTION_SOT.json](../app/src/sot/FUNCTION_SOT.json)
  - [app/src/sot/REPO_HYGIENE_MAP.json](../app/src/sot/REPO_HYGIENE_MAP.json)
  - [app/src/llm/llm-gate-policy.json](../app/src/llm/llm-gate-policy.json)
- IN PLANUNG:
  - [cleanup-reports](./IN%20PLANUNG/cleanup-reports/REPO_CLEANUP_BASELINE_2026-03-27.md)
  - [UNVERFID candidates](../legacy/UNVERFID/CANDIDATES.md)

`;

const llmIndexContent = `# LLM Index

- Entry: [ENTRY.md](./ENTRY.md)
- Policy: [POLICY.md](./POLICY.md)
- Aktuelle Red Actions: [AKTUELLE_RED_ACTIONS.md](./AKTUELLE_RED_ACTIONS.md)
`;

const toolModeArgs = writeMode ? ["--write"] : [];
await runTool("dev/tools/runtime/updateRedActions.mjs", toolModeArgs);
await runTool("dev/tools/runtime/repo-hygiene-map.mjs", toolModeArgs);

let currentOrientation = "";
try {
  currentOrientation = await readFile(orientationTarget, "utf8");
} catch {
  currentOrientation = "";
}

const drift = [];

if (currentOrientation !== orientationContent) {
  drift.push("docs/SOT/ORIENTATION.md");
}
if (writeMode && currentOrientation !== orientationContent) {
  await writeFile(orientationTarget, orientationContent, "utf8");
}

let currentIndex = "";
try {
  currentIndex = await readFile(indexTarget, "utf8");
} catch {
  currentIndex = "";
}

if (currentIndex !== indexContent) {
  drift.push("docs/INDEX.md");
}
if (writeMode && currentIndex !== indexContent) {
  await writeFile(indexTarget, indexContent, "utf8");
}

let currentLlmIndex = "";
try {
  currentLlmIndex = await readFile(llmIndexTarget, "utf8");
} catch {
  currentLlmIndex = "";
}

if (currentLlmIndex !== llmIndexContent) {
  drift.push("docs/LLM/INDEX.md");
}
if (writeMode && currentLlmIndex !== llmIndexContent) {
  await writeFile(llmIndexTarget, llmIndexContent, "utf8");
}

if (!writeMode && drift.length > 0) {
  console.error("[SYNC_DOCS] BLOCK: docs/SoT muessen vor preflight/testline synchron sein.");
  for (const item of drift) {
    console.error(` - ${item}`);
  }
  console.error("[SYNC_DOCS] ACTION: Nicht blind nachziehen. Erst sauber synchronisieren: npm run sync:docs:apply");
  process.exit(1);
} else {
  console.log(`[SYNC_DOCS] OK (mode=${writeMode ? "write" : "check"})`);
}
