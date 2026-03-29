import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const hooksDir = resolve(root, ".githooks");

const preCommit = `#!/bin/sh
set -e

echo "[hook:pre-commit] signing guard + sync docs + llm guard + mutation challenge + verify preflight"
npm run signing:guard -- --config-only
npm run sync:docs:apply
git add docs/INDEX.md docs/LLM/INDEX.md docs/LLM/AKTUELLE_RED_ACTIONS.md docs/SOT/ORIENTATION.md docs/SOT/REPO_HYGIENE_MAP.md app/src/sot/REPO_HYGIENE_MAP.json
npm run llm:guard -- --action commit
npm run preflight:guard
PREFLIGHT_GUARD_MODE=verify npm run preflight
`;

const prePush = `#!/bin/sh
set -e

ZERO_SHA="0000000000000000000000000000000000000000"

while read local_ref local_sha remote_ref remote_sha
do
  [ -z "$local_ref" ] && continue

  if [ "$local_sha" = "$ZERO_SHA" ]; then
    echo "[hook:pre-push] BLOCK: ref deletion is forbidden ($remote_ref)"
    exit 1
  fi

  if [ "$remote_sha" = "$ZERO_SHA" ]; then
    continue
  fi

  if ! git merge-base --is-ancestor "$remote_sha" "$local_sha"; then
    echo "[hook:pre-push] BLOCK: non-fast-forward push is forbidden ($local_ref -> $remote_ref)"
    echo "[hook:pre-push] BLOCK: --force/--force-with-lease/history rewrite are not allowed."
    exit 1
  fi
done

echo "[hook:pre-push] llm guard + signing guard + verify preflight"
npm run llm:guard -- --action push
npm run signing:guard -- --config-only
PREFLIGHT_GUARD_MODE=verify npm run preflight
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
