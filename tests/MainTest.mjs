import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { strict as assert } from "node:assert";

const root = process.cwd();
const modulesDir = path.join(root, "tests", "modules");

function fail(message) {
  throw new Error(message);
}

async function loadModules() {
  const files = await readdir(modulesDir, { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile() && entry.name.endsWith(".module.mjs"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function runModule(fileName) {
  const abs = path.join(modulesDir, fileName);
  const mod = await import(pathToFileURL(abs).href);
  const test = mod?.test;
  const id = typeof mod?.id === "string" ? mod.id : fileName;
  if (typeof test !== "function") {
    fail(`[MainTest] Modul ohne test(): ${fileName}`);
  }

  const start = Date.now();
  await test({ assert, root });
  const ms = Date.now() - start;
  console.log(`[PASS] ${id} (${ms}ms)`);
}

const files = await loadModules();
if (files.length === 0) {
  fail("[MainTest] Keine Test-Module unter tests/modules gefunden.");
}

for (const fileName of files) {
  await runModule(fileName);
}

console.log(`[MainTest] ${files.length}/${files.length} Module PASS`);
