import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { withRepoLock } from "./repoLock.mjs";

const root = process.cwd();

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function splitLines(content) {
  return content.split("\n");
}

function parseMutPoints(content) {
  const lines = splitLines(content);
  const mutPoints = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/@mut-point\s+([A-Z0-9-]+)/);
    if (match) {
      mutPoints.push({ id: match[1], line: i + 1 });
    }
  }

  return mutPoints;
}

async function main() {
  await withRepoLock(root, async () => {
    const tracePath = path.join(root, "docs/TRACEABILITY.json");
    const traceContent = await readFile(tracePath, "utf8");
    const trace = JSON.parse(traceContent);

    const files = {};

    for (const entry of trace.trackedFiles) {
      const filePath = path.join(root, entry.file);
      const content = await readFile(filePath, "utf8");
      files[entry.file] = {
        sha256: sha256(content),
        lines: splitLines(content),
        mutPoints: parseMutPoints(content)
      };
    }

    const lock = {
      traceability: {
        file: "docs/TRACEABILITY.json",
        sha256: sha256(traceContent)
      },
      files
    };

    const outPath = path.join(root, "docs/trace-lock.json");
    await writeFile(outPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    console.log(`[TRACE_LOCK] geschrieben: ${outPath}`);
  });
}

main().catch((error) => {
  console.error(`[TRACE_LOCK][ERROR] ${error.message}`);
  process.exit(1);
});
