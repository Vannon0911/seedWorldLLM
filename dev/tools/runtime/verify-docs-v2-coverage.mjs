import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "./docs-v2-shared.mjs";
import { compareAlpha, listFilesRecursive, toPosixPath } from "./runtime-shared.mjs";

const root = process.cwd();

function matchesBucket(relPath, bucket) {
  for (const entry of bucket.paths || []) {
    if (entry.endsWith("/")) {
      if (relPath.startsWith(entry)) {
        return true;
      }
      continue;
    }
    if (relPath === entry) {
      return true;
    }
  }
  return false;
}

async function main() {
  const docsV2 = await readJson(path.join(root, "app", "src", "sot", "docs-v2.json"));
  const scanRoots = docsV2.fullRepoCoverage?.scanRoots || [];
  const buckets = docsV2.fullRepoCoverage?.buckets || [];
  const allFiles = [];

  for (const relRoot of scanRoots) {
    const absRoot = path.join(root, relRoot);
    const absFiles = await listFilesRecursive(absRoot);
    for (const absFile of absFiles) {
      allFiles.push(toPosixPath(path.relative(root, absFile)));
    }
  }

  allFiles.sort(compareAlpha);
  const classified = [];
  const unclassified = [];

  for (const relPath of allFiles) {
    const bucket = buckets.find((entry) => matchesBucket(relPath, entry));
    if (!bucket) {
      unclassified.push(relPath);
      continue;
    }
    classified.push({
      path: relPath,
      bucket_id: bucket.id,
      bucket_class: bucket.class
    });
  }

  const evidencePath = path.join(root, docsV2.fullRepoCoverage.evidence);
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeJson(evidencePath, {
    generated_at: new Date().toISOString(),
    scanned_files: allFiles.length,
    classified_files: classified.length,
    unclassified_files: unclassified,
    buckets: buckets.map((bucket) => ({
      id: bucket.id,
      class: bucket.class,
      count: classified.filter((item) => item.bucket_id === bucket.id).length
    }))
  });

  if (unclassified.length > 0) {
    console.error("[DOCS_V2_COVERAGE] block: files are outside Documentation 2.0 classification");
    for (const relPath of unclassified) {
      console.error(` - ${relPath}`);
    }
    process.exit(1);
  }

  console.log(`[DOCS_V2_COVERAGE] OK scanned=${allFiles.length} classified=${classified.length}`);
}

await main();
