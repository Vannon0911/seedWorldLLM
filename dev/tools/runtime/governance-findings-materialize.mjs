import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FINDINGS_EVIDENCE_REL,
  REQUIRED_REPORT_REL,
  buildBlockers,
  findingFingerprint,
  loadReport,
  nextTaskId,
  reportFingerprint
} from "./governance-findings-shared.mjs";

const root = process.cwd();

const STEP_SCOPE_MAP = Object.freeze({
  "governance:llm:verify": ["docs/LLM/", "dev/tools/runtime/governance-llm-verify.mjs", "app/src/sot/llm-read-contract.v1.json"],
  "governance:subagent:verify": [
    "Sub_Agent/",
    "dev/tools/runtime/governance-subagent-verify.mjs",
    "app/src/sot/sub-agent-manifest.v1.json"
  ],
  "governance:findings:verify": [
    "dev/tools/runtime/governance-findings-materialize.mjs",
    "dev/tools/runtime/governance-findings-verify.mjs",
    "tem/tasks/open/"
  ]
});

function parseArgs(argv) {
  const out = { report: REQUIRED_REPORT_REL };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--report") {
      out.report = String(argv[i + 1] || REQUIRED_REPORT_REL);
      i += 1;
    }
  }
  return out;
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

async function loadTasks() {
  const [openTasks, archivedTasks] = await Promise.all([
    loadTaskDir(path.join(root, "tem", "tasks", "open")),
    loadTaskDir(path.join(root, "tem", "tasks", "archive"))
  ]);
  return { openTasks, archivedTasks, allTasks: [...openTasks, ...archivedTasks] };
}

function resolvePrefix(stepId) {
  if (stepId.startsWith("governance:llm") || stepId.startsWith("governance:subagent")) {
    return "LLM";
  }
  return "GOV";
}

function resolveTrack(prefix) {
  return prefix === "LLM" ? "governance-llm-hardening" : "governance-hardening";
}

function resolveScope(stepId) {
  return STEP_SCOPE_MAP[stepId] || ["dev/tools/runtime/run-required-checks.mjs", "app/src/kernel/GovernanceEngine.js"];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { report, reportRel } = await loadReport(root, args.report);
  const blockers = buildBlockers(report);
  const { allTasks } = await loadTasks();
  const existingByFingerprint = new Map();

  for (const task of allTasks) {
    const fingerprint = String(task.finding_fingerprint || "").trim();
    if (fingerprint) {
      existingByFingerprint.set(fingerprint, task.task_id);
    }
  }

  const created = [];
  const mapped = [];

  for (const blocker of blockers) {
    const fingerprint = findingFingerprint({ report, blocker });
    const existingTaskId = existingByFingerprint.get(fingerprint);
    if (existingTaskId) {
      mapped.push({
        ...blocker,
        finding_fingerprint: fingerprint,
        task_id: existingTaskId,
        state: "existing"
      });
      continue;
    }

    const prefix = resolvePrefix(blocker.step_id);
    const taskId = nextTaskId(prefix, [...allTasks, ...created]);
    const task = {
      schema_version: "2.0.0",
      task_id: taskId,
      title: `Blocker: ${blocker.step_id}`,
      status: "open",
      track: resolveTrack(prefix),
      source_docs: ["docs/V2/SYSTEM_PLAN.md"],
      description: `${blocker.reason}. proof=${blocker.output_sha256}.`,
      scope_paths: resolveScope(blocker.step_id),
      match_policy: "any_scope_path_touched",
      finding_fingerprint: fingerprint,
      finding_rule_id: blocker.step_id,
      finding_report: reportRel
    };

    const absPath = path.join(root, "tem", "tasks", "open", `${taskId}.json`);
    await writeFile(absPath, `${JSON.stringify(task, null, 2)}\n`, "utf8");
    created.push(task);
    mapped.push({
      ...blocker,
      finding_fingerprint: fingerprint,
      task_id: taskId,
      state: "created"
    });
  }

  const evidence = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    policy: "governance-findings.v1",
    report_path: reportRel,
    report_fingerprint: reportFingerprint(report),
    report_status: report.overall_status || "UNKNOWN",
    blockers: mapped,
    created_task_ids: created.map((task) => task.task_id)
  };

  const evidenceAbs = path.join(root, FINDINGS_EVIDENCE_REL);
  await mkdir(path.dirname(evidenceAbs), { recursive: true });
  await writeFile(evidenceAbs, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log(
    `[GOVERNANCE_FINDINGS] MATERIALIZED blockers=${mapped.length} created=${created.length} report=${report.overall_status}`
  );
}

await main();
