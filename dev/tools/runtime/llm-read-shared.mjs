import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const REQUIRED_READ_ORDER = Object.freeze([
  "docs/INDEX.md",
  "docs/LLM/ENTRY.md",
  "docs/LLM/POLICY.md"
]);

export function getWorkspacePaths(rootDir = process.cwd()) {
  return {
    rootDir,
    docsDir: path.join(rootDir, "docs", "LLM"),
    statePath: path.join(rootDir, "runtime", ".patch-manager", "llm-read-state.json")
  };
}

export async function collectReadState(rootDir = process.cwd()) {
  const files = [];
  for (const relPath of REQUIRED_READ_ORDER) {
    const absPath = path.join(rootDir, ...relPath.split("/"));
    const raw = await readFile(absPath, "utf8");
    const fileHash = createHash("sha256").update(raw).digest("hex");
    const info = await stat(absPath);
    files.push({
      relPath,
      absPath,
      sha256: fileHash,
      bytes: Buffer.byteLength(raw, "utf8"),
      mtime: info.mtime.toISOString()
    });
  }

  const combinedHash = createHash("sha256")
    .update(files.map((x) => `${x.relPath}:${x.sha256}`).join("|"))
    .digest("hex");

  return { files, combinedHash };
}

export async function writeAckState(rootDir = process.cwd(), actor = "manual") {
  const paths = getWorkspacePaths(rootDir);
  const state = await collectReadState(rootDir);
  const payload = {
    version: 1,
    actor,
    rootDir,
    docsDir: paths.docsDir,
    requiredReadOrder: REQUIRED_READ_ORDER,
    combinedHash: state.combinedHash,
    acknowledgedAt: new Date().toISOString(),
    files: state.files
  };

  await mkdir(path.dirname(paths.statePath), { recursive: true });
  await writeFile(paths.statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { payload, statePath: paths.statePath };
}
