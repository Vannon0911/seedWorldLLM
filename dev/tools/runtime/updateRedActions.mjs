import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const targetPath = path.join(root, "docs", "LLM", "AKTUELLE_RED_ACTIONS.md");
const writeMode = process.argv.includes("--write");

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return "";
  }
  return String(result.stdout || "").trim();
}

function parseNameStatus(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/);
      return { status: status || "?", file: rest.join(" ") || "" };
    })
    .filter((entry) => entry.file)
    .filter((entry) => entry.file !== "docs/LLM/AKTUELLE_RED_ACTIONS.md");
}

function classifyRisk(filePath) {
  if (filePath.startsWith("app/src/kernel/")) {
    return "kernel-core";
  }
  if (filePath.startsWith("dev/tools/runtime/")) {
    return "runtime-guard";
  }
  if (filePath.startsWith(".githooks/")) {
    return "hook-flow";
  }
  if (filePath === "package.json") {
    return "script-surface";
  }
  return null;
}

function buildContent(changes, snapshotHash) {
  const lines = [];
  lines.push("# AKTUELLE RED ACTIONS");
  lines.push("");
  lines.push("Dieser Stand wird automatisch vor Preflight/Commit synchronisiert.");
  lines.push("");
  lines.push(`- Snapshot: \`${snapshotHash}\``);
  lines.push(`- Candidate Changes: \`${changes.length}\``);
  lines.push("");
  lines.push("## Commit-Kandidat (Name-Status)");
  if (changes.length === 0) {
    lines.push("- Keine gestagten Aenderungen erkannt.");
  } else {
    for (const entry of changes) {
      lines.push(`- \`${entry.status}\` ${entry.file}`);
    }
  }
  lines.push("");
  lines.push("## Red-Actions (risikoreiche Treffer)");
  const risky = changes
    .map((entry) => ({ ...entry, risk: classifyRisk(entry.file) }))
    .filter((entry) => entry.risk);
  if (risky.length === 0) {
    lines.push("- Keine risikoreichen Treffer im aktuellen Commit-Kandidaten.");
  } else {
    for (const entry of risky) {
      lines.push(`- \`${entry.risk}\` -> \`${entry.status}\` ${entry.file}`);
    }
  }
  lines.push("");
  lines.push("## Regel");
  lines.push("- Jeder Commit muss diesen Stand widerspruchsfrei spiegeln.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const stagedRaw = runGit(["diff", "--cached", "--name-status", "--no-renames"]);
  const changes = parseNameStatus(stagedRaw);
  const normalizedInput = changes
    .map((entry) => `${entry.status}\t${entry.file}`)
    .join("\n");
  const snapshotHash = createHash("sha256")
    .update(normalizedInput || "empty")
    .digest("hex")
    .slice(0, 16);

  // Red actions describe the staged commit candidate only; unstaged worktree noise
  // must never rewrite or block the synchronized snapshot.
  if (!writeMode && changes.length === 0) {
    console.log(`[RED_ACTIONS] OK (${changes.length} candidate changes, snapshot=${snapshotHash}, mode=check, clean-tree-bypass=true)`);
    return;
  }

  const next = buildContent(changes, snapshotHash);

  let current = "";
  try {
    current = await readFile(targetPath, "utf8");
  } catch {
    current = "";
  }

  const drift = current !== next;

  if (writeMode && drift) {
    await writeFile(targetPath, next, "utf8");
  }

  if (!writeMode && drift) {
    console.error("[RED_ACTIONS] DRIFT: docs/LLM/AKTUELLE_RED_ACTIONS.md ist nicht synchron.");
    console.error("[RED_ACTIONS] FIX: npm run sync:docs:apply");
    process.exit(1);
    return;
  }

  console.log(`[RED_ACTIONS] OK (${changes.length} candidate changes, snapshot=${snapshotHash}, mode=${writeMode ? "write" : "check"})`);
}

await main();
