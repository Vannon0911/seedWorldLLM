import http from "node:http";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import { executeKernelCommand } from "../src/kernel/interface.js";
import { classifyPatchRisk, parseUniversalPatch, snapshotFiles, validateAgainstLocks } from "./patchUtils.js";
import { handleStaticRequest } from "./staticHandler.mjs";
import {
  handleCancel,
  handleCreateSession,
  handleEvents,
  handleLogs,
  handleResult,
  handleStatus
} from "./sessionRoutes.mjs";

const ROOT = process.cwd();
const PORT = Number(process.env.PATCH_PORT || 3000);
const STATE_DIR = path.join(ROOT, ".patch-manager");
const BACKUP_DIR = path.join(STATE_DIR, "backups");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const LOG_FILE = path.join(STATE_DIR, "log.jsonl");
const SESSION_FILE = path.join(STATE_DIR, "active-session.json");
const MANIFEST_SCHEMA_FILE = path.join(ROOT, "src", "sot", "patches.schema.json");
const SAFE_PATCH_ROOT = ROOT;
const STATIC_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

const ALLOWED_CMD_PREFIXES = (process.env.PATCH_ALLOWED_COMMANDS || "npm test,npm run sync:docs")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const FORBIDDEN_COMMAND_CHARS = /[;|`&<>$()]/;
const DEFAULT_ALLOWED_FILE_PREFIXES = [
  "src/",
  "docs/",
  "src/sot/",
  "src/llm/",
  "tests/",
  "tools/",
  "public/",
  "server/",
  "README.md",
  "package.json",
  "server/patchServer.mjs",
  "patches.json"
];
const PROTECTED_GATE_FILES = new Set([
  "src/kernel/store/applyPatches.js",
  "src/kernel/store/createStore.js",
  "src/kernel/llmGovernance.js",
  "tools/runtime/preflight.mjs",
  "tools/llm-preflight.mjs",
  "src/llm/llm-gate-policy.json",
  "server/patchUtils.js"
]);

const state = {
  manifest: null,
  status: {
    mode: "idle",
    total: 0,
    success: 0,
    failed: 0,
    runningId: "-",
    percent: 0,
    patches: [],
    lastRunId: null,
    cancelRequested: false
  },
  log: [],
  history: [],
  sseClients: new Set(),
  serverSessionId: null,
  pendingExecutions: new Map()
};

function nowIso() {
  return new Date().toISOString();
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendError(res, code, message, details = null) {
  json(res, code, { error: message, details });
}

async function ensureDirs() {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

function pushLog(event, payload = {}) {
  const entry = { event, time: nowIso(), payload };
  state.log.push(entry);
  if (state.log.length > 1000) {
    state.log.shift();
  }
  fs.appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8").catch(() => {});
  emitSse(event, payload);
}

function emitSse(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of state.sseClients) {
    try {
      res.write(data);
    } catch {
      state.sseClients.delete(res);
    }
  }
}

async function persistState() {
  const safe = {
    manifest: state.manifest,
    status: state.status,
    history: state.history.slice(-100)
  };
  await fs.writeFile(STATE_FILE, JSON.stringify(safe, null, 2), "utf8");
}

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.manifest = parsed.manifest || null;
      state.status = parsed.status || state.status;
      state.history = Array.isArray(parsed.history) ? parsed.history : [];
    }
  } catch {}
}

async function activateServerSession() {
  const session = {
    id: randomUUID(),
    pid: process.pid,
    startedAt: nowIso()
  };
  state.serverSessionId = session.id;
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), "utf8");
}

async function clearServerSession() {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf8");
    const current = JSON.parse(raw);
    if (current && current.id === state.serverSessionId) {
      await fs.unlink(SESSION_FILE);
    }
  } catch {}
}

async function assertWriteSessionActive() {
  if (!state.serverSessionId) {
    throw new Error("Patch-Modul nicht aktiv: keine Server-Session.");
  }
  let raw = "";
  try {
    raw = await fs.readFile(SESSION_FILE, "utf8");
  } catch {
    throw new Error("Patch-Modul nicht aktiv: Session-Datei fehlt.");
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Patch-Modul nicht aktiv: Session-Datei ungueltig.");
  }
  if (!parsed || parsed.id !== state.serverSessionId) {
    throw new Error("Patch-Modul nicht aktiv: Session nicht gueltig.");
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function requireManifestShape(manifest) {
  if (!isPlainObject(manifest)) {
    throw new Error("Manifest muss Objekt sein.");
  }
  if (!isPlainObject(manifest.meta)) {
    throw new Error("meta fehlt oder ist ungueltig.");
  }
  if (!Array.isArray(manifest.patches) || manifest.patches.length === 0) {
    throw new Error("patches fehlt oder ist leer.");
  }

  const ids = new Set();
  const allowedPrefixes = readAllowedPrefixes(manifest);
  const allowProtectedTargets = manifest.meta?.gates?.allowProtectedTargets === true;
  for (const patch of manifest.patches) {
    if (!isPlainObject(patch)) {
      throw new Error("Patch-Eintrag muss Objekt sein.");
    }
    if (typeof patch.id !== "string" || !patch.id.trim()) {
      throw new Error("Patch id fehlt.");
    }
    if (ids.has(patch.id)) {
      throw new Error(`Doppelte Patch id: ${patch.id}`);
    }
    ids.add(patch.id);
    if (typeof patch.type !== "string" || !patch.type.trim()) {
      throw new Error(`Patch type fehlt: ${patch.id}`);
    }
    if (!["string-replace", "file-create", "file-append", "file-replace", "json-update", "run-command"].includes(patch.type)) {
      throw new Error(`Patch type nicht erlaubt: ${patch.type}`);
    }
    if (patch.type !== "run-command") {
      if (typeof patch.file !== "string" || !patch.file.trim()) {
        throw new Error(`Patch file fehlt: ${patch.id}`);
      }
      await resolvePatchPath(patch.file, { mustExist: false });
      assertPatchFileAllowed(patch.file, allowedPrefixes, allowProtectedTargets);
    }
  }
}

function readAllowedPrefixes(manifest) {
  const configured = manifest.meta?.gates?.allowedFilePrefixes;
  if (!Array.isArray(configured) || configured.length === 0) {
    return DEFAULT_ALLOWED_FILE_PREFIXES;
  }
  return configured
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => x.trim().replace(/\\/g, "/"));
}

function normalizeRelFile(file) {
  const raw = String(file || "").trim();
  if (!raw) {
    return "";
  }

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new Error(`Ungueltiger Dateipfad-Encoding: ${raw}`);
  }

  if (decoded.includes("\0")) {
    throw new Error(`Ungueltiger Dateipfad: ${raw}`);
  }

  const normalized = decoded.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  if (segments.some((seg) => seg === "." || seg === "..")) {
    throw new Error(`Ungueltiger Dateipfad: ${raw}`);
  }
  return segments.join("/");
}

function assertPatchFileAllowed(file, allowedPrefixes, allowProtectedTargets) {
  const rel = normalizeRelFile(file);
  const allowed = allowedPrefixes.some((prefix) => {
    const p = normalizeRelFile(prefix);
    return rel === p || rel.startsWith(p);
  });
  if (!allowed) {
    throw new Error(`Patch-Ziel ausserhalb Whitelist: ${rel}`);
  }

  if (!allowProtectedTargets && PROTECTED_GATE_FILES.has(rel)) {
    throw new Error(`Patch-Ziel ist geschuetzte Gate-Datei: ${rel}`);
  }
}

function assertInsideSafeRoot(absPath, label) {
  const resolvedRoot = path.resolve(SAFE_PATCH_ROOT);
  const resolvedPath = path.resolve(absPath);
  const safeRootPrefix = `${resolvedRoot}${path.sep}`;
  if (!(resolvedPath === resolvedRoot || resolvedPath.startsWith(safeRootPrefix))) {
    throw new Error(`${label} ausserhalb Projekt: ${resolvedPath}`);
  }
}

async function findExistingParent(absPath) {
  let current = path.resolve(absPath);
  while (true) {
    if (await fileExists(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Kein gueltiger Pfad-Anker gefunden: ${absPath}`);
    }
    current = parent;
  }
}

async function resolvePatchPath(relFile, options = {}) {
  if (typeof relFile !== "string") {
    throw new Error("Dateipfad muss String sein.");
  }
  const normalized = normalizeRelFile(relFile);
  if (!normalized) {
    throw new Error(`Ungueltiger Dateipfad: ${relFile}`);
  }

  const abs = path.resolve(SAFE_PATCH_ROOT, normalized);
  assertInsideSafeRoot(abs, "Dateipfad");

  const mustExist = options.mustExist === true;
  const exists = await fileExists(abs);

  if (exists) {
    const realTarget = await fs.realpath(abs);
    assertInsideSafeRoot(realTarget, "realpath");
    return abs;
  }

  if (mustExist) {
    throw new Error(`Datei nicht gefunden: ${relFile}`);
  }

  const existingParent = await findExistingParent(path.dirname(abs));
  const realParent = await fs.realpath(existingParent);
  assertInsideSafeRoot(realParent, "realpath");
  return abs;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (chunks.reduce((n, b) => n + b.length, 0) > 5_000_000) {
      throw new Error("Request body zu gross.");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function fileExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

function countLineDelta(beforeText, afterText) {
  const a = beforeText.split("\n").length;
  const b = afterText.split("\n").length;
  const delta = b - a;
  return { beforeLines: a, afterLines: b, delta };
}

async function checksumFile(absPath) {
  const data = await fs.readFile(absPath);
  return createHash("sha256").update(data).digest("hex");
}

function parseRegex(value) {
  if (typeof value !== "string") {
    return null;
  }
  const m = value.match(/^\/(.*)\/([gimsuy]*)$/);
  if (!m) {
    return null;
  }
  return new RegExp(m[1], m[2] || "g");
}

function deepMerge(base, updates) {
  if (!isPlainObject(base) || !isPlainObject(updates)) {
    return updates;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(updates)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function executeCommand(command, cwd = ROOT) {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("run-command: command fehlt.");
  }

  if (FORBIDDEN_COMMAND_CHARS.test(command) || /\r|\n/.test(command)) {
    throw new Error("run-command blockiert: enthaelt verbotene Zeichen.");
  }

  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) {
    throw new Error("run-command: keine Tokens gefunden.");
  }

  const allowedPrefixTokens = ALLOWED_CMD_PREFIXES.map((prefix) => tokenizeCommand(prefix));
  const allowed = allowedPrefixTokens.some((prefixTokens) => {
    if (tokens.length < prefixTokens.length) {
      return false;
    }
    for (let i = 0; i < prefixTokens.length; i += 1) {
      if (tokens[i] !== prefixTokens[i]) {
        return false;
      }
    }
    return true;
  });
  if (!allowed) {
    throw new Error(`run-command blockiert. Erlaubte Prefixe: ${ALLOWED_CMD_PREFIXES.join(", ")}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(tokens[0], tokens.slice(1), { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("run-command timeout"));
    }, 30_000);

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject(new Error(`run-command exit ${code}: ${stderr || stdout}`));
      }
    });
  });
}

function tokenizeCommand(input) {
  const out = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (quote === "\"" && ch === "\\" && i + 1 < input.length) {
        i += 1;
        current += input[i];
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    if (ch === "\\") {
      if (i + 1 < input.length) {
        i += 1;
        current += input[i];
      }
      continue;
    }
    current += ch;
  }

  if (quote) {
    throw new Error("run-command blockiert: ungueltiges quoting.");
  }
  if (current) {
    out.push(current);
  }
  return out;
}

function isLikelyPatchConflict(message) {
  if (typeof message !== "string") {
    return false;
  }
  return [
    "string-replace: kein Treffer fuer find.",
    "file-create: Datei existiert bereits.",
    "Patch-Ziel ausserhalb Whitelist:",
    "Patch-Ziel ist geschuetzte Gate-Datei:",
    "Datei nicht gefunden:",
    "json-field mismatch"
  ].some((needle) => message.includes(needle));
}

async function backupTarget(runId, patchId, relFile) {
  const normalizedRelFile = normalizeRelFile(relFile);
  const targetAbs = await resolvePatchPath(normalizedRelFile, { mustExist: false });
  const backupAbs = path.join(BACKUP_DIR, runId, patchId, normalizedRelFile);
  await fs.mkdir(path.dirname(backupAbs), { recursive: true });

  const existedBefore = await fileExists(targetAbs);
  if (existedBefore) {
    await fs.copyFile(targetAbs, backupAbs);
  }

  return {
    file: normalizedRelFile,
    targetAbs,
    existedBefore,
    backupAbs: existedBefore ? backupAbs : null
  };
}

async function applyOnePatch(runId, patch) {
  const startedAt = nowIso();
  const detail = {
    id: patch.id,
    name: patch.name,
    type: patch.type,
    file: patch.file || null,
    startedAt,
    status: "running"
  };

  const patchResult = {
    ...detail,
    sizeBefore: null,
    sizeAfter: null,
    lineDelta: null,
    changePreview: null,
    verify: null,
    backup: null,
    endedAt: null
  };

  if (patch.type === "run-command") {
    const cmdResult = await executeCommand(patch.command, ROOT);
    patchResult.changePreview = {
      command: patch.command,
      stdout: cmdResult.stdout.slice(0, 2000),
      stderr: cmdResult.stderr.slice(0, 2000)
    };
  } else {
    const backup = await backupTarget(runId, patch.id, patch.file);
    patchResult.backup = backup;

    const targetAbs = backup.targetAbs;
    const beforeExists = await fileExists(targetAbs);
    const beforeText = beforeExists ? await fs.readFile(targetAbs, "utf8") : "";
    const sizeBefore = beforeExists ? Buffer.byteLength(beforeText, "utf8") : 0;

    let afterText = beforeText;

    if (patch.type === "string-replace") {
      if (typeof patch.find !== "string") {
        throw new Error("string-replace: find fehlt.");
      }
      if (typeof patch.replace !== "string") {
        throw new Error("string-replace: replace fehlt.");
      }
      const regex = parseRegex(patch.find);
      if (regex) {
        afterText = beforeText.replace(regex, patch.replace);
      } else {
        afterText = beforeText.replaceAll(patch.find, patch.replace);
      }
      if (afterText === beforeText) {
        throw new Error("string-replace: kein Treffer fuer find.");
      }
      await fs.writeFile(targetAbs, afterText, "utf8");
      patchResult.changePreview = {
        find: patch.find,
        replace: patch.replace
      };
    } else if (patch.type === "file-create") {
      if (typeof patch.content !== "string") {
        throw new Error("file-create: content fehlt.");
      }
      if (beforeExists) {
        throw new Error("file-create: Datei existiert bereits.");
      }
      afterText = patch.content;
      await fs.mkdir(path.dirname(targetAbs), { recursive: true });
      await fs.writeFile(targetAbs, afterText, "utf8");
    } else if (patch.type === "file-append") {
      if (typeof patch.content !== "string") {
        throw new Error("file-append: content fehlt.");
      }
      afterText = `${beforeText}${patch.content}`;
      await fs.writeFile(targetAbs, afterText, "utf8");
    } else if (patch.type === "file-replace") {
      if (typeof patch.content !== "string") {
        throw new Error("file-replace: content fehlt.");
      }
      afterText = patch.content;
      await fs.writeFile(targetAbs, afterText, "utf8");
    } else if (patch.type === "json-update") {
      if (!isPlainObject(patch.updates)) {
        throw new Error("json-update: updates fehlt/ungueltig.");
      }
      const current = beforeText.trim() ? JSON.parse(beforeText) : {};
      const merged = deepMerge(current, patch.updates);
      afterText = `${JSON.stringify(merged, null, 2)}\n`;
      await fs.writeFile(targetAbs, afterText, "utf8");
      patchResult.changePreview = { updates: patch.updates };
    }

    const sizeAfter = Buffer.byteLength(afterText, "utf8");
    patchResult.sizeBefore = sizeBefore;
    patchResult.sizeAfter = sizeAfter;
    patchResult.lineDelta = countLineDelta(beforeText, afterText);
  }

  patchResult.verify = patch.verify ? await verifyPatch(patch.verify) : { ok: true, type: "none" };
  patchResult.status = patchResult.verify.ok ? "success" : "failed";
  patchResult.endedAt = nowIso();

  if (!patchResult.verify.ok) {
    throw new Error(`verify fehlgeschlagen: ${patchResult.verify.message || "unknown"}`);
  }

  return patchResult;
}

async function verifyPatch(verify) {
  if (!isPlainObject(verify)) {
    return { ok: true, type: "none" };
  }

  const type = verify.type;
  const file = verify.file;
  const abs = await resolvePatchPath(file, { mustExist: true });

  if (type === "contains") {
    const text = await fs.readFile(abs, "utf8");
    const ok = typeof verify.text === "string" && text.includes(verify.text);
    return {
      ok,
      type,
      expected: verify.text,
      actual: ok ? "contains" : "missing",
      message: ok ? "ok" : "Text nicht gefunden"
    };
  }

  if (type === "file-exists") {
    const ok = await fileExists(abs);
    return { ok, type, message: ok ? "ok" : "Datei fehlt" };
  }

  if (type === "json-field") {
    const raw = await fs.readFile(abs, "utf8");
    const parsed = JSON.parse(raw);
    const parts = String(verify.field || "").split(".").filter(Boolean);
    let cur = parsed;
    for (const part of parts) {
      if (!cur || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = cur[part];
    }
    const ok = JSON.stringify(cur) === JSON.stringify(verify.expectedValue);
    return {
      ok,
      type,
      expected: verify.expectedValue,
      actual: cur,
      message: ok ? "ok" : "json-field mismatch"
    };
  }

  if (type === "file-checksum") {
    const hash = await checksumFile(abs);
    const ok = hash === verify.checksum;
    return {
      ok,
      type,
      expected: verify.checksum,
      actual: hash,
      message: ok ? "ok" : "checksum mismatch"
    };
  }

  if (type === "run-command") {
    try {
      await executeCommand(String(verify.command || ""), ROOT);
      return { ok: true, type, message: "ok" };
    } catch (error) {
      return { ok: false, type, message: String(error.message || error) };
    }
  }

  return { ok: false, type: String(type || "unknown"), message: "verify type ungueltig" };
}

async function updateTraceLockAfterPatch(execution) {
  const lockPath = path.join(ROOT, "docs/trace-lock.json");
  let lock = null;
  try {
    lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  } catch {
    return { ok: false, reason: "trace-lock nicht lesbar" };
  }
  if (!isPlainObject(lock)) {
    return { ok: false, reason: "trace-lock ungueltig" };
  }
  if (!isPlainObject(lock.files)) {
    lock.files = {};
  }

  const changed = [];
  const files = Array.isArray(execution?.affectedFiles) ? execution.affectedFiles : [];
  for (const rel of files) {
    const normalized = normalizeRelFile(rel);
    const abs = await resolvePatchPath(normalized, { mustExist: false });
    if (!(await fileExists(abs))) {
      continue;
    }
    const text = await fs.readFile(abs, "utf8");
    lock.files[normalized] = {
      sha256: createHash("sha256").update(text, "utf8").digest("hex"),
      lines: text.split("\n").length,
      patchId: String(execution.patchId || "execute"),
      riskLevel: String(execution.riskLevel || "unknown"),
      updatedAt: nowIso()
    };
    changed.push(normalized);
  }

  await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  pushLog("lock.updated", {
    patchId: execution?.patchId || "execute",
    count: changed.length,
    files: changed
  });
  return { ok: true, files: changed };
}

async function executeParsedPatch(parsed, options = {}) {
  const runId = randomUUID();
  if (parsed.kind === "kernel-patch") {
    const plan = await executeKernelCommand("patch.plan", parsed.envelope || { patched: true, patch: parsed.patch });
    let applyResult = null;
    if (plan?.status === "needs_confirmation") {
      if (!options.approved) {
        return {
          mode: "pending-confirmation",
          runId,
          needsConfirmation: true,
          confirmationToken: plan.confirmationToken,
          analysis: plan.analysis || null
        };
      }
      applyResult = await executeKernelCommand("patch.apply", {
        patched: true,
        patch: parsed.patch,
        confirmation: { token: plan.confirmationToken, accept: true }
      });
    } else {
      applyResult = await executeKernelCommand("patch.apply", {
        patched: true,
        patch: parsed.patch
      });
    }
    return {
      mode: "applied",
      runId,
      result: applyResult,
      affectedFiles: parsed.affectedFiles || []
    };
  }

  if (parsed.kind === "browser-patch") {
    const patch = {
      ...parsed.patch,
      id: parsed.patch.id || `execute-${Date.now()}`,
      name: parsed.patch.name || "execute-browser-patch"
    };
    const result = await applyOnePatch(runId, patch);
    return {
      mode: "applied",
      runId,
      result,
      affectedFiles: parsed.affectedFiles || []
    };
  }

  if (parsed.kind === "browser-manifest") {
    const patches = parsed.patches || [];
    const results = [];
    for (let i = 0; i < patches.length; i += 1) {
      const patch = {
        ...patches[i],
        id: patches[i].id || `execute-${i + 1}`,
        name: patches[i].name || `execute-${i + 1}`
      };
      pushLog("patch-progress", { runId, patchId: patch.id, index: i + 1, total: patches.length });
      const result = await applyOnePatch(runId, patch);
      results.push(result);
      pushLog("patch-success", result);
    }
    return {
      mode: "applied",
      runId,
      result: results,
      affectedFiles: parsed.affectedFiles || []
    };
  }

  throw new Error(`executeParsedPatch: ungueltiger Patch-Typ ${parsed.kind}`);
}

async function runPatchQueue(options = {}) {
  await assertWriteSessionActive();
  const manifest = state.manifest;
  if (!manifest) {
    throw new Error("Kein Manifest geladen.");
  }
  if (state.status.mode === "running") {
    throw new Error("Patch-Run laeuft bereits.");
  }

  const runId = randomUUID();
  const patches = manifest.patches;
  const continueOnError = options.continueOnError !== false;
  const gates = {
    runPreflightBefore: manifest.meta?.gates?.runPreflightBefore === true,
    runPreflightAfter: manifest.meta?.gates?.runPreflightAfter === true,
    beforeCommands: Array.isArray(manifest.meta?.gates?.beforeCommands) ? manifest.meta.gates.beforeCommands : [],
    afterCommands: Array.isArray(manifest.meta?.gates?.afterCommands) ? manifest.meta.gates.afterCommands : [],
    softFailCommands:
      options.softFailCommands === true || manifest.meta?.gates?.softFailCommands === true,
    softFailPreflight:
      options.softFailPreflight === true || manifest.meta?.gates?.softFailPreflight === true
  };

  const runGateCommand = async (stage, command, softFail) => {
    try {
      await executeCommand(command, ROOT);
      pushLog("gate-check", { stage, command, ok: true, mode: "strict" });
      return true;
    } catch (error) {
      const message = String(error.message || error);
      if (!softFail) {
        throw error;
      }
      pushLog("gate-warning", { stage, command, ok: false, mode: "soft-fail", message });
      return false;
    }
  };

  if (gates.runPreflightBefore) {
    await runGateCommand("before", "node tools/runtime/preflight.mjs", gates.softFailPreflight);
  }
  for (const command of gates.beforeCommands) {
    await runGateCommand("before", command, gates.softFailCommands);
  }

  state.status = {
    mode: "running",
    total: patches.length,
    success: 0,
    failed: 0,
    runningId: "-",
    percent: 0,
    patches: patches.map((p) => ({ id: p.id, name: p.name, state: "pending", file: p.file || null })),
    lastRunId: runId,
    cancelRequested: false,
    options: {
      verifyAfterEach: options.verifyAfterEach !== false,
      compareChecksums: options.compareChecksums === true,
      continueOnError,
      autoRefreshGame: options.autoRefreshGame === true,
      gates
    }
  };
  await persistState();
  pushLog("patch-started", { runId, total: patches.length });

  const runHistory = {
    runId,
    startedAt: nowIso(),
    endedAt: null,
    options: state.status.options,
    entries: []
  };

  for (let i = 0; i < patches.length; i += 1) {
    const patch = patches[i];
    const statusItem = state.status.patches[i];

    if (state.status.cancelRequested) {
      statusItem.state = "cancelled";
      state.status.mode = "cancelled";
      pushLog("cancelled", { runId, patchId: patch.id });
      break;
    }

    statusItem.state = "running";
    state.status.runningId = patch.id;
    state.status.percent = Math.round((i / patches.length) * 100);
    await persistState();
    pushLog("patch-progress", { runId, patchId: patch.id, index: i + 1, total: patches.length });

    try {
      const result = await applyOnePatch(runId, patch);
      runHistory.entries.push(result);
      statusItem.state = "success";
      statusItem.verify = result.verify;
      state.status.success += 1;
      state.status.runningId = "-";
      state.status.percent = Math.round(((i + 1) / patches.length) * 100);
      await persistState();
      pushLog("patch-success", result);
      pushLog("patch-verified", { patchId: patch.id, verify: result.verify });
    } catch (error) {
      const message = String(error.message || error);
      const conflict = isLikelyPatchConflict(message);
      const explicitStop = patch.stopOnError === true;
      const explicitContinue = patch.stopOnError === false;
      const shouldStop = explicitContinue ? false : explicitStop ? true : (conflict || !continueOnError);
      runHistory.entries.push({
        id: patch.id,
        name: patch.name,
        type: patch.type,
        file: patch.file || null,
        status: "failed",
        conflict,
        error: message,
        at: nowIso()
      });
      statusItem.state = "failed";
      statusItem.error = message;
      statusItem.conflict = conflict;
      state.status.failed += 1;
      state.status.runningId = "-";
      state.status.percent = Math.round(((i + 1) / patches.length) * 100);
      await persistState();
      pushLog("patch-error", {
        patchId: patch.id,
        message,
        conflict,
        action: shouldStop ? "run-stop" : "run-continue"
      });

      if (shouldStop) {
        state.status.mode = "failed";
        break;
      }
    }
  }

  if (state.status.mode === "running") {
    state.status.mode = state.status.failed > 0 ? "failed" : "completed";
  }

  if (state.status.mode === "completed") {
    for (const command of gates.afterCommands) {
      await runGateCommand("after", command, gates.softFailCommands);
    }
    if (gates.runPreflightAfter) {
      await runGateCommand("after", "node tools/runtime/preflight.mjs", gates.softFailPreflight);
    }
  }

  state.status.runningId = "-";
  state.status.percent = 100;
  runHistory.endedAt = nowIso();
  state.history.push(runHistory);
  state.history = state.history.slice(-50);
  await persistState();
  pushLog("all-complete", {
    runId,
    mode: state.status.mode,
    success: state.status.success,
    failed: state.status.failed
  });
}

async function uninstallPatch(patchId) {
  if (!patchId || typeof patchId !== "string") {
    throw new Error("patchId fehlt.");
  }

  const runs = [...state.history].reverse();
  let targetEntry = null;
  for (const run of runs) {
    const found = (run.entries || []).find((e) => e.id === patchId && e.status === "success" && e.backup);
    if (found) {
      targetEntry = found;
      break;
    }
  }

  if (!targetEntry) {
    throw new Error(`Kein uninstall-faehiger Erfolgseintrag fuer Patch ${patchId} gefunden.`);
  }

  const backup = targetEntry.backup;
  const targetAbs = await resolvePatchPath(backup.file, { mustExist: false });

  if (backup.existedBefore) {
    if (!backup.backupAbs || !(await fileExists(backup.backupAbs))) {
      throw new Error("Backup-Datei fehlt.");
    }
    await fs.mkdir(path.dirname(targetAbs), { recursive: true });
    await fs.copyFile(backup.backupAbs, targetAbs);
  } else {
    if (await fileExists(targetAbs)) {
      await fs.unlink(targetAbs);
    }
  }

  const result = {
    patchId,
    file: backup.file,
    restored: backup.existedBefore,
    deleted: !backup.existedBefore,
    at: nowIso()
  };
  pushLog("patch-uninstalled", result);
  return result;
}

async function serveStatic(req, res, urlObj) {
  let relPath = urlObj.pathname;
  if (relPath === "/") {
    relPath = "/index.html";
  }

  let abs;
  try {
    abs = await resolvePatchPath(relPath.slice(1), { mustExist: true });
  } catch {
    return sendError(res, 404, "Not found");
  }
  if (!(await fileExists(abs))) {
    return sendError(res, 404, "Not found");
  }

  const ext = path.extname(abs).toLowerCase();
  const ctype = STATIC_TYPES.get(ext) || "application/octet-stream";
  const data = await fs.readFile(abs);
  res.writeHead(200, {
    "content-type": ctype,
    "cache-control": "no-store"
  });
  res.end(data);
}

async function handleApi(req, res, urlObj) {
  if (req.method === "GET" && urlObj.pathname === "/api/status") {
    return json(res, 200, {
      manifest: state.manifest,
      ...state.status
    });
  }

  if (req.method === "GET" && urlObj.pathname === "/api/log") {
    return json(res, 200, { entries: state.log });
  }

  if (req.method === "GET" && urlObj.pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    res.write("event: connected\ndata: {\"ok\":true}\n\n");
    state.sseClients.add(res);
    req.on("close", () => {
      state.sseClients.delete(res);
    });
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/upload-manifest") {
    try {
      await assertWriteSessionActive();
      const body = await readBody(req);
      const manifest = body.manifest;
      await requireManifestShape(manifest);
      state.manifest = manifest;
      state.status.total = manifest.patches.length;
      state.status.patches = manifest.patches.map((p) => ({ id: p.id, name: p.name, state: "pending", file: p.file || null }));
      await persistState();
      pushLog("manifest-loaded", { count: manifest.patches.length, version: manifest.meta.version || "n/a" });
      return json(res, 200, { ok: true, manifest });
    } catch (error) {
      return sendError(res, 400, "Manifest ungueltig", String(error.message || error));
    }
  }

  if (req.method === "POST" && urlObj.pathname === "/api/load-manifest-path") {
    try {
      await assertWriteSessionActive();
      const body = await readBody(req);
      const manifestPath = String(body.path || "").trim();
      if (!manifestPath) {
        throw new Error("Pfad fehlt.");
      }
      const abs = path.isAbsolute(manifestPath) ? manifestPath : path.resolve(ROOT, manifestPath);
      const raw = await fs.readFile(abs, "utf8");
      const manifest = JSON.parse(raw);
      await requireManifestShape(manifest);
      state.manifest = manifest;
      state.status.total = manifest.patches.length;
      state.status.patches = manifest.patches.map((p) => ({ id: p.id, name: p.name, state: "pending", file: p.file || null }));
      await persistState();
      pushLog("manifest-loaded", { source: abs, count: manifest.patches.length });
      return json(res, 200, { ok: true, manifest, source: abs });
    } catch (error) {
      return sendError(res, 400, "Manifest-Datei konnte nicht geladen werden", String(error.message || error));
    }
  }

  if (req.method === "POST" && urlObj.pathname === "/api/start-patches") {
    try {
      await assertWriteSessionActive();
      const body = await readBody(req);
      const options = isPlainObject(body.options) ? body.options : {};
      runPatchQueue(options).catch((error) => {
        state.status.mode = "failed";
        state.status.runningId = "-";
        pushLog("patch-error", { message: String(error.message || error) });
      });
      return json(res, 200, { ok: true, mode: "started" });
    } catch (error) {
      return sendError(res, 400, "Patch-Start fehlgeschlagen", String(error.message || error));
    }
  }

  if (req.method === "POST" && urlObj.pathname === "/api/execute") {
    try {
      await assertWriteSessionActive();
      const body = await readBody(req);
      const envelope = body.patch;
      const parsed = parseUniversalPatch(envelope);
      parsed.envelope = envelope;
      pushLog("patch.parsed", { kind: parsed.kind, patchId: parsed.patchId });

      const validation = await validateAgainstLocks(parsed, { root: ROOT });
      pushLog("patch.validated", {
        patchId: parsed.patchId,
        riskLevel: validation.riskLevel,
        affectedFiles: validation.affectedFiles
      });

      const classification = classifyPatchRisk(validation);
      pushLog("patch.classified", {
        patchId: parsed.patchId,
        riskLevel: classification.riskLevel,
        shouldAutoExecute: classification.shouldAutoExecute,
        shouldNotifyLlm: classification.shouldNotifyLlm
      });

      const before = await snapshotFiles(ROOT, validation.affectedFiles || []);
      pushLog("patch.sandboxed", {
        patchId: parsed.patchId,
        stage: "before",
        files: before
      });

      const forceApprove = body?.confirmation?.accept === true;
      const needsHumanApproval = classification.shouldNotifyLlm && !forceApprove;
      if (needsHumanApproval) {
        const pendingId = randomUUID();
        state.pendingExecutions.set(pendingId, {
          pendingId,
          parsed,
          validation,
          classification,
          createdAt: nowIso()
        });
        pushLog("patch.pending-confirmation", {
          pendingId,
          patchId: parsed.patchId,
          riskLevel: classification.riskLevel
        });
        return json(res, 202, {
          ok: true,
          mode: "pending-confirmation",
          pendingId,
          risk: classification,
          validation
        });
      }

      const execution = await executeParsedPatch(parsed, {
        approved: forceApprove || classification.shouldAutoExecute
      });
      if (execution.mode === "pending-confirmation") {
        const pendingId = randomUUID();
        state.pendingExecutions.set(pendingId, {
          pendingId,
          parsed,
          validation,
          classification,
          createdAt: nowIso(),
          kernelConfirmationToken: execution.confirmationToken
        });
        pushLog("patch.pending-confirmation", {
          pendingId,
          patchId: parsed.patchId,
          reason: "kernel-confirmation"
        });
        return json(res, 202, {
          ok: true,
          mode: "pending-confirmation",
          pendingId,
          risk: classification,
          validation
        });
      }

      const after = await snapshotFiles(ROOT, validation.affectedFiles || []);
      pushLog("patch.executed", {
        patchId: parsed.patchId,
        mode: execution.mode,
        result: execution.result
      });
      pushLog("patch.sandboxed", {
        patchId: parsed.patchId,
        stage: "after",
        files: after
      });

      await updateTraceLockAfterPatch({
        patchId: parsed.patchId,
        riskLevel: classification.riskLevel,
        affectedFiles: validation.affectedFiles
      });

      return json(res, 200, {
        ok: true,
        mode: "applied",
        parsed,
        validation,
        risk: classification,
        result: execution.result
      });
    } catch (error) {
      pushLog("patch-error", { message: String(error.message || error) });
      return sendError(res, 400, "Patch-Ausfuehrung fehlgeschlagen", String(error.message || error));
    }
  }

  if (req.method === "POST" && urlObj.pathname === "/api/execute/approve") {
    try {
      await assertWriteSessionActive();
      const body = await readBody(req);
      const pendingId = String(body.pendingId || "").trim();
      if (!pendingId) {
        throw new Error("pendingId fehlt.");
      }
      if (body.accept !== true) {
        throw new Error("Explizite Bestaetigung (`accept: true`) fehlt.");
      }
      const pending = state.pendingExecutions.get(pendingId);
      if (!pending) {
        throw new Error("pendingId ungueltig oder bereits verarbeitet.");
      }
      state.pendingExecutions.delete(pendingId);

      const execution = await executeParsedPatch(pending.parsed, { approved: true });
      if (execution.mode !== "applied") {
        throw new Error("Patch konnte nach Freigabe nicht angewendet werden.");
      }

      const after = await snapshotFiles(ROOT, pending.validation.affectedFiles || []);
      pushLog("patch.executed", {
        patchId: pending.parsed.patchId,
        mode: "approved-apply",
        result: execution.result
      });
      pushLog("patch.sandboxed", {
        patchId: pending.parsed.patchId,
        stage: "after",
        files: after
      });
      await updateTraceLockAfterPatch({
        patchId: pending.parsed.patchId,
        riskLevel: pending.classification.riskLevel,
        affectedFiles: pending.validation.affectedFiles
      });

      return json(res, 200, {
        ok: true,
        mode: "applied",
        pendingId,
        result: execution.result
      });
    } catch (error) {
      pushLog("patch-error", { message: String(error.message || error) });
      return sendError(res, 400, "Patch-Freigabe fehlgeschlagen", String(error.message || error));
    }
  }

  if (req.method === "POST" && urlObj.pathname === "/api/cancel") {
    await assertWriteSessionActive();
    state.status.cancelRequested = true;
    pushLog("cancel-requested", { at: nowIso() });
    await persistState();
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && urlObj.pathname === "/api/uninstall-patch") {
    try {
      await assertWriteSessionActive();
      const body = await readBody(req);
      const result = await uninstallPatch(String(body.patchId || ""));
      await persistState();
      return json(res, 200, { ok: true, result });
    } catch (error) {
      return sendError(res, 400, "Uninstall fehlgeschlagen", String(error.message || error));
    }
  }

  if (req.method === "GET" && urlObj.pathname === "/api/manifest-schema") {
    try {
      const text = await fs.readFile(MANIFEST_SCHEMA_FILE, "utf8");
      return json(res, 200, JSON.parse(text));
    } catch (error) {
      return sendError(res, 500, "Schema nicht verfuegbar", String(error.message || error));
    }
  }

  return sendError(res, 404, "API endpoint not found");
}

async function handle(req, res) {
  try {
    const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (urlObj.pathname.startsWith("/api/")) {
      await handleApi(req, res, urlObj);
    } else {
      await serveStatic(req, res, urlObj);
    }
  } catch (error) {
    sendError(res, 500, "Server error", String(error.message || error));
  }
}

export class PatchServer {
  constructor(port = PORT) {
    this.port = Number.isFinite(port) ? port : PORT;
    this.server = http.createServer((req, res) => {
      this.#route(req, res).catch((error) => {
        sendError(res, 500, "Server error", String(error?.message || error));
      });
    });
  }

  async listen() {
    await new Promise((resolve) => {
      this.server.listen(this.port, resolve);
    });
    return this.server;
  }

  async close() {
    await new Promise((resolve) => this.server.close(() => resolve()));
  }

  async #route(req, res) {
    const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = urlObj.pathname || "/";

    if (pathname === "/api/patches" || pathname === "/api/hooks") {
      sendError(res, 404, "API endpoint not found");
      return;
    }

    const sessionMatch = pathname.match(/^\/api\/patch-sessions\/([^/]+)\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      const action = sessionMatch[2];

      if (req.method === "POST" && action === "cancel") {
        await handleCancel(req, res, sessionId, json);
        return;
      }
      if (req.method === "GET" && action === "status") {
        await handleStatus(res, sessionId, json);
        return;
      }
      if (req.method === "GET" && action === "logs") {
        await handleLogs(res, sessionId, json);
        return;
      }
      if (req.method === "GET" && action === "result") {
        await handleResult(res, sessionId, json);
        return;
      }
      if (req.method === "GET" && action === "events") {
        await handleEvents(req, res, sessionId, json);
        return;
      }
    }

    if (pathname === "/api/patch-sessions" && req.method === "POST") {
      await handleCreateSession(req, res, json);
      return;
    }

    if (pathname.startsWith("/api/")) {
      sendError(res, 404, "API endpoint not found");
      return;
    }

    if (await handleStaticRequest(res, pathname)) {
      return;
    }

    sendError(res, 404, "Not found");
  }
}

let patchServerInstance = null;

export async function startPatchServer() {
  if (patchServerInstance) {
    return patchServerInstance.server;
  }

  await ensureDirs();
  await loadState();
  await activateServerSession();

  patchServerInstance = new PatchServer(PORT);
  await patchServerInstance.listen();
  console.log(`[PATCH_SERVER] listening on http://localhost:${PORT}`);

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => {
      await stopPatchServer();
      process.exit(0);
    });
  }

  return patchServerInstance.server;
}

export async function stopPatchServer() {
  if (!patchServerInstance) {
    return;
  }
  const active = patchServerInstance;
  patchServerInstance = null;
  await active.close();
  await clearServerSession();
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  await startPatchServer();
}
