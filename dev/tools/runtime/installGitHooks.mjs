import { chmod, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] ? resolve(process.argv[1]) === modulePath : false;

export const HOOKS_DIRNAME = ".githooks";
export const HOOK_FILE_NAMES = Object.freeze({
  preCommit: "pre-commit",
  prePush: "pre-push"
});

export function renderPreCommitHook() {
  return `#!/bin/sh
set -e

echo "[hook:pre-commit] verify hook sync + deterministic core tests"
npm run hooks:verify
npm test
`;
}

export function renderPrePushHook() {
  return `#!/bin/sh
set -e

ZERO_SHA="0000000000000000000000000000000000000000"

# Hard safety gate: reject history rewrites and ref deletions.
# pre-push stdin lines: <local ref> <local sha> <remote ref> <remote sha>
while read local_ref local_sha remote_ref remote_sha
do
  # Ignore empty lines.
  [ -z "$local_ref" ] && continue

  # Block deleting remote refs.
  if [ "$local_sha" = "$ZERO_SHA" ]; then
    echo "[hook:pre-push] BLOCK: ref deletion is forbidden ($remote_ref)"
    exit 1
  fi

  # New remote refs are fine (no remote ancestor yet).
  if [ "$remote_sha" = "$ZERO_SHA" ]; then
    continue
  fi

  # Non-fast-forward means force/update rewrite.
  if ! git merge-base --is-ancestor "$remote_sha" "$local_sha"; then
    echo "[hook:pre-push] BLOCK: non-fast-forward push is forbidden ($local_ref -> $remote_ref)"
    echo "[hook:pre-push] BLOCK: --force/--force-with-lease/history rewrite are not allowed."
    exit 1
  fi
done

echo "[hook:pre-push] verify hook sync + fail-closed proof gate"
npm run hooks:verify
npm run check:required:verify-only
`;
}

export function getGeneratedHooks() {
  return Object.freeze([
    { name: HOOK_FILE_NAMES.preCommit, content: renderPreCommitHook() },
    { name: HOOK_FILE_NAMES.prePush, content: renderPrePushHook() }
  ]);
}

export async function installHooks(root = process.cwd()) {
  const hooksDir = resolve(root, HOOKS_DIRNAME);
  await mkdir(hooksDir, { recursive: true });

  for (const hook of getGeneratedHooks()) {
    const hookPath = resolve(hooksDir, hook.name);
    await writeFile(hookPath, hook.content, "utf8");
    await chmod(hookPath, 0o755);
  }

  const configured = spawnSync("git", ["config", "core.hooksPath", HOOKS_DIRNAME], {
    cwd: root,
    stdio: "inherit"
  });
  if (configured.status !== 0) {
    throw new Error("git config core.hooksPath .githooks failed");
  }

  console.log("[HOOKS] installed (.githooks)");
}

if (isDirectRun) {
  await installHooks();
}
