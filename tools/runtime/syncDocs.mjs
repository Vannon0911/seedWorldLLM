import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "docs", "ORIENTATION.md");
const today = new Date().toISOString().slice(0, 10);

const content = `# SeedWorld Orientation (Synced: ${today})

## 1) System Map

- \`src/ui/\`: Rendering und Input, keine direkten Domain-State Writes.
- \`src/game/\`: Gameplay-Regeln und erlaubte Patch-Berechnung.
- \`src/kernel/\`: Deterministische Domain-Grenzen und Mutationskontrolle.
- \`tools/patch/\`: Intake, Locking, Normalisierung, Orchestrierung.
- \`tests/\`: Einstieg \`tests/MainTest.mjs\`, Module unter \`tests/modules/\`.

## 2) Lokale Reihenfolge

\`\`\`bash
npm install
npm run sync:docs
npm run preflight
npm test
npm start
\`\`\`

## 3) Verifizierte Testlinie

- \`node scripts/smoke-test.mjs\`
- \`node scripts/runtime-guards-test.mjs\`
- \`node scripts/patch-flow-test.mjs\`
- \`node scripts/test-runner.mjs\`

## 4) Hinweise

- Patch-Server startet nur bei Direct-Run und blockiert keine Test-Imports.
- Terrain/DOM/SVG-Rendering ist getrennt: Canvas unten, DOM Mitte, SVG oben.
`;

let current = "";
try {
  current = await readFile(target, "utf8");
} catch {
  current = "";
}

if (current !== content) {
  await writeFile(target, content, "utf8");
}

console.log("[SYNC_DOCS] OK");
