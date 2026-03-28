import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function resolveEvidencePath(root, providedPath) {
  if (typeof providedPath === "string" && providedPath.trim()) {
    return path.resolve(root, providedPath.trim());
  }

  const logsDir = path.join(root, ".patch-manager", "logs");
  const entries = await readdir(logsDir, { withFileTypes: true });
  const evidenceFiles = entries
    .filter((entry) => entry.isFile() && /^test-run-.*\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  assert(evidenceFiles.length > 0, "Kein Evidence-Artifact gefunden.");
  return path.join(logsDir, evidenceFiles[evidenceFiles.length - 1]);
}

function validateEvidenceShape(evidence) {
  assert(isPlainObject(evidence), "Evidence muss ein Objekt sein.");
  const required = [
    "artifactSchemaVersion",
    "timestamp",
    "status",
    "tests",
    "policyVersion",
    "gateDecision",
    "determinism"
  ];
  for (const key of required) {
    assert(key in evidence, `Fehlendes Feld: ${key}`);
  }
  assert(Array.isArray(evidence.tests), "tests muss ein Array sein.");
  assert(isPlainObject(evidence.determinism), "determinism muss Objekt sein.");
}

function verifyEvidence(evidence) {
  validateEvidenceShape(evidence);

  assert(evidence.status === "passed", `Evidence status ist nicht passed: ${String(evidence.status)}`);
  assert(
    evidence.gateDecision === "pass_and_deny_paths_verified",
    `gateDecision ist nicht verifiziert: ${String(evidence.gateDecision)}`
  );

  const failed = evidence.tests.filter((test) => test?.status !== "passed");
  assert(failed.length === 0, `Fehlgeschlagene Tests im Evidence: ${failed.map((x) => x?.script).join(", ")}`);

  assert(
    evidence.determinism.consistent === true,
    `Determinismus nicht konsistent: ${String(evidence.determinism.consistent)}`
  );
}

async function main() {
  const root = process.cwd();
  const explicitPathArg = process.argv.find((arg) => arg.startsWith("--path="));
  const explicitPath = explicitPathArg ? explicitPathArg.slice("--path=".length) : "";
  const evidencePath = await resolveEvidencePath(root, explicitPath);
  const raw = await readFile(evidencePath, "utf8");
  const parsed = JSON.parse(raw);

  verifyEvidence(parsed);
  console.log(`[EVIDENCE] VERIFIED ${evidencePath}`);
}

await main();
