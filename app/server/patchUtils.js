import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeFile(file) {
  if (typeof file !== "string" || !file.trim()) {
    return null;
  }
  return file.replace(/\\/g, "/").replace(/^\/+/, "");
}

function uniq(items) {
  return [...new Set(items)];
}

function readAffectedFiles(parsed) {
  if (Array.isArray(parsed?.affectedFiles)) {
    return uniq(parsed.affectedFiles.map(normalizeFile).filter(Boolean));
  }

  if (parsed?.kind === "browser-patch") {
    const file = normalizeFile(parsed?.patch?.file);
    return file ? [file] : [];
  }

  if (parsed?.kind === "browser-manifest") {
    const files = (Array.isArray(parsed?.patches) ? parsed.patches : [])
      .map((patch) => normalizeFile(patch?.file))
      .filter(Boolean);
    return uniq(files);
  }

  return [];
}

export function parseUniversalPatch(envelope) {
  if (!isPlainObject(envelope)) {
    throw new Error("Patch envelope muss ein Objekt sein.");
  }

  if (Array.isArray(envelope.patches)) {
    const patches = envelope.patches.filter((p) => isPlainObject(p));
    return {
      kind: "browser-manifest",
      patchId: typeof envelope?.meta?.id === "string" ? envelope.meta.id : `manifest-${Date.now()}`,
      patches,
      affectedFiles: uniq(patches.map((p) => normalizeFile(p.file)).filter(Boolean)),
      patch: null
    };
  }

  if (isPlainObject(envelope.patch)) {
    const patch = envelope.patch;
    const file = normalizeFile(patch.file);
    return {
      kind: "browser-patch",
      patchId: typeof patch.id === "string" ? patch.id : `patch-${Date.now()}`,
      patch,
      patches: [patch],
      affectedFiles: file ? [file] : []
    };
  }

  if (typeof envelope.id === "string" && typeof envelope.type === "string") {
    const patch = envelope;
    const file = normalizeFile(patch.file);
    return {
      kind: "browser-patch",
      patchId: patch.id,
      patch,
      patches: [patch],
      affectedFiles: file ? [file] : []
    };
  }

  throw new Error("Unbekanntes Patch-Format.");
}

export async function snapshotFiles(root, files) {
  const safeRoot = path.resolve(root || process.cwd());
  const relFiles = Array.isArray(files) ? files : [];
  const snapshots = [];

  for (const rel of relFiles) {
    const normalized = normalizeFile(rel);
    if (!normalized) {
      continue;
    }
    const abs = path.resolve(safeRoot, normalized);
    const inside = abs === safeRoot || abs.startsWith(`${safeRoot}${path.sep}`);
    if (!inside) {
      snapshots.push({
        file: normalized,
        exists: false,
        blocked: true
      });
      continue;
    }

    try {
      const data = await fs.readFile(abs);
      snapshots.push({
        file: normalized,
        exists: true,
        size: data.length,
        sha256: createHash("sha256").update(data).digest("hex")
      });
    } catch {
      snapshots.push({
        file: normalized,
        exists: false
      });
    }
  }

  return snapshots;
}

export async function validateAgainstLocks(parsed, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const affectedFiles = readAffectedFiles(parsed);
  const violations = [];

  for (const rel of affectedFiles) {
    const abs = path.resolve(root, rel);
    const inside = abs === root || abs.startsWith(`${root}${path.sep}`);
    if (!inside) {
      violations.push({ file: rel, reason: "outside-root" });
    }
  }

  return {
    ok: violations.length === 0,
    riskLevel: violations.length > 0 ? "high" : affectedFiles.length > 4 ? "medium" : "low",
    affectedFiles,
    violations
  };
}

export function classifyPatchRisk(validation) {
  const level = typeof validation?.riskLevel === "string" ? validation.riskLevel : "medium";
  const riskLevel = level === "high" || level === "medium" || level === "low" ? level : "medium";

  return {
    riskLevel,
    shouldAutoExecute: riskLevel === "low",
    shouldNotifyLlm: riskLevel !== "low"
  };
}

export const __guardAttestationKeepAlive = true;
