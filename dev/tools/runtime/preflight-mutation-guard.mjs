import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const modulePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === modulePath : false;
const statePath = path.join(root, "runtime", ".patch-manager", "preflight-mutation-lock.json");
const vaultPath = path.join(root, "runtime", ".patch-manager", "vault", "preflight-mutation-vault.json");
const POLICY_VERSION = 2;
const LEGACY_LOCK_MARKER_RX = /\/\/ preflight-lock:[A-F0-9]{8}\s*\r?\nthrow new Error\("Runtime invariant mismatch: E[A-F0-9]{8}"\);?\s*/m;
const TARGET_FILES = [
  "app/src/kernel/runtimeGuards.js",
  "app/src/kernel/fingerprint.js",
  "app/src/game/worldGen.js",
  "app/server/patchUtils.js"
];

const FAULT_STRATEGIES = Object.freeze({
  "app/src/kernel/runtimeGuards.js": {
    kind: "guard-scope-inversion",
    apply(content) {
      return content.replace("if (activeGuardScope !== null) {", "if (activeGuardScope === null) {");
    },
    isActive(content) {
      return content.includes("if (activeGuardScope === null) {");
    }
  },
  "app/src/kernel/fingerprint.js": {
    kind: "digest-algorithm-drift",
    apply(content) {
      return content.replace('crypto.subtle.digest("SHA-256", bytes)', 'crypto.subtle.digest("SHA-1", bytes)');
    },
    isActive(content) {
      return content.includes('crypto.subtle.digest("SHA-1", bytes)');
    }
  },
  "app/src/game/worldGen.js": {
    kind: "lake-biome-drift",
    apply(content) {
      return content.replace('biome: "water"', 'biome: "meadow"');
    },
    isActive(content) {
      return content.includes('biome: "meadow"');
    }
  },
  "app/server/patchUtils.js": {
    kind: "lock-validation-freeze",
    apply(content) {
      return content.replace("ok: violations.length === 0,", "ok: false,");
    },
    isActive(content) {
      return content.includes("ok: false,");
    }
  }
});

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return "NO_HEAD";
  }
  return String(result.stdout || "").trim() || "NO_HEAD";
}

function deriveToken(seed, head, label) {
  return sha256(`${seed}|${head}|${label}|policy:${POLICY_VERSION}`);
}

function toIndex(token, size) {
  return Number.parseInt(token.slice(0, 8), 16) % size;
}

function strategyFor(relPath) {
  const strategy = FAULT_STRATEGIES[relPath];
  if (!strategy) {
    throw new Error(`[PREFLIGHT_ESCALATION] unknown target strategy for ${relPath}`);
  }
  return strategy;
}

export function normalizeLock(lock) {
  const raw = lock && typeof lock === "object" ? lock : {};
  const legacy = Boolean(raw?.markerHash || raw?.injectedFileHash) && !raw?.postInjectHash;
  const normalized = {
    version: Number.isInteger(raw.version) ? raw.version : legacy ? 1 : POLICY_VERSION,
    policyVersion: Number.isInteger(raw.policyVersion) ? raw.policyVersion : legacy ? 1 : POLICY_VERSION,
    createdAt: String(raw.createdAt || ""),
    head: String(raw.head || ""),
    targetFile: String(raw.targetFile || ""),
    faultKind: String(raw.faultKind || ""),
    preStateHash: String(raw.preStateHash || ""),
    postInjectHash: String(raw.postInjectHash || raw.injectedFileHash || ""),
    seedRef: String(raw.seedRef || ""),
    legacy
  };
  if (!normalized.targetFile && !normalized.head && !normalized.postInjectHash && !normalized.preStateHash && !normalized.legacy) {
    return null;
  }
  return normalized;
}

export function normalizeVault(vault) {
  const raw = vault && typeof vault === "object" ? vault : {};
  return {
    version: Number.isInteger(raw.version) ? raw.version : POLICY_VERSION,
    policyVersion: Number.isInteger(raw.policyVersion) ? raw.policyVersion : POLICY_VERSION,
    seed: String(raw.seed || ""),
    lastGeneratedHead: String(raw.lastGeneratedHead || ""),
    lastGeneratedAt: String(raw.lastGeneratedAt || ""),
    lastGeneratedTarget: String(raw.lastGeneratedTarget || ""),
    lastResolvedHead: String(raw.lastResolvedHead || ""),
    lastResolvedAt: String(raw.lastResolvedAt || ""),
    lastResolvedTarget: String(raw.lastResolvedTarget || ""),
    resolutionProof: String(raw.resolutionProof || ""),
    resolutionHash: String(raw.resolutionHash || ""),
    pendingFailureCount: Number.isInteger(raw.pendingFailureCount) ? raw.pendingFailureCount : 0,
    lastFailureHead: String(raw.lastFailureHead || ""),
    lastFailureAt: String(raw.lastFailureAt || ""),
    lastFailureTarget: String(raw.lastFailureTarget || ""),
    secondFailureNotifiedAt: String(raw.secondFailureNotifiedAt || "")
  };
}

async function readJsonOrNull(absPath) {
  try {
    return JSON.parse(await readFile(absPath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(absPath, payload) {
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readText(absPath) {
  return readFile(absPath, "utf8");
}

async function renderLsOutput(absPath) {
  try {
    const entries = await readdir(absPath, { withFileTypes: true });
    if (entries.length === 0) {
      return [`[PREFLIGHT_LS] ${path.relative(root, absPath) || "."}: <empty>`];
    }

    const lines = [`[PREFLIGHT_LS] ${path.relative(root, absPath) || "."}:`];
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
      const entryPath = path.join(absPath, entry.name);
      let sizeText = "-";
      try {
        const info = await stat(entryPath);
        sizeText = String(info.size);
      } catch {
        sizeText = "?";
      }
      const kind = entry.isDirectory() ? "d" : entry.isSymbolicLink() ? "l" : "f";
      lines.push(`[PREFLIGHT_LS]   ${kind} ${entry.name} (${sizeText}b)`);
    }
    return lines;
  } catch (error) {
    return [`[PREFLIGHT_LS] ${path.relative(root, absPath) || "."}: <unavailable: ${String(error?.message || error)}>`];
  }
}

async function emitPreflightLsOutput() {
  const pathsToList = [
    root,
    path.join(root, "runtime"),
    path.join(root, "runtime", ".patch-manager"),
    path.join(root, "dev", "tools", "runtime")
  ];

  for (const absPath of pathsToList) {
    for (const line of await renderLsOutput(absPath)) {
      console.error(line);
    }
  }
}

async function findLegacyMarker() {
  for (const relPath of TARGET_FILES) {
    try {
      const content = await readText(path.join(root, relPath));
      if (LEGACY_LOCK_MARKER_RX.test(content)) {
        return relPath;
      }
    } catch {
      // ignore
    }
  }
  return "";
}

function ensureVaultSeed(vault) {
  return vault.seed || randomBytes(32).toString("hex");
}

export function pickTargetFile(seed, head) {
  const token = deriveToken(seed, head, "target");
  return TARGET_FILES[toIndex(token, TARGET_FILES.length)];
}

export function injectFault(relPath, content, { seed, head }) {
  const strategy = strategyFor(relPath);
  const token = deriveToken(seed, head, `${relPath}:${strategy.kind}`);
  const nextContent = strategy.apply(content, token);
  if (nextContent === content) {
    throw new Error(`[PREFLIGHT_ESCALATION] unable to inject deterministic fault in ${relPath}`);
  }
  return {
    faultKind: strategy.kind,
    token,
    content: nextContent
  };
}

export function isFaultStillActive(relPath, content) {
  return strategyFor(relPath).isActive(content);
}

async function findActiveHiddenFault() {
  for (const relPath of TARGET_FILES) {
    try {
      const content = await readText(path.join(root, relPath));
      if (isFaultStillActive(relPath, content)) {
        return relPath;
      }
    } catch {
      // ignore missing targets and keep scanning
    }
  }
  return "";
}
export function buildResolutionProof(seed, lock, currentHash) {
  return sha256([
    seed,
    lock.head,
    lock.targetFile,
    lock.faultKind,
    lock.preStateHash,
    lock.postInjectHash,
    currentHash,
    String(lock.policyVersion || POLICY_VERSION)
  ].join("|"));
}

export function validateResolutionCandidate(lock, currentContent, seed) {
  const normalizedLock = normalizeLock(lock);
  const currentHash = sha256(currentContent);

  if (!normalizedLock || !normalizedLock.targetFile || !normalizedLock.postInjectHash || !normalizedLock.preStateHash || !seed) {
    return { ok: false, code: "invalid-state", currentHash };
  }

  if (isFaultStillActive(normalizedLock.targetFile, currentContent)) {
    return { ok: false, code: "fault-still-active", currentHash };
  }

  if (currentHash === normalizedLock.postInjectHash) {
    return { ok: false, code: "injected-state-unchanged", currentHash };
  }

  if (currentHash === normalizedLock.preStateHash) {
    return { ok: false, code: "reverted-to-prestate", currentHash };
  }

  return {
    ok: true,
    code: "resolved",
    currentHash,
    resolutionProof: buildResolutionProof(seed, normalizedLock, currentHash)
  };
}

async function recordPendingFailure(vault, head, relPath) {
  const sameFailure =
    vault.lastFailureHead === head &&
    vault.lastFailureTarget === relPath;
  const pendingFailureCount = sameFailure ? vault.pendingFailureCount + 1 : 1;
  const nowIso = new Date().toISOString();
  const nextVault = {
    ...vault,
    version: POLICY_VERSION,
    policyVersion: POLICY_VERSION,
    pendingFailureCount,
    lastFailureHead: head,
    lastFailureAt: nowIso,
    lastFailureTarget: relPath,
    secondFailureNotifiedAt:
      pendingFailureCount >= 2
        ? nowIso
        : ""
  };
  await writeJson(vaultPath, nextVault);

  if (pendingFailureCount >= 2) {
    console.error(`[PREFLIGHT_ESCALATION] repeated unresolved attestation for ${relPath} on HEAD ${head.slice(0, 12)}.`);
  }

  return pendingFailureCount;
}

async function clearLegacyStateIfSafe(lock, vault) {
  if (!lock) {
    return { lock: null, vault };
  }
  if (!lock.legacy) {
    return { lock, vault };
  }

  const markerFile = await findLegacyMarker();
  if (markerFile) {
    throw new Error(`[PREFLIGHT_ESCALATION] legacy visible fault present in ${markerFile}`);
  }

  await rm(statePath, { force: true });
  const nextVault = {
    ...vault,
    version: POLICY_VERSION,
    policyVersion: POLICY_VERSION,
    lastResolvedHead: lock.head || vault.lastResolvedHead,
    lastResolvedAt: new Date().toISOString(),
    lastResolvedTarget: lock.targetFile || vault.lastResolvedTarget,
    resolutionProof: "",
    resolutionHash: "",
    pendingFailureCount: 0,
    lastFailureHead: "",
    lastFailureAt: "",
    lastFailureTarget: "",
    secondFailureNotifiedAt: ""
  };
  await writeJson(vaultPath, nextVault);
  console.warn("[PREFLIGHT_GUARD] legacy visible-marker state cleared after clean source verification");
  return { lock: null, vault: nextVault };
}

async function ensureInjectedLock(head, vault) {
  const seed = ensureVaultSeed(vault);
  const relPath = pickTargetFile(seed, head);
  const absPath = path.join(root, relPath);
  const before = await readText(absPath);
  const injection = injectFault(relPath, before, { seed, head });
  await writeFile(absPath, injection.content, "utf8");

  const lock = {
    version: POLICY_VERSION,
    policyVersion: POLICY_VERSION,
    createdAt: new Date().toISOString(),
    targetFile: relPath,
    head,
    faultKind: injection.faultKind,
    preStateHash: sha256(before),
    postInjectHash: sha256(injection.content),
    seedRef: deriveToken(seed, head, relPath).slice(0, 24)
  };

  const nextVault = {
    ...vault,
    version: POLICY_VERSION,
    policyVersion: POLICY_VERSION,
    seed,
    lastGeneratedHead: head,
    lastGeneratedAt: lock.createdAt,
    lastGeneratedTarget: relPath,
    resolutionProof: "",
    resolutionHash: "",
    pendingFailureCount: 0,
    lastFailureHead: "",
    lastFailureAt: "",
    lastFailureTarget: "",
    secondFailureNotifiedAt: ""
  };

  await writeJson(statePath, lock);
  await writeJson(vaultPath, nextVault);
  console.warn(`[PREFLIGHT_GUARD] attestation armed in ${relPath}`);
}

async function resolveOrKeepLock(lock, vault, head) {
  if (!lock.targetFile || !lock.postInjectHash || !lock.preStateHash) {
    throw new Error("[PREFLIGHT_ESCALATION] invalid lock payload");
  }
  if (lock.head !== head) {
    throw new Error(`[PREFLIGHT_ESCALATION] lock head drift (${lock.head.slice(0, 12)} -> ${head.slice(0, 12)})`);
  }

  const current = await readText(path.join(root, lock.targetFile));
  const resolution = validateResolutionCandidate(lock, current, vault.seed);
  if (!resolution.ok) {
    const failureCount = await recordPendingFailure(vault, head, lock.targetFile);
    console.warn(`[PREFLIGHT_GUARD] unresolved attestation: ${lock.targetFile} (${resolution.code})`);
    if (failureCount >= 2) {
      console.warn(`[PREFLIGHT_GUARD] escalation active: pendingFailureCount=${failureCount}`);
    }
    return false;
  }

  await rm(statePath, { force: true });
  const nextVault = {
    ...vault,
    version: POLICY_VERSION,
    policyVersion: POLICY_VERSION,
    lastResolvedHead: head,
    lastResolvedAt: new Date().toISOString(),
    lastResolvedTarget: lock.targetFile,
    resolutionProof: resolution.resolutionProof,
    resolutionHash: resolution.currentHash,
    pendingFailureCount: 0,
    lastFailureHead: "",
    lastFailureAt: "",
    lastFailureTarget: "",
    secondFailureNotifiedAt: ""
  };
  await writeJson(vaultPath, nextVault);
  console.log("[PREFLIGHT_GUARD] attestation resolved");
  return true;
}

async function runVerifyMode(lock, vault, head) {
  const legacyMarkerFile = await findLegacyMarker();
  if (legacyMarkerFile) {
    throw new Error(`[PREFLIGHT_ESCALATION] legacy visible fault present in ${legacyMarkerFile}`);
  }

  const activeFaultFile = await findActiveHiddenFault();
  if (activeFaultFile) {
    throw new Error(`[UNRESOLVED_ATTESTATION] hidden fault signature present in ${activeFaultFile}`);
  }

  if (!lock) {
    if (vault.lastGeneratedHead === head && vault.lastResolvedHead !== head) {
      throw new Error(`[UNRESOLVED_ATTESTATION] missing lock state for unresolved HEAD ${head.slice(0, 12)}`);
    }
    console.log("[PREFLIGHT_GUARD] verify mode: no active attestation");
    return;
  }

  const resolved = await resolveOrKeepLock(lock, vault, head);
  if (!resolved) {
    throw new Error(`[UNRESOLVED_ATTESTATION] ${lock.targetFile}`);
  }
}

async function runEnforceMode(lock, vault, head) {
  const legacyMarkerFile = await findLegacyMarker();
  if (legacyMarkerFile) {
    throw new Error(`[PREFLIGHT_ESCALATION] legacy visible fault present in ${legacyMarkerFile}`);
  }

  const activeFaultFile = await findActiveHiddenFault();
  if (activeFaultFile) {
    throw new Error(`[UNRESOLVED_ATTESTATION] hidden fault signature present in ${activeFaultFile}`);
  }

  if (lock) {
    await resolveOrKeepLock(lock, vault, head);
    return;
  }

  if (vault.lastGeneratedHead === head) {
    if (vault.lastResolvedHead === head) {
      console.log(`[PREFLIGHT_GUARD] HEAD ${head.slice(0, 12)} bereits sauber attestiert; keine neue Injektion.`);
      return;
    }
    throw new Error(`[STATE_DRIFT] unresolved attestation metadata for head ${head.slice(0, 12)}`);
  }

  await ensureInjectedLock(head, vault);
}

async function main() {
  const cliEnforce = process.argv.includes("--enforce");
  const cliVerify = process.argv.includes("--verify");
  const rawEnvMode = String(process.env.PREFLIGHT_GUARD_MODE || "").trim().toLowerCase();
  const envMode = rawEnvMode === "0" ? "verify" : rawEnvMode;
  const mode = cliEnforce
    ? "enforce"
    : cliVerify
      ? "verify"
      : String(envMode || (process.env.CI ? "verify" : "enforce")).trim().toLowerCase();
  let lock = normalizeLock(await readJsonOrNull(statePath));
  let vault = normalizeVault(await readJsonOrNull(vaultPath));
  const head = currentHead();

  try {
    if (mode !== "verify" && mode !== "enforce") {
      throw new Error(`[PREFLIGHT_ESCALATION] unknown mode '${mode}' (allowed: verify|enforce)`);
    }

    const prepared = await clearLegacyStateIfSafe(lock, vault);
    lock = prepared.lock;
    vault = prepared.vault;

    if (mode === "verify") {
      await runVerifyMode(lock, vault, head);
      return;
    }
    await runEnforceMode(lock, vault, head);
  } catch (error) {
    console.error(`[PREFLIGHT_GUARD] BLOCK: ${String(error?.message || error)}`);
    await emitPreflightLsOutput();
    process.exit(1);
  }
}

if (isDirectRun) {
  await main();
}
