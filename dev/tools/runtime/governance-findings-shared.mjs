import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const FINDINGS_EVIDENCE_REL = "runtime/evidence/governance-findings.json";
export const REQUIRED_REPORT_REL = "runtime/evidence/required-check-report.json";

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function reportFingerprint(report) {
  return sha256(
    JSON.stringify({
      policy: report.policy || "unknown",
      run_mode: report.run_mode || "unknown",
      overall_status: report.overall_status || "UNKNOWN",
      failure_step: report.failure_step || null,
      steps: (report.steps || []).map((step) => ({
        id: step.id || step.script || "unknown",
        status: step.status || "UNKNOWN",
        exit_code: step.exit_code ?? null,
        output_sha256: step.output_sha256 || "missing"
      }))
    })
  );
}

export function dedup(items, keyFn) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function parseTaskId(taskId) {
  const m = /^([A-Z]+)-(\d+)$/.exec(String(taskId || ""));
  if (!m) return null;
  return { prefix: m[1], number: Number(m[2]) };
}

export function nextTaskId(prefix, tasks) {
  let max = 0;
  for (const task of tasks) {
    const parsed = parseTaskId(task.task_id);
    if (parsed && parsed.prefix === prefix && Number.isFinite(parsed.number)) {
      max = Math.max(max, parsed.number);
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export async function loadReport(root, relPath = REQUIRED_REPORT_REL) {
  const abs = path.join(root, relPath);
  const raw = await readFile(abs, "utf8");
  return {
    reportRel: relPath,
    reportAbs: abs,
    reportRaw: raw,
    report: JSON.parse(raw),
    reportSha: sha256(raw)
  };
}

async function loadTaskDir(absDir) {
  const entries = await readdir(absDir, { withFileTypes: true }).catch(() => []);
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const abs = path.join(absDir, entry.name);
    const raw = await readFile(abs, "utf8");
    tasks.push(JSON.parse(raw));
  }
  return tasks;
}

export async function loadAllTasks(root) {
  const openDir = path.join(root, "tem", "tasks", "open");
  const archiveDir = path.join(root, "tem", "tasks", "archive");
  const [openTasks, archivedTasks] = await Promise.all([loadTaskDir(openDir), loadTaskDir(archiveDir)]);
  return [...openTasks, ...archivedTasks];
}

export function buildBlockers(report) {
  const failedSteps = dedup(
    (report.steps || [])
      .filter((step) => step.status === "FAILED")
      .map((step) => ({
        step_id: step.id || step.script || "unknown",
        script: step.script || "unknown",
        exit_code: step.exit_code,
        output_sha256: step.output_sha256 || "missing",
        reason: `required gate failed: ${step.id || step.script || "unknown"}`
      })),
    (item) => item.step_id
  );

  if (failedSteps.length > 0) {
    return failedSteps;
  }
  if (report.overall_status === "FAILED") {
    const fallback = report.failure_step || "unknown";
    return [
      {
        step_id: fallback,
        script: fallback,
        exit_code: null,
        output_sha256: "missing",
        reason: `required gate failed: ${fallback}`
      }
    ];
  }
  return [];
}

export function findingFingerprint({ report, blocker }) {
  return sha256(
    JSON.stringify({
      policy: report.policy || "unknown",
      run_mode: report.run_mode || "unknown",
      step_id: blocker.step_id,
      output_sha256: blocker.output_sha256 || "missing"
    })
  );
}
