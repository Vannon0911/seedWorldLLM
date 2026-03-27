import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { withRepoLock } from "./repoLock.mjs";

const execFileAsync = promisify(execFile);

async function runTool(root, script) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [path.join(root, script)], { cwd: root });
    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }
  } catch (error) {
    if (error.stdout) {
      process.stdout.write(error.stdout);
    }
    if (error.stderr) {
      process.stderr.write(error.stderr);
    }
    throw error;
  }
}

async function main() {
  const root = process.cwd();

  await withRepoLock(root, async () => {
    await runTool(root, "tools/runtime/updateFunctionSot.mjs");
    await runTool(root, "tools/runtime/updateTraceLock.mjs");
  });
}

main().catch((error) => {
  console.error(`[SYNC_DOCS][ERROR] ${error.message}`);
  process.exit(1);
});
