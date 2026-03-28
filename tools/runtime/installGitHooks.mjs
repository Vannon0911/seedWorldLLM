import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const hooksDir = resolve(root, ".githooks");

const preCommit = `#!/bin/sh
set -e

echo "[hook:pre-commit] signing config + sync docs + preflight"
npm run signing:guard -- --config-only
npm run sync:docs
git add docs/INDEX.md docs/SOT/ORIENTATION.md
npm run preflight
`;

const prePush = `#!/bin/sh
set -e

echo "[hook:pre-push] signing config + run tests"
npm run signing:guard -- --config-only
npm test
`;

await mkdir(hooksDir, { recursive: true });
await writeFile(resolve(hooksDir, "pre-commit"), preCommit, "utf8");
await writeFile(resolve(hooksDir, "pre-push"), prePush, "utf8");
await chmod(resolve(hooksDir, "pre-commit"), 0o755);
await chmod(resolve(hooksDir, "pre-push"), 0o755);

const configured = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: root,
  stdio: "inherit"
});
if (configured.status !== 0) {
  throw new Error("git config core.hooksPath .githooks failed");
}

console.log("[HOOKS] installed (.githooks)");
