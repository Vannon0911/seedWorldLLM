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

/**
 * Determine whether the given file content constitutes a valid resolution for the provided lock and, when valid, produce a resolution proof.
 *
 * @param {object} lock - Lock object to validate (may be unnormalized).
 * @param {string} currentContent - Current UTF-8 content of the lock's target file.
 * @param {string} seed - Vault seed used to build the resolution proof.
 * @returns {{ok:boolean, code:string, currentHash:string, resolutionProof?:string}}
 * @returns {object.ok} `true` when the current content resolves the lock, `false` otherwise.
 * @returns {object.code} One of:
 *  - `"invalid-state"`: missing/invalid lock fields or missing seed;
 *  - `"fault-still-active"`: the fault signature is still present in the current content;
 *  - `"injected-state-unchanged"`: current content matches the recorded injected (post-inject) state;
 *  - `"reverted-to-prestate"`: current content matches the recorded pre-injection state;
 *  - `"resolved"`: resolution succeeded.
 * @returns {object.currentHash} SHA-256 hex digest of `currentContent`.
 * @returns {object.resolutionProof} Present only when `ok` is `true`; a SHA-256 proof string derived from `seed`, the normalized lock, `currentHash`, and the policy version.
 */
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

/**
 * Decide whether an existing lock should be kept, blocked, or cleared when the repository HEAD has changed.
 *
 * @param {object|null|undefined} lock - Stored lock state to evaluate (may be legacy or empty).
 * @param {string} currentContent - Current text content of the lock's target file.
 * @param {string} currentHead - Currently checked-out git HEAD (commit id or `"NO_HEAD"`).
 * @returns {{action: "keep"} | {action: "block", code: "stale-head-active-fault"} | {action: "clear-stale-lock", code: "stale-head-resolved"}} 
 * An object describing the decision:
 * - `action: "keep"`: retain the existing lock (no head drift or no actionable lock).
 * - `action: "block", code: "stale-head-active-fault"`: block progress because the recorded lock is stale and the injected fault is still active in the file.
 * - `action: "clear-stale-lock", code: "stale-head-resolved"`: clear the stale lock because the recorded head differs but the fault is no longer present.
 */
export function assessHeadDrift(lock, currentContent, currentHead) {
  const normalizedLock = normalizeLock(lock);
  if (!normalizedLock || !normalizedLock.head || normalizedLock.head === currentHead) {
    return { action: "keep" };
  }

  if (isFaultStillActive(normalizedLock.targetFile, currentContent)) {
    return {
      action: "block",
      code: "stale-head-active-fault"
    };
  }

  return {
    action: "clear-stale-lock",
    code: "stale-head-resolved"
  };
}

/**
 * Builds a human-readable challenge or block message describing an unresolved attestation or state-drift condition.
 *
 * @param {Object} options - Message construction options.
 * @param {"armed"|"stale-active-fault"|"missing-lock"|"metadata-drift"|"unresolved"|string} options.phase - The scenario phase determining message text.
 * @param {string} [options.targetFile=""] - Target file path involved in the attestation (used verbatim in the message).
 * @param {string} [options.faultKind=""] - Fault kind identifier (used verbatim in the message).
 * @param {number} [options.pendingFailureCount=0] - Number of consecutive unresolved failures; influences escalation wording when >= 2.
 * @returns {string} The formatted challenge/block message.
 */
export function buildChallengeBlockMessage({
  phase,
  targetFile = "",
  faultKind = "",
  pendingFailureCount = 0
}) {
  const target = targetFile || "<unknown-target>";
  const kind = faultKind || "unknown-fault";

  if (phase === "armed") {
    return `[UNRESOLVED_ATTESTATION] challenge armed in ${target} (${kind}). Re-run preflight and behebe die Ursache manuell.`;
  }

  if (phase === "stale-active-fault") {
    return `[UNRESOLVED_ATTESTATION] stale lock mit aktivem fault in ${target}. Ursache manuell beheben; keine automatische Freigabe.`;
  }

  if (phase === "missing-lock") {
    return `[UNRESOLVED_ATTESTATION] missing lock state for unresolved HEAD. Ursache manuell beheben und danach preflight erneut ausfuehren.`;
  }

  if (phase === "metadata-drift") {
    return `[STATE_DRIFT] unresolved attestation metadata for current HEAD. Ursache manuell beheben; kein stilles Weitermachen.`;
  }

  if (phase === "unresolved") {
    if (pendingFailureCount >= 2) {
      return `[UNRESOLVED_ATTESTATION] challenge unresolved in ${target} (${kind}). Eskalation aktiv: Ursache manuell beheben, Testline erneut laufen lassen, Nachweis pruefen.`;
    }

    return `[UNRESOLVED_ATTESTATION] challenge unresolved in ${target} (${kind}). Ursache manuell beheben und preflight erneut ausfuehren.`;
  }

  return `[UNRESOLVED_ATTESTATION] challenge unresolved in ${target} (${kind}).`;
}

/**
 * Increment the vault's pending-failure counter for a repeated unresolved attestation and persist the updated vault.
 *
 * Persists the updated vault to disk and emits an escalation log message when the pending failure count reaches two or more.
 * @param {object} vault - Current vault metadata object.
 * @param {string} head - Current Git HEAD commit hash.
 * @param {string} relPath - Relative path of the target file associated with the failure.
 * @returns {number} The updated pending failure count (1 or greater).
 */
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

/**
 * Clear persisted legacy attestation state when it is safe to do so.
 *
 * If `lock` is absent this is a no-op. When `lock.legacy` is true the function
 * verifies that no visible legacy fault marker remains in any target file;
 * if none is found it removes the persisted state and returns an updated vault
 * with resolution fields cleared and failure counters reset.
 *
 * @param {Object|null} lock - The current lock object (may be `null`); when present and `lock.legacy` is true this function attempts to clear it.
 * @param {Object} vault - The current vault metadata that will be updated and persisted when legacy state is cleared.
 * @returns {{ lock: (Object|null), vault: Object }} An object containing the resulting `lock` (set to `null` if legacy state was cleared, otherwise the original `lock`) and the resulting `vault` (updated and persisted when state was cleared).
 * @throws {Error} If a visible legacy fault marker is detected in any target file.
 */
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

/**
 * Clears a stale injected lock when the repository HEAD has drifted and the injected fault is no longer active.
 *
 * If `lock` is missing or lacks `targetFile` the function is a no-op and returns the original `lock` and `vault`.
 *
 * @param {object|null} lock - Normalized lock object produced by `normalizeLock`. Must contain `targetFile` and `head` when present.
 * @param {object} vault - Normalized vault metadata; failure counters will be reset if the stale lock is cleared.
 * @param {string} head - Current git HEAD commit hash.
 * @returns {{lock: object|null, vault: object}} Returns the unchanged `{ lock, vault }` when no action is taken; when a stale lock is cleared returns `{ lock: null, vault: nextVault }` where `nextVault` has failure counters reset.
 * @throws {Error} Throws an error with a challenge/block message when HEAD drift is detected but the injected fault is still active for the recorded target file.
 */
async function clearStaleHeadDriftIfSafe(lock, vault, head) {
  if (!lock || !lock.targetFile) {
    return { lock, vault };
  }

  const current = await readText(path.join(root, lock.targetFile));
  const drift = assessHeadDrift(lock, current, head);
  if (drift.action === "keep") {
    return { lock, vault };
  }

  if (drift.action === "block") {
    throw new Error(
      buildChallengeBlockMessage({
        phase: "stale-active-fault",
        targetFile: lock.targetFile,
        faultKind: lock.faultKind,
        pendingFailureCount: vault.pendingFailureCount
      })
    );
  }

  await rm(statePath, { force: true });
  const nextVault = {
    ...vault,
    version: POLICY_VERSION,
    policyVersion: POLICY_VERSION,
    pendingFailureCount: 0,
    lastFailureHead: "",
    lastFailureAt: "",
    lastFailureTarget: "",
    secondFailureNotifiedAt: ""
  };
  await writeJson(vaultPath, nextVault);
  console.warn(
    `[PREFLIGHT_GUARD] stale lock cleared after HEAD drift (${lock.head.slice(0, 12)} -> ${head.slice(0, 12)}).`
  );
  return { lock: null, vault: nextVault };
}

/**
 * Arms a deterministic attestation by injecting a fault into a selected target file and recording the resulting lock and vault metadata.
 *
 * Persists the updated vault metadata and the attestation lock, then writes the injected content to the target file. The function updates the vault's seed and generation fields and resets resolution/failure counters.
 *
 * @param {string} head - The current git HEAD identifier associated with this attestation.
 * @param {Object} vault - Current vault metadata object; its `seed` may be used or replaced.
 * @returns {string} The relative path of the target file that was injected.
 */
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

  // Persist metadata before source mutation so a crash never leaves a hidden fault
  // behind without the corresponding attestation record.
  await writeJson(vaultPath, nextVault);
  await writeJson(statePath, lock);
  console.warn(`[PREFLIGHT_GUARD] attestation armed in ${relPath}`);
  await writeFile(absPath, injection.content, "utf8");
  return relPath;
}

/**
 * Validate and either resolve an existing attestation lock or record a pending failure.
 *
 * Validates required lock fields and that the lock's recorded head matches `head`.
 * Compares the current target file state against the lock using `vault.seed`. If the
 * candidate is resolved, removes the lock state, updates and persists the vault with
 * resolution metadata; if not resolved, increments the pending failure counter and
 * returns the failure reason.
 *
 * @param {Object} lock - Attestation lock object; must include `targetFile`, `preStateHash`, `postInjectHash`, and `head`.
 * @param {Object} vault - Vault metadata object (contains `seed` and failure counters); this function may persist an updated vault on resolution.
 * @param {string} head - Current repository HEAD identifier.
 * @returns {{resolved: boolean, pendingFailureCount: number, reasonCode: string}} An object describing whether the lock was resolved, the updated pending failure count, and a short reason code (`"resolved"` on success or an error code from validation on failure).
 * @throws {Error} When the lock payload is missing required fields.
 * @throws {Error} When the lock's recorded head does not match the provided `head`.
 */
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
    return {
      resolved: false,
      pendingFailureCount: failureCount,
      reasonCode: resolution.code
    };
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
  return {
    resolved: true,
    pendingFailureCount: 0,
    reasonCode: "resolved"
  };
}

/**
 * Verify the current preflight attestation state and block execution when verification fails.
 *
 * Validates that no legacy visible fault or active hidden fault signatures are present, and that
 * an existing lock has been resolved for the provided head. If verification passes the function
 * returns normally; otherwise it throws an Error containing a formatted challenge/block message.
 *
 * @param {Object|null} lock - Normalized lock object or null when no active attestation exists.
 * @param {Object} vault - Normalized vault metadata object.
 * @param {string} head - Current git HEAD identifier.
 * @throws {Error} When a legacy visible fault is present (message includes the file path).
 * @throws {Error} When an active hidden fault signature is present (message includes the file path).
 * @throws {Error} When a required attestation lock is missing or unresolved; the error message is a
 *                   challenge/block string produced by buildChallengeBlockMessage describing the
 *                   specific phase (`missing-lock`, `unresolved`, etc.) and context.
 */
async function runVerifyMode(lock, vault, head) {
  const legacyMarkerFile = await findLegacyMarker();
  if (legacyMarkerFile) {
    throw new Error(`[PREFLIGHT_ESCALATION] legacy visible fault present in ${legacyMarkerFile}`);
  }

  if (!lock) {
    const activeFaultFile = await findActiveHiddenFault();
    if (activeFaultFile) {
      throw new Error(`[UNRESOLVED_ATTESTATION] hidden fault signature present in ${activeFaultFile}`);
    }

    if (vault.lastGeneratedHead === head && vault.lastResolvedHead !== head) {
      throw new Error(buildChallengeBlockMessage({ phase: "missing-lock" }));
    }
    console.log("[PREFLIGHT_GUARD] verify mode: no active attestation");
    return;
  }

  const resolution = await resolveOrKeepLock(lock, vault, head);
  if (!resolution.resolved) {
    throw new Error(
      buildChallengeBlockMessage({
        phase: "unresolved",
        targetFile: lock.targetFile,
        faultKind: lock.faultKind,
        pendingFailureCount: resolution.pendingFailureCount
      })
    );
  }
}

/**
 * Enforce the preflight attestation policy for the current HEAD, blocking, clearing, or arming an attestation as required.
 *
 * @param {Object|null} lock - Normalized lock object if an attestation is active, otherwise `null`.
 * @param {Object} vault - Normalized vault metadata object (contains seed and generation/resolution history).
 * @param {string} head - Current git HEAD identifier.
 *
 * @throws {Error} If a legacy visible fault marker exists in the workspace.
 * @throws {Error} If an active lock exists but its resolution check indicates the attestation is still unresolved; the error message contains a challenge block describing the unresolved state and escalation count.
 * @throws {Error} If a hidden injected fault signature is present in any target file.
 * @throws {Error} If the vault records that the current head was recently generated but not resolved (metadata drift).
 * @throws {Error} After creating and persisting a new injected attestation, to surface an "armed" challenge that names the injected target file.
 */
async function runEnforceMode(lock, vault, head) {
  const legacyMarkerFile = await findLegacyMarker();
  if (legacyMarkerFile) {
    throw new Error(`[PREFLIGHT_ESCALATION] legacy visible fault present in ${legacyMarkerFile}`);
  }

  if (lock) {
    const resolution = await resolveOrKeepLock(lock, vault, head);
    if (!resolution.resolved) {
      throw new Error(
        buildChallengeBlockMessage({
          phase: "unresolved",
          targetFile: lock.targetFile,
          faultKind: lock.faultKind,
          pendingFailureCount: resolution.pendingFailureCount
        })
      );
    }
    return;
  }

  const activeFaultFile = await findActiveHiddenFault();
  if (activeFaultFile) {
    throw new Error(`[UNRESOLVED_ATTESTATION] hidden fault signature present in ${activeFaultFile}`);
  }

  if (vault.lastGeneratedHead === head) {
    if (vault.lastResolvedHead === head) {
      console.log(`[PREFLIGHT_GUARD] HEAD ${head.slice(0, 12)} bereits sauber attestiert; keine neue Injektion.`);
      return;
    }
    throw new Error(buildChallengeBlockMessage({ phase: "metadata-drift" }));
  }

  const armedTarget = await ensureInjectedLock(head, vault);
  throw new Error(
    buildChallengeBlockMessage({
      phase: "armed",
      targetFile: armedTarget
    })
  );
}

/**
 * Orchestrates the preflight mutation guard: selects mode, loads and normalizes state, runs cleanup, and dispatches to verify or enforce flows.
 *
 * Determines mode from CLI flags, environment (`PREFLIGHT_GUARD_MODE`) or CI defaults; loads `lock` and `vault`, runs legacy and stale-head cleanup steps, then executes the chosen mode's workflow.
 *
 * On any error prints a blocking message, emits a directory listing for diagnostics, and exits the process with status code 1.
 */
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
    const headPrepared = await clearStaleHeadDriftIfSafe(lock, vault, head);
    lock = headPrepared.lock;
    vault = headPrepared.vault;

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