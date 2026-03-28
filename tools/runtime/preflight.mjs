import { spawn } from "node:child_process";

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: "inherit"
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptPath} failed with exit code ${code}`));
      }
    });
  });
}

await runNodeScript("scripts/smoke-test.mjs");
await runNodeScript("scripts/runtime-guards-test.mjs");
await runNodeScript("tools/runtime/governance-verify.mjs");
await runNodeScript("tools/runtime/syncDocs.mjs");
console.log("[PREFLIGHT] OK");
