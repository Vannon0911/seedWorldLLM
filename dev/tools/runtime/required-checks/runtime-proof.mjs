import { createHash } from "node:crypto";

import { mkdir, writeFile } from "node:fs/promises";

import path from "node:path";



function digestText(text) {

  return createHash("sha256").update(text).digest("hex");

}



export async function buildEvidenceSummary(root, sha256File) {

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



export function buildContractHash({ report, pipeline }) {

  const payload = {

    policy: report.policy,

    run_mode: report.run_mode,

    step_contract: report.execution?.step_contract || "",

    sync_steps: pipeline.filter((item) => item.type === "sync").map((item) => item.id),

    verify_steps: pipeline.filter((item) => item.type === "verify").map((item) => item.id)

  };

  return digestText(JSON.stringify(payload));

}



export async function buildSotHashes(root, proofFiles, sha256File) {

  const hashes = [];

  for (const relPath of proofFiles) {

    const absPath = path.join(root, relPath);

    const sha256 = await sha256File(absPath);

    hashes.push({ path: relPath, sha256 });

  }

  return hashes;

}



export async function writeProofManifest({

  root,

  report,

  evidenceSummary,

  sotHashes,

  findingsEvidenceRel,

  coverageRel,

  proofManifestPath,

  claimRule,

  sha256File

}) {

  const manifestPath = path.join(root, proofManifestPath);

  await mkdir(path.dirname(manifestPath), { recursive: true });

  const contractHash = report.contract_hash || digestText(`${report.policy}:${report.run_mode}`);

  const manifest = {

    schema_version: 1,

    policy: report.policy,

    contract_hash: contractHash,

    generated_at: new Date().toISOString(),

    run_mode: report.run_mode,

    repo: report.repo,

    gate_results: report.steps.map((step) => ({

      id: step.id,

      status: step.status,

      output_sha256: step.output_sha256

    })),

    proof: {

      evidence: evidenceSummary,

      sot: sotHashes,

      governance_findings: {

        path: findingsEvidenceRel,

        sha256: await sha256File(path.join(root, findingsEvidenceRel))

      },

      governance_coverage: {

        path: coverageRel,

        sha256: await sha256File(path.join(root, coverageRel))

      },

      governance_modularity: {

        path: "runtime/evidence/governance-modularity.json",

        sha256: await sha256File(path.join(root, "runtime/evidence/governance-modularity.json"))

      }

    },

    zero_trust: {

      all_verify_steps_passed: report.steps.every((step) => step.status === "PASSED"),

      claim_rule: claimRule

    }

  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {

    path: proofManifestPath,

    sha256: await sha256File(manifestPath)

  };

}



export async function writeReport(reportPath, report, explicitSyncMode) {

  await mkdir(path.dirname(reportPath), { recursive: true });

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

}



export async function main() {
  console.log("[RUNTIME_PROOF] Module verification started");
  // Basic self-test to verify module loads correctly
  const testHash = digestText("test");
  if (typeof testHash !== "string" || testHash.length !== 64) {
    throw new Error("digestText function not working correctly");
  }
  console.log("[RUNTIME_PROOF] Module verification passed");
  return { status: "ok", module: "runtime-proof" };
}
