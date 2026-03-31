import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  archiveTask,
  collectChangedFiles,
  docsV2EvidencePath,
  loadOpenTasks,
  taskMatchesChangeSet,
  writeJson
} from "./docs-v2-shared.mjs";

const root = process.cwd();

async function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      stdio: "inherit"
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} failed with exit code ${code}`));
    });
  });
}

async function main() {
  const changedFiles = await collectChangedFiles(root);
  const openTasks = await loadOpenTasks(root);
  const archived = [];

  for (const task of openTasks) {
    const match = taskMatchesChangeSet(task, changedFiles);
    if (!match.matched) {
      continue;
    }
    const archivedTask = await archiveTask(root, task, {
      archived_at: new Date().toISOString(),
      archive_reason: "scope matched current change set",
      archive_changed_files: changedFiles
    });
    archived.push({
      task_id: archivedTask.task_id,
      archived_path: archivedTask.file_path,
      touched_paths: match.touched_paths
    });
  }

  await mkdir(path.dirname(docsV2EvidencePath(root)), { recursive: true });
  await writeJson(docsV2EvidencePath(root), {
    generated_at: new Date().toISOString(),
    changed_files: changedFiles,
    archived_tasks: archived
  });

  await runNodeScript("dev/tools/runtime/sync-tem-control-files.mjs", ["--write"]);
  await runNodeScript("dev/tools/runtime/sync-docs-v2.mjs", ["--write"]);
  await runNodeScript("dev/tools/runtime/sync-string-matrix.mjs", ["--write"]);

  console.log(`[DOCS_V2_SCAN] changed=${changedFiles.length} archived=${archived.length}`);
}

await main();
