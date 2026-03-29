import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return "NO_HEAD";
  }
  return String(result.stdout || "").trim() || "NO_HEAD";
}

function reasonHash(reason) {
  return createHash("sha256").update(reason).digest("hex");
}

function isCriticalFailure(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("verify-testline-integrity") ||
    text.includes("runtime-guards-test") ||
    text.includes("date.now") ||
    text.includes("crypto") ||
    text.includes("injected marker") ||
    text.includes("mode=2 unresolved lock") ||
    text.includes("mode=1 generated lock challenge") ||
    text.includes("failed with exit code")
  );
}

function isLocalGuardChallengeFailure(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("preflight-mutation-guard");
}

async function readOverrideState() {
  const overridePath = path.join(process.cwd(), "runtime", ".patch-manager", "preflight-override.json");
  try {
    return JSON.parse(await readFile(overridePath, "utf8"));
  } catch {
    return null;
  }
}

async function hasTripleOverride(message) {
  const state = await readOverrideState();
  const slot = state?.preflight;
  if (!slot || typeof slot !== "object") {
    return false;
  }
  const head = currentHead();
  return slot.confirmations >= 3 && slot.head === head && slot.reasonHash === reasonHash(message);
}

function printTripleWarning(message) {
  for (let i = 1; i <= 3; i += 1) {
    console.error(`[PREFLIGHT][WARN_${i}] Kritischer Failure erkannt: "${message}"`);
  }
  console.error("[PREFLIGHT][FINAL] Bypass nur nach 3x expliziter Bestaetigung.");
  console.error(`[PREFLIGHT][ACTION] npm run preflight:override -- --reason "${message.replace(/"/g, "'")}"`);
}

try {
  // 1) identity and policy guards first
  await runNodeScript("dev/tools/runtime/signing-guard.mjs", ["--config-only"]);
  await runNodeScript("dev/tools/runtime/evidence-lock.mjs");
  await runNodeScript("dev/tools/runtime/preflight-mutation-guard.mjs", ["--enforce"]);
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
  if (isCriticalFailure(msg) && !isLocalGuardChallengeFailure(msg)) {
    const overrideActive = await hasTripleOverride(msg);
    if (overrideActive) {
      console.warn("[PREFLIGHT] override active (3/3). Kritischer Failure wird bewusst bypassed.");
      console.warn(`[PREFLIGHT] BYPASS: ${msg}`);
      process.exit(0);
    }
    printTripleWarning(msg);
  }
  console.error(`[PREFLIGHT] BLOCK: ${msg}`);
  console.error("[PREFLIGHT] BLOCK: Jeder Test muss belegt erfolgreich sein. Ruecksprache halten, bevor fortgefahren wird.");
  process.exit(1);
}
