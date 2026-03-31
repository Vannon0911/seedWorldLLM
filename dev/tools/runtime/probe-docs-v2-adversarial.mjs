import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();

function runCommand(args) {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function withTempFile(relPath, content, fn) {
  const absPath = path.join(root, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
  try {
    return await fn();
  } finally {
    await rm(absPath, { force: true });
  }
}

async function expectFailure(label, args, requiredNeedle) {
  const result = await runCommand(args);
  if (result.code === 0) {
    throw new Error(`[DOCS_V2_PROBE] ${label} unexpectedly passed`);
  }
  const combined = `${result.stdout}\n${result.stderr}`;
  if (!combined.includes(requiredNeedle)) {
    throw new Error(`[DOCS_V2_PROBE] ${label} failed for the wrong reason`);
  }
}

async function main() {
  await withTempFile(
    "tem/rogue-plan-probe.md",
    "# Rogue Plan\n\nThis file should block because it is not atomized.\n",
    async () => {
      await expectFailure(
        "rogue plan",
        ["npm", "run", "docs:v2:guard"],
        "[DOCS_V2_PLAN_GUARD]"
      );
    }
  );

  await withTempFile(
    "docs/rogue-unclassified-probe.md",
    "# Rogue Doc\n\nThis file should block because it is unclassified.\n",
    async () => {
      await expectFailure(
        "unclassified doc",
        ["npm", "run", "docs:v2:coverage"],
        "[DOCS_V2_COVERAGE] block"
      );
    }
  );

  console.log("[DOCS_V2_PROBE] OK plan-guard and coverage guard both resisted adversarial temp files");
}

await main();
