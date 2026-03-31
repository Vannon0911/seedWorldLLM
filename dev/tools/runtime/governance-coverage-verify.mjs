import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { readJson } from "./docs-v2-shared.mjs";
import { compareAlpha, listFilesRecursive, toPosixPath } from "./runtime-shared.mjs";

const root = process.cwd();
const evidenceRel = "runtime/evidence/governance-coverage.json";
const evidenceSchemaVersion = 2;

const scanRoots = Object.freeze([
  "app/src/kernel",
  "app/src/game",
  "dev/tools/runtime",
  "dev/scripts",
  "dev/tests/modules",
  "docs/LLM",
  "Sub_Agent",
  ".githooks",
  ".github/workflows",
  ".github/rulesets"
]);

const rootFiles = Object.freeze([
  "package.json",
  "VERSION",
  "README.md",
  "app/src/sot/llm-read-contract.v1.json",
  "app/src/sot/sub-agent-manifest.v1.json"
]);

function matchesPrefix(relPath, prefix) {
  if (prefix.endsWith("/")) {
    return relPath.startsWith(prefix);
  }
  return relPath === prefix || relPath.startsWith(`${prefix}/`);
}

function classify(relPath, owners) {
  const hits = [];
  for (const owner of owners) {
    for (const prefix of owner.prefixes || []) {
      if (matchesPrefix(relPath, prefix)) {
        hits.push({
          owner: owner.name,
          prefix,
          score: prefix.length
        });
      }
    }
  }
  if (hits.length === 0) {
    return null;
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const ownerCmp = a.owner.localeCompare(b.owner, "en");
    if (ownerCmp !== 0) {
      return ownerCmp;
    }
    return a.prefix.localeCompare(b.prefix, "en");
  });
  const topScore = hits[0].score;
  const topHits = hits.filter((item) => item.score === topScore);
  const selected = topHits[0];
  return {
    owner: selected.owner,
    matched_prefix: selected.prefix,
    ambiguous_with: topHits.slice(1).map((item) => ({ owner: item.owner, prefix: item.prefix }))
  };
}

async function main() {
  const writeMode = process.argv.includes("--write");
  const boundaries = await readJson(path.join(root, "app", "src", "sot", "repo-boundaries.json"));
  const owners = boundaries.owners || [];
  const files = [];

  for (const relRoot of scanRoots) {
    const absRoot = path.join(root, relRoot);
    let absFiles;
    try {
      absFiles = await listFilesRecursive(absRoot);
    } catch (error) {
      const code = String(error?.code || "");
      if (code === "ENOENT") {
        throw new Error(`[GOVERNANCE_COVERAGE] missing mandatory scan root: ${relRoot}`);
      }
      throw new Error(`[GOVERNANCE_COVERAGE] cannot read scan root '${relRoot}': ${String(error?.message || error)}`);
    }
    for (const absFile of absFiles) {
      files.push(toPosixPath(path.relative(root, absFile)));
    }
  }

  for (const relPath of rootFiles) {
    files.push(toPosixPath(relPath));
  }

  const uniqueFiles = [...new Set(files)].sort(compareAlpha);
  const classified = [];
  const unclassified = [];
  const ambiguous = [];

  for (const relPath of uniqueFiles) {
    const classification = classify(relPath, owners);
    if (!classification) {
      unclassified.push(relPath);
      continue;
    }
    if ((classification.ambiguous_with || []).length > 0) {
      ambiguous.push({
        path: relPath,
        resolved_owner: classification.owner,
        resolved_prefix: classification.matched_prefix,
        alternatives: classification.ambiguous_with
      });
    }
    classified.push({
      path: relPath,
      owner: classification.owner,
      matched_prefix: classification.matched_prefix
    });
  }

  const ownerSummary = owners
    .map((owner) => ({
      owner: owner.name,
      count: classified.filter((item) => item.owner === owner.name).length
    }))
    .filter((entry) => entry.count > 0);

  const expectedEvidence = {
    schema_version: evidenceSchemaVersion,
    scanned_count: uniqueFiles.length,
    scanned_files: uniqueFiles.length,
    classified_count: classified.length,
    classified_items: classified,
    owner_summary: ownerSummary,
    ambiguous_files: ambiguous,
    unclassified_files: unclassified
  };
  const evidencePath = path.join(root, evidenceRel);
  if (writeMode) {
    await writeFile(
      evidencePath,
      `${JSON.stringify({ generated_at: new Date().toISOString(), ...expectedEvidence }, null, 2)}\n`,
      "utf8"
    );
  }
  const issues = [];
  let evidence = null;
  try {
    evidence = await readJson(evidencePath);
  } catch (error) {
    issues.push(`[EVIDENCE_MISSING] ${evidenceRel}: ${String(error?.message || error)}`);
  }

  if (evidence) {
    const { generated_at: generatedAt, ...stableEvidence } = evidence;
    if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
      issues.push(`[EVIDENCE_TIMESTAMP] ${evidenceRel} missing or invalid generated_at`);
    }
    if (!isDeepStrictEqual(stableEvidence, expectedEvidence)) {
      issues.push(`[EVIDENCE_DRIFT] ${evidenceRel} does not match computed governance coverage`);
    }
  }

  if (ambiguous.length > 0) {
    issues.push("ambiguous ownership matches in governance scope");
  }

  if (unclassified.length > 0) {
    issues.push("unclassified files in governance scope");
  }

  if (issues.length > 0) {
    console.error("[GOVERNANCE_COVERAGE] BLOCK");
    for (const issue of issues) {
      console.error(` - ${issue}`);
    }
    if (ambiguous.length > 0) {
      for (const item of ambiguous) {
        const alternatives = item.alternatives.map((alt) => `${alt.owner}:${alt.prefix}`).join(", ");
        console.error(`   * ${item.path} -> resolved=${item.resolved_owner}:${item.resolved_prefix} alternatives=${alternatives}`);
      }
    }
    if (unclassified.length > 0) {
      for (const relPath of unclassified) {
        console.error(`   * ${relPath}`);
      }
    }
    process.exit(1);
  }

  console.log(`[GOVERNANCE_COVERAGE] OK scanned=${uniqueFiles.length} classified=${classified.length}`);
}

await main();
