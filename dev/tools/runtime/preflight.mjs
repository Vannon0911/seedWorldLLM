import { spawn } from "node:child_process";

const BLOCKED_STDERR_PATTERNS = [
  /\[DEP0190\]/i,
  /Das System kann den angegebenen Pfad nicht finden/i
];

function hasBlockedStderr(stderrText) {
  return BLOCKED_STDERR_PATTERNS.some((rx) => rx.test(stderrText));
}

function runProcess(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["inherit", "pipe", "pipe"]
    });
    let stderrBuffer = "";

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderrBuffer += text;
      process.stderr.write(chunk);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} failed with exit code ${code}`));
        return;
      }

      if (hasBlockedStderr(stderrBuffer)) {
        reject(new Error(`${label} emitted blocked stderr pattern`));
        return;
      }

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });
  });
}

function runNodeScript(scriptPath, args = []) {
  return runProcess(process.execPath, [scriptPath, ...args], scriptPath);
}

function runNpmScript(scriptName) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && npmExecPath.endsWith("npm-cli.js")) {
    return runProcess(process.execPath, [npmExecPath, "run", scriptName], `npm run ${scriptName}`);
  }
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return runProcess(npmCmd, ["run", scriptName], `npm run ${scriptName}`);
}

function mutationGuardArgs() {
  const envMode = String(process.env.PREFLIGHT_GUARD_MODE || "").trim().toLowerCase();
  if (envMode === "0" || envMode === "verify") {
    return ["--verify"];
  }
  if (envMode === "enforce") {
    return ["--enforce"];
  }
  return [];
}

try {
  // 1) identity and policy guards first
  await runNodeScript("dev/tools/runtime/signing-guard.mjs", ["--config-only"]);
  await runNodeScript("dev/tools/runtime/evidence-lock.mjs");
  await runNodeScript("dev/tools/runtime/preflight-mutation-guard.mjs", mutationGuardArgs());
  await runNodeScript("dev/tools/runtime/updateFunctionSot.mjs");
  await runNodeScript("dev/tools/runtime/syncDocs.mjs");
  await runNodeScript("dev/tools/runtime/governance-verify.mjs");

  // 2) immutable integrity gate (pre)
  await runNodeScript("dev/tools/runtime/verify-testline-integrity.mjs");

  // 3) full testline + evidence
  await runNodeScript("dev/scripts/smoke-test.mjs");
  await runNodeScript("dev/scripts/runtime-guards-test.mjs");
  await runNpmScript("test");
  await runNodeScript("dev/scripts/test-runner.mjs");
  await runNodeScript("dev/scripts/verify-evidence.mjs");
  await runNpmScript("test:playwright:fulltiles");

  // 4) immutable integrity gate (post)
  await runNodeScript("dev/tools/runtime/verify-testline-integrity.mjs");
  await runNodeScript("dev/tools/runtime/evidence-lock.mjs", ["--update"]);

  console.log("[PREFLIGHT] OK");
} catch (error) {
  const msg = String(error?.message || error);
  if (msg.includes("dev/tools/runtime/syncDocs.mjs")) {
    console.error("[PREFLIGHT] BLOCK: Docs-Sync ist Pflicht vor der Testline. Fuehre zuerst `npm run sync:docs:apply` aus oder nutze den Pre-Commit-Hook.");
  }
  console.error(`[PREFLIGHT] BLOCK: ${msg}`);
  console.error("[PREFLIGHT] BLOCK: Jeder Test muss belegt erfolgreich sein. Ruecksprache halten, bevor fortgefahren wird.");
  process.exit(1);
}
