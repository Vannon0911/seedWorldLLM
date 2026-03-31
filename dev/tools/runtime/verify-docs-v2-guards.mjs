import path from "node:path";
import {
  collectChangedFiles,
  loadArchivedTasks,
  loadOpenTasks,
  readJson
} from "./docs-v2-shared.mjs";

const root = process.cwd();

function isJsonTask(relPath) {
  return relPath.startsWith("tem/tasks/open/") || relPath.startsWith("tem/tasks/archive/");
}

function isPlanCandidate(relPath, docsV2) {
  if (!relPath.endsWith(".md") && !relPath.endsWith(".json")) {
    return false;
  }
  if (isJsonTask(relPath)) {
    return false;
  }
  if ((docsV2.humanPlanViews || []).includes(relPath)) {
    return false;
  }
  if ((docsV2.registeredControlFiles || []).includes(relPath)) {
    return false;
  }
  return relPath.startsWith("tem/") || relPath.startsWith("docs/IN PLANUNG/");
}

function addRegistered(set, relPath) {
  if (typeof relPath === "string" && relPath.trim()) {
    set.add(relPath);
  }
}

function addBucketPaths(set, bucket) {
  for (const relPath of bucket?.paths || []) {
    addRegistered(set, relPath);
  }
}

function isRegisteredPath(relPath, registered) {
  if (registered.has(relPath)) {
    return true;
  }
  for (const candidate of registered) {
    if (candidate.endsWith("/") && relPath.startsWith(candidate)) {
      return true;
    }
  }
  return false;
}

async function main() {
  const docsV2 = await readJson(path.join(root, "app", "src", "sot", "docs-v2.json"));
  const [openTasks, archivedTasks] = await Promise.all([loadOpenTasks(root), loadArchivedTasks(root)]);
  const changedFiles = await collectChangedFiles(root);
  const registered = new Set();

  for (const relPath of docsV2.registeredControlFiles || []) {
    addRegistered(registered, relPath);
  }
  for (const relPath of docsV2.generatedDocs || []) {
    addRegistered(registered, relPath);
  }
  for (const bucket of docsV2.fullRepoCoverage?.buckets || []) {
    addBucketPaths(registered, bucket);
  }
  for (const task of [...openTasks, ...archivedTasks]) {
    addRegistered(registered, task.file_path);
    addRegistered(registered, task.archived_from);
    for (const relPath of task.scope_paths || []) {
      addRegistered(registered, relPath);
    }
    for (const relPath of task.source_docs || []) {
      addRegistered(registered, relPath);
    }
  }

  const planViolations = changedFiles.filter((relPath) => isPlanCandidate(relPath, docsV2));
  const unregistered = changedFiles.filter((relPath) => !isRegisteredPath(relPath, registered));

  if (planViolations.length > 0 || unregistered.length > 0) {
    if (planViolations.length > 0) {
      console.error("[DOCS_V2_PLAN_GUARD] block: plan file still exists outside atomic task path");
      for (const relPath of planViolations) {
        console.error(` - ${relPath}`);
      }
      console.error("[DOCS_V2_PLAN_GUARD] action: delete the plan file or decompose it into tem/tasks/open/*.json");
    }
    if (unregistered.length > 0) {
      console.error("[DOCS_V2_REGISTRY_GUARD] block: changed file is not registered in Documentation 2.0");
      for (const relPath of unregistered) {
        console.error(` - ${relPath}`);
      }
      console.error("[DOCS_V2_REGISTRY_GUARD] action: register the file via docs-v2 control files or task scope/source paths before the testline may pass");
    }
    process.exit(1);
  }

  console.log(`[DOCS_V2_GUARD] OK changed=${changedFiles.length} registered=${registered.size}`);
}

await main();
