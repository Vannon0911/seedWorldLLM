import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const orientationTarget = path.join(root, "docs", "SOT", "ORIENTATION.md");
const indexTarget = path.join(root, "docs", "INDEX.md");
const today = new Date().toISOString().slice(0, 10);

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

let currentOrientation = "";
try {
  currentOrientation = await readFile(orientationTarget, "utf8");
} catch {
  currentOrientation = "";
}

if (currentOrientation !== orientationContent) {
  await writeFile(orientationTarget, orientationContent, "utf8");
}

let currentIndex = "";
try {
  currentIndex = await readFile(indexTarget, "utf8");
} catch {
  currentIndex = "";
}

if (currentIndex !== indexContent) {
  await writeFile(indexTarget, indexContent, "utf8");
}

console.log("[SYNC_DOCS] OK");
