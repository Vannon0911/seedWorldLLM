import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const matrixPath = path.join(root, "docs/llm/TASK_ENTRY_MATRIX.json");
const entryPath = path.join(root, "docs/llm/ENTRY.md");
const lockPath = path.join(root, "docs/llm/entry/LLM_ENTRY_LOCK.json");
const proofDir = path.join(root, ".llm");
const sessionPath = path.join(proofDir, "entry-session.json");
const ackPath = path.join(proofDir, "entry-ack.json");

function fail(message) {
  console.error(`[LLM_PREFLIGHT][FAIL] ${message}`);
  process.exit(1);
}

function normalizeRelPath(rel) {
  if (typeof rel !== "string") {
    return "";
  }

  return rel.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function parsePaths(args) {
  const idx = args.indexOf("--paths");
  if (idx === -1 || idx + 1 >= args.length) {
    return [];
  }

  return args[idx + 1]
    .split(",")
    .map((item) => normalizeRelPath(item))
    .filter(Boolean);
}

function sha256Text(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function sha256File(absPath) {
  const content = await readFile(absPath, "utf8");
  return sha256Text(content);
}

async function readJson(absPath) {
  const text = await readFile(absPath, "utf8");
  return JSON.parse(text);
}

function matchesPrefix(relPath, prefix) {
  const p = normalizeRelPath(prefix);
  const r = normalizeRelPath(relPath);
  return r === p || r.startsWith(p);
}

function classifyScopeByPaths(paths, matrix) {
  const found = new Set();
  const entries = Object.entries(matrix);

  for (const relPath of paths) {
    for (const [scope, def] of entries) {
      const prefixes = Array.isArray(def.triggerPrefixes) ? def.triggerPrefixes : [];
      if (prefixes.some((pref) => matchesPrefix(relPath, pref))) {
        found.add(scope);
      }
    }
  }

  return [...found].sort();
}

function expandScopeDependencies(seedScopes, matrix) {
  const queue = [...seedScopes];
  const out = new Set(seedScopes);

  while (queue.length > 0) {
    const current = queue.shift();
    const deps = Array.isArray(matrix[current]?.dependsOn) ? matrix[current].dependsOn : [];

    for (const dep of deps) {
      if (!out.has(dep)) {
        out.add(dep);
        queue.push(dep);
      }
    }
  }

  return [...out].sort();
}

async function readOrderCount() {
  const content = await readFile(entryPath, "utf8");
  return content
    .split("\n")
    .filter((line) => /^\d+\.\s+/.test(line.trim()))
    .length;
}

async function validateEntryLock() {
  const lock = await readJson(lockPath);
  const currentEntryHash = await sha256File(entryPath);
  const currentReadOrderCount = await readOrderCount();

  if (lock.entryPath !== "docs/llm/ENTRY.md") {
    fail("entryPath in LLM_ENTRY_LOCK.json ist ungueltig.");
  }

  if (lock.sha256 !== currentEntryHash) {
    fail("Entry hash drift. Fuehre `node tools/llm-preflight.mjs update-lock` aus.");
  }

  if (lock.requiredReadOrderCount !== currentReadOrderCount) {
    fail("Read-order drift. Fuehre `node tools/llm-preflight.mjs update-lock` aus.");
  }
}

async function ensureTaskEntries(scopes, matrix) {
  const entries = [];

  for (const scope of scopes) {
    const requiredEntry = matrix[scope]?.requiredEntry;
    if (!requiredEntry) {
      fail(`Scope ohne requiredEntry: ${scope}`);
    }

    const abs = path.join(root, requiredEntry);
    try {
      await readFile(abs, "utf8");
    } catch {
      fail(`Fehlendes requiredEntry fuer Scope ${scope}: ${requiredEntry}`);
    }

    entries.push(requiredEntry);
  }

  return entries.sort();
}

async function hashSetForPaths(paths) {
  const out = {};

  for (const rel of paths) {
    const abs = path.join(root, rel);
    out[rel] = await sha256File(abs);
  }

  return out;
}

function sameSet(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) {
    return false;
  }

  for (const value of sa) {
    if (!sb.has(value)) {
      return false;
    }
  }

  return true;
}

async function doClassify(args) {
  const matrix = await readJson(matrixPath);
  const paths = parsePaths(args);
  if (paths.length === 0) {
    fail("--paths ist Pflicht und darf nicht leer sein.");
  }

  const seedScopes = classifyScopeByPaths(paths, matrix);
  if (seedScopes.length === 0) {
    fail("Keine Scopes fuer die gegebenen Pfade gefunden.");
  }

  const taskScope = expandScopeDependencies(seedScopes, matrix);
  console.log(JSON.stringify({ ok: true, paths, seedScopes, taskScope }, null, 2));
}

async function doEntry(args) {
  await validateEntryLock();
  const matrix = await readJson(matrixPath);
  const paths = parsePaths(args);
  if (paths.length === 0) {
    fail("--paths ist Pflicht und darf nicht leer sein.");
  }

  const seedScopes = classifyScopeByPaths(paths, matrix);
  if (seedScopes.length === 0) {
    fail("Keine Scopes fuer die gegebenen Pfade gefunden.");
  }

  const taskScope = expandScopeDependencies(seedScopes, matrix);
  const requiredEntries = await ensureTaskEntries(taskScope, matrix);

  await mkdir(proofDir, { recursive: true });
  const session = {
    version: "llm-entry-session.v1",
    createdAt: new Date().toISOString(),
    paths,
    seedScopes,
    taskScope,
    requiredEntries,
    entryHash: await sha256File(entryPath),
    pathHashes: await hashSetForPaths(paths),
    requiredEntryHashes: await hashSetForPaths(requiredEntries)
  };

  await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, sessionPath: ".llm/entry-session.json", taskScope }, null, 2));
}

async function doAck(args) {
  await validateEntryLock();
  const session = await readJson(sessionPath);
  const cliPaths = parsePaths(args);
  const paths = cliPaths.length > 0 ? cliPaths : session.paths;

  if (!sameSet(paths, session.paths)) {
    fail("Ack-Pfade passen nicht zur Session. Erst neu entry ausfuehren.");
  }

  const ack = {
    version: "llm-entry-ack.v1",
    createdAt: new Date().toISOString(),
    paths,
    pathHashes: await hashSetForPaths(paths),
    requiredEntries: session.requiredEntries,
    requiredEntryHashes: await hashSetForPaths(session.requiredEntries),
    entryHash: await sha256File(entryPath)
  };

  await writeFile(ackPath, `${JSON.stringify(ack, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, ackPath: ".llm/entry-ack.json" }, null, 2));
}

async function doCheck(args) {
  await validateEntryLock();
  const session = await readJson(sessionPath);
  const ack = await readJson(ackPath);
  const cliPaths = parsePaths(args);
  const paths = cliPaths.length > 0 ? cliPaths : session.paths;

  if (!sameSet(paths, session.paths)) {
    fail("Check-Pfade passen nicht zur Session. Erst neu classify/entry/ack ausfuehren.");
  }

  if (!sameSet(ack.paths, session.paths)) {
    fail("Ack passt nicht zur Session.");
  }

  const currentPathHashes = await hashSetForPaths(session.paths);
  for (const rel of session.paths) {
    if (ack.pathHashes[rel] !== currentPathHashes[rel]) {
      fail(`Path drift erkannt: ${rel}`);
    }
  }

  const currentEntryHash = await sha256File(entryPath);
  if (ack.entryHash !== currentEntryHash || session.entryHash !== currentEntryHash) {
    fail("Entry drift erkannt.");
  }

  const currentRequiredEntryHashes = await hashSetForPaths(session.requiredEntries);
  for (const rel of session.requiredEntries) {
    if (ack.requiredEntryHashes[rel] !== currentRequiredEntryHashes[rel]) {
      fail(`Task-Entry drift erkannt: ${rel}`);
    }
  }

  console.log(JSON.stringify({ ok: true, status: "check-pass", taskScope: session.taskScope }, null, 2));
}

async function doUpdateLock() {
  const lock = {
    version: "llm-entry-lock.v1",
    entryPath: "docs/llm/ENTRY.md",
    sha256: await sha256File(entryPath),
    requiredReadOrderCount: await readOrderCount(),
    updatedAt: new Date().toISOString()
  };

  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, lockPath: "docs/llm/entry/LLM_ENTRY_LOCK.json", lock }, null, 2));
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command) {
    fail("Befehl fehlt. Erlaubt: classify|entry|ack|check|update-lock");
  }

  if (command === "classify") return doClassify(args);
  if (command === "entry") return doEntry(args);
  if (command === "ack") return doAck(args);
  if (command === "check") return doCheck(args);
  if (command === "update-lock") return doUpdateLock();

  fail(`Unbekannter Befehl: ${command}`);
}

main().catch((error) => {
  fail(error.message);
});
