import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const writeSyncArtifacts = !process.argv.includes("--verify-only");
const reportPath = path.join(root, "runtime", "evidence", "required-check-report.json");

const syncSteps = [
  { id: "docs:v2:sync", script: "docs:v2:sync" },
  { id: "repo:hygiene:sync", script: "repo:hygiene:sync" }
];

const verifySteps = [
  { id: "tests", script: "test" },
  { id: "evidence:verify", script: "evidence:verify" },
  { id: "testline:verify", script: "testline:verify" },
  { id: "repo:hygiene:verify", script: "repo:hygiene:verify" },
  { id: "docs:v2:verify", script: "docs:v2:verify" }
];

function resolveNpmCommand(script) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && npmExecPath.endsWith("npm-cli.js")) {
    return {
      command: process.execPath,
      args: [npmExecPath, "run", script],
      rendered: `node ${npmExecPath} run ${script}`
    };
  }
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return {
    command: npmCmd,
    args: ["run", script],
    rendered: `${npmCmd} run ${script}`
  };
}

function gitValue(args, fallback = "unknown") {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return fallback;
  }
  const value = String(result.stdout || "").trim();
  return value || fallback;
}

function digestText(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function sha256File(absPath) {
  const content = await readFile(absPath);
  return createHash("sha256").update(content).digest("hex");
}

async function runStep(step) {
  const npmCommand = resolveNpmCommand(step.script);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const outputChunks = [];

  return await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(npmCommand.command, npmCommand.args, {
        cwd: root,
        stdio: ["inherit", "pipe", "pipe"]
      });
    } catch (error) {
      reject({
        ...step,
        command: npmCommand.rendered,
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
        status: "FAILED",
        exit_code: null,
        output_sha256: digestText(String(error?.message || error)),
        error: String(error?.message || error)
      });
      return;
    }

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      outputChunks.push(text);
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      outputChunks.push(text);
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      const endedAt = new Date().toISOString();
      const outputText = outputChunks.join("");
      reject({
        ...step,
        command: npmCommand.rendered,
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: Date.now() - startedMs,
        status: "FAILED",
        exit_code: null,
        output_sha256: digestText(`${outputText}\n${String(error?.message || error)}`),
        error: String(error?.message || error)
      });
    });

    child.on("close", (code) => {
      const endedAt = new Date().toISOString();
      const outputText = outputChunks.join("");
      const gate = {
        ...step,
        command: npmCommand.rendered,
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: Date.now() - startedMs,
        status: code === 0 ? "PASSED" : "FAILED",
        exit_code: code,
        output_sha256: digestText(outputText)
      };
      if (code === 0) {
        resolve(gate);
        return;
      }
      reject(gate);
    });
  });
}

async function buildEvidenceSummary() {
  const summaryRel = "runtime/evidence/summary.json";
  const finalRel = "runtime/evidence/final/testline-summary.json";
  const summaryAbs = path.join(root, summaryRel);
  const finalAbs = path.join(root, finalRel);
  return {
    evidence_summary: {
      path: summaryRel,
      sha256: await sha256File(summaryAbs)
    },
    final_testline_summary: {
      path: finalRel,
      sha256: await sha256File(finalAbs)
    }
  };
}

async function writeReport(report) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  const startedAt = new Date().toISOString();
  const report = {
    schema_version: 1,
    policy: "fail-closed-proof-first",
    run_mode: writeSyncArtifacts ? "auto-sync-and-verify" : "verify-only",
    repo: {
      head: gitValue(["rev-parse", "HEAD"]),
      branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"])
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    started_at: startedAt,
    steps: [],
    overall_status: "FAILED",
    failure_step: null
  };

  const pipeline = writeSyncArtifacts ? [...syncSteps, ...verifySteps] : verifySteps;
  try {
    for (const step of pipeline) {
      const gate = await runStep(step);
      report.steps.push(gate);
    }

    report.proof = await buildEvidenceSummary();
    report.claim_rule = "Claims are valid only if all verify gates passed and proof artifacts were hashed.";
    report.overall_status = "PASSED";
    report.finished_at = new Date().toISOString();
    await writeReport(report);
    console.log(
      `[REQUIRED_CHECK] PASS mode=${report.run_mode} proof=${report.proof.final_testline_summary.sha256.slice(0, 12)}`
    );
  } catch (failedStep) {
    report.steps.push(failedStep);
    report.failure_step = failedStep.id || failedStep.script || "unknown";
    report.finished_at = new Date().toISOString();
    await writeReport(report);
    console.error(`[REQUIRED_CHECK] BLOCK step=${report.failure_step}`);
    process.exit(1);
  }
}

await main();
