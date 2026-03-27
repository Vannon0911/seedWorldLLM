import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

const BROWSER_PATCH_TYPES = new Set([
  "string-replace",
  "file-create",
  "file-append",
  "file-replace",
  "json-update",
  "run-command"
]);

const DEFAULT_PROTECTED_FILES = [
  "src/kernel/store/applyPatches.js",
  "src/kernel/store/createStore.js",
  "src/kernel/llmGovernance.js",
  "tools/runtime/preflight.mjs",
  "tools/llm-preflight.mjs",
  "docs/llm/ENTRY.md",
  "docs/llm/OPERATING_PROTOCOL.md",
  "docs/llm/TASK_ENTRY_MATRIX.json",
  "docs/llm/entry/LLM_ENTRY_LOCK.json"
];

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeFile(file) {
  return String(file || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function extractAffectedFiles(parsed) {
  if (parsed.kind === "browser-patch") {
    return parsed.file ? [parsed.file] : [];
  }
  if (parsed.kind === "browser-manifest") {
    return parsed.patches
      .filter((p) => p.type !== "run-command")
      .map((p) => normalizeFile(p.file))
      .filter(Boolean);
  }

  const files = [];
  const patch = parsed.patch || {};
  for (const op of patch.operations || []) {
    if (typeof op?.file === "string") files.push(op.file);
    if (typeof op?.path === "string" && op.path.includes("/")) files.push(op.path);
  }
  for (const f of patch.files || []) {
    files.push(f);
  }
  return files.map(normalizeFile).filter(Boolean);
}

function toScopes(files) {
  const scopes = new Set();
  for (const file of files) {
    const top = file.split("/")[0];
    if (top) scopes.add(top);
  }
  return [...scopes].sort();
}

function hasProtectedHit(file, protectedSet) {
  if (protectedSet.has(file)) return true;
  if (file.startsWith("src/kernel/")) return true;
  if (file.startsWith("docs/llm/")) return true;
  return false;
}

export function parseUniversalPatch(input) {
  if (!isPlainObject(input)) {
    throw new Error("Unbekanntes Patch-Format: Payload muss ein Objekt sein.");
  }

  if (input.patched === true && isPlainObject(input.patch) && input.patch.target === "kernel") {
    return {
      kind: "kernel-patch",
      patchId: String(input.patch.patchId || "kernel-patch"),
      patch: input.patch,
      affectedFiles: extractAffectedFiles({ kind: "kernel-patch", patch: input.patch })
    };
  }

  if (typeof input.type === "string" && BROWSER_PATCH_TYPES.has(input.type)) {
    return {
      kind: "browser-patch",
      patchId: String(input.id || "browser-patch"),
      type: input.type,
      file: normalizeFile(input.file),
      patch: input,
      affectedFiles: extractAffectedFiles({
        kind: "browser-patch",
        file: normalizeFile(input.file)
      })
    };
  }

  if (Array.isArray(input.patches) && isPlainObject(input.meta)) {
    for (const patch of input.patches) {
      if (!isPlainObject(patch) || typeof patch.type !== "string" || !BROWSER_PATCH_TYPES.has(patch.type)) {
        throw new Error("Unbekanntes Patch-Format: Manifest enthaelt ungueltigen Patch-Typ.");
      }
    }
    return {
      kind: "browser-manifest",
      patchId: String(input.meta.version || "manifest"),
      patches: input.patches.map((p) => ({ ...p, file: normalizeFile(p.file) })),
      manifest: input,
      affectedFiles: extractAffectedFiles({
        kind: "browser-manifest",
        patches: input.patches.map((p) => ({ ...p, file: normalizeFile(p.file) }))
      })
    };
  }

  throw new Error("Unbekanntes Patch-Format: weder Kernel-Patch noch Browser-Patch erkannt.");
}

export async function validateAgainstLocks(parsedPatch, options = {}) {
  if (!isPlainObject(parsedPatch)) {
    throw new Error("validateAgainstLocks: parsedPatch fehlt.");
  }
  const root = options.root || process.cwd();
  const traceLockPath = path.resolve(root, "docs/trace-lock.json");
  const llmLockPath = path.resolve(root, "docs/llm/entry/LLM_ENTRY_LOCK.json");

  const traceLock = JSON.parse(await fs.readFile(traceLockPath, "utf8"));
  const llmLock = JSON.parse(await fs.readFile(llmLockPath, "utf8"));
  const traceFiles = new Set(Object.keys(traceLock.files || {}).map(normalizeFile));
  const protectedSet = new Set((options.protectedFiles || DEFAULT_PROTECTED_FILES).map(normalizeFile));

  const affectedFiles = [...new Set((parsedPatch.affectedFiles || []).map(normalizeFile).filter(Boolean))];
  const affectedScopes = toScopes(affectedFiles);
  const protectedHits = affectedFiles.filter((f) => hasProtectedHit(f, protectedSet));
  const lockHits = affectedFiles.filter((f) => traceFiles.has(f));
  const unknownFiles = affectedFiles.filter((f) => !traceFiles.has(f));
  const touchesKernel = parsedPatch.kind === "kernel-patch" || affectedFiles.some((f) => f.startsWith("src/kernel/"));

  let riskLevel = "safe";
  if (touchesKernel || protectedHits.length > 0) {
    riskLevel = "critical";
  } else if (lockHits.length > 0) {
    riskLevel = "caution";
  }

  return {
    riskLevel,
    affectedScopes,
    affectedFiles,
    protectedHits,
    lockHits,
    unknownFiles,
    requiresKernelValidation: touchesKernel || protectedHits.length > 0,
    locks: {
      traceLockPath: "docs/trace-lock.json",
      llmLockPath: "docs/llm/entry/LLM_ENTRY_LOCK.json",
      llmEntryPath: String(llmLock.entryPath || ""),
      llmEntryHash: String(llmLock.sha256 || "")
    }
  };
}

export function classifyPatchRisk(validationResult) {
  const riskLevel = String(validationResult?.riskLevel || "caution");
  const affectedScopes = Array.isArray(validationResult?.affectedScopes) ? validationResult.affectedScopes : [];

  if (riskLevel === "safe") {
    return {
      riskLevel,
      shouldAutoExecute: true,
      shouldNotifyLlm: false,
      requiresKernelOk: false,
      affectedScopes
    };
  }

  if (riskLevel === "critical") {
    return {
      riskLevel,
      shouldAutoExecute: false,
      shouldNotifyLlm: true,
      requiresKernelOk: true,
      affectedScopes
    };
  }

  return {
    riskLevel: "caution",
    shouldAutoExecute: false,
    shouldNotifyLlm: true,
    requiresKernelOk: false,
    affectedScopes
  };
}

export async function snapshotFiles(root, files = []) {
  const out = {};
  for (const rel of files.map(normalizeFile).filter(Boolean)) {
    const abs = path.resolve(root, rel);
    try {
      const text = await fs.readFile(abs, "utf8");
      out[rel] = {
        exists: true,
        checksum: sha256Text(text)
      };
    } catch {
      out[rel] = { exists: false, checksum: null };
    }
  }
  return out;
}
