import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  FINDINGS_EVIDENCE_REL,
  REQUIRED_REPORT_REL,
  buildBlockers,
  findingFingerprint,
  loadReport,
  reportFingerprint
} from "./governance-findings-shared.mjs";

const root = process.cwd();

async function loadTaskFingerprints() {
  const dirs = [path.join(root, "tem", "tasks", "open"), path.join(root, "tem", "tasks", "archive")];
  const out = new Set();
  for (const dir of dirs) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const raw = await readFile(path.join(dir, entry.name), "utf8");
      const task = JSON.parse(raw);
      const fingerprint = String(task.finding_fingerprint || "").trim();
      if (fingerprint) out.add(fingerprint);
    }
  }
  return out;
}

async function main() {
  const { report } = await loadReport(root, REQUIRED_REPORT_REL);
  const blockers = buildBlockers(report);
  const evidenceAbs = path.join(root, FINDINGS_EVIDENCE_REL);
  const evidenceRaw = await readFile(evidenceAbs, "utf8").catch(() => "");
  const evidence = evidenceRaw ? JSON.parse(evidenceRaw) : null;
  const taskFingerprints = await loadTaskFingerprints();

  if (!evidence) {
    console.error("[GOVERNANCE_FINDINGS] missing evidence file");
    console.error("[GOVERNANCE_FINDINGS] FIX: npm run governance:findings:materialize");
    process.exit(1);
  }

  const currentFingerprint = reportFingerprint(report);
  if ((evidence.report_fingerprint || "") !== currentFingerprint) {
    console.error("[GOVERNANCE_FINDINGS] report fingerprint mismatch");
    process.exit(1);
  }

  if ((report.overall_status || "UNKNOWN") !== (evidence.report_status || "UNKNOWN")) {
    console.error("[GOVERNANCE_FINDINGS] report/evidence status mismatch");
    process.exit(1);
  }

  if (report.overall_status === "PASSED" && (evidence.blockers || []).length > 0) {
    console.error("[GOVERNANCE_FINDINGS] stale blockers remain for a passed report");
    process.exit(1);
  }

  if (report.overall_status === "FAILED" && blockers.length === 0) {
    console.error("[GOVERNANCE_FINDINGS] failed report has no blocker payload");
    process.exit(1);
  }

  const expectedFingerprints = new Set(
    blockers.map((blocker) => findingFingerprint({ report, blocker }))
  );
  const evidenceFingerprints = new Set(
    (evidence.blockers || []).map((item) => String(item.finding_fingerprint || "").trim()).filter(Boolean)
  );

  const missingFromEvidence = [...expectedFingerprints].filter((fingerprint) => !evidenceFingerprints.has(fingerprint));
  const extraInEvidence = [...evidenceFingerprints].filter((fingerprint) => !expectedFingerprints.has(fingerprint));
  if (missingFromEvidence.length > 0 || extraInEvidence.length > 0) {
    console.error("[GOVERNANCE_FINDINGS] evidence blocker set mismatch");
    for (const fingerprint of missingFromEvidence) {
      console.error(` - missing in evidence: ${fingerprint}`);
    }
    for (const fingerprint of extraInEvidence) {
      console.error(` - stale in evidence: ${fingerprint}`);
    }
    process.exit(1);
  }

  const uncovered = [];
  for (const item of evidence.blockers || []) {
    const fingerprint = String(item.finding_fingerprint || "").trim();
    if (!fingerprint) {
      uncovered.push(item.step_id || "unknown");
      continue;
    }
    if (!taskFingerprints.has(fingerprint)) {
      uncovered.push(item.step_id || fingerprint);
    }
  }

  if (uncovered.length > 0) {
    console.error("[GOVERNANCE_FINDINGS] blockers without task mapping");
    for (const step of uncovered) {
      console.error(` - ${step}`);
    }
    console.error("[GOVERNANCE_FINDINGS] FIX: npm run governance:findings:materialize");
    process.exit(1);
  }

  console.log(`[GOVERNANCE_FINDINGS] OK blockers=${(evidence.blockers || []).length}`);
}

await main();
