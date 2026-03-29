import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const hooksDir = resolve(root, ".githooks");

const preCommit = `#!/bin/sh
set -e

only_preflight_injection_changes() {
  staged_files=$(git diff --cached --name-only --diff-filter=ACMR)
  [ -n "$staged_files" ] || return 1

  for file in $staged_files
  do
    case "$file" in
      .githooks/pre-commit|\
      dev/tools/runtime/installGitHooks.mjs|\
      dev/tools/runtime/preflight-mutation-guard.mjs)
        ;;
      *)
        return 1
        ;;
    esac
  done

  return 0
}

echo "[hook:pre-commit] signing guard + llm guard + guard challenge + verify preflight"
npm run signing:guard -- --config-only
if only_preflight_injection_changes; then
  echo "[hook:pre-commit] injection-only commit detected; skipping docs/SoT sync and preflight runs"
else
  npm run sot:apply
  npm run sync:docs:apply
  git add docs/INDEX.md docs/LLM/INDEX.md docs/LLM/AKTUELLE_RED_ACTIONS.md docs/SOT/ORIENTATION.md docs/SOT/REPO_HYGIENE_MAP.md app/src/sot/FUNCTION_SOT.json app/src/sot/REPO_HYGIENE_MAP.json
fi
npm run llm:guard -- --action commit
if only_preflight_injection_changes; then
  exit 0
fi
npm run preflight:guard
PREFLIGHT_GUARD_MODE=verify npm run preflight
`;

const prePush = `#!/bin/sh
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
