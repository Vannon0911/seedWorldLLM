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
      const stderrDetail = stderrBuffer.trim();
      if (code !== 0) {
        const error = new Error(
          stderrDetail
            ? `${label} failed with exit code ${code}: ${stderrDetail}`
            : `${label} failed with exit code ${code}`
        );
        error.stderr = stderrBuffer;
        reject(error);
        return;
      }

      if (hasBlockedStderr(stderrBuffer)) {
        const error = new Error(
          stderrDetail
            ? `${label} emitted blocked stderr pattern: ${stderrDetail}`
            : `${label} emitted blocked stderr pattern`
        );
        error.stderr = stderrBuffer;
        reject(error);
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
  const cliEnforce = process.argv.includes("--enforce");
  const cliVerify = process.argv.includes("--verify");
  const envMode = String(process.env.PREFLIGHT_GUARD_MODE || "").trim().toLowerCase();
  if (envMode === "0" || envMode === "verify") {
    return ["--verify"];
  }
  if (envMode === "enforce") {
    return ["--enforce"];
  }
  if (cliEnforce) {
    return ["--enforce"];
  }
  if (cliVerify) {
    return ["--verify"];
  }
  return [];
}

function shouldSkipSyncChecks() {
  return String(process.env.PREFLIGHT_ASSUME_SYNCED || "").trim() === "1";
}

try {
  // 1) identity and policy guards first
  await runNodeScript("dev/tools/runtime/signing-guard.mjs", ["--config-only"]);
  await runNodeScript("dev/tools/runtime/evidence-lock.mjs");
  if (!shouldSkipSyncChecks()) {
    await runNodeScript("dev/tools/runtime/updateFunctionSot.mjs");
    await runNodeScript("dev/tools/runtime/syncDocs.mjs");
  }
  await runNodeScript("dev/tools/runtime/governance-verify.mjs");
  await runNodeScript("dev/tools/runtime/check-wrapper-guardrails.mjs");
  await runNodeScript("dev/tools/runtime/preflight-mutation-guard.mjs", mutationGuardArgs());

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
  const detail = String(error?.stderr || error?.message || error);
  const msg = String(error?.message || error);
  if (detail.includes("[SYNC_DOCS_DRIFT]")) {
    console.error("[PREFLIGHT] BLOCK: Docs-/SoT-Sync ist Pflicht vor der Testline. Erst `npm run sot:apply` und `npm run sync:docs:apply`, dann erneut laufen lassen.");
  }
  console.error(`[PREFLIGHT] BLOCK: ${msg}`);
  console.error("[PREFLIGHT] BLOCK: Testline bleibt policy-gebunden. Erst Synchronitaet und Absicht sauber halten, dann weiter.");
  process.exit(1);
}
