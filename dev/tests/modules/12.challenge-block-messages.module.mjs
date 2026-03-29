import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "12-challenge-block-messages";

/**
 * Tests for buildChallengeBlockMessage and assessHeadDrift exported from
 * preflight-mutation-guard.mjs.
 *
 * Covers all message phases, escalation thresholds, default values for
 * missing parameters, and all three HEAD-drift outcomes.
 *
 * @param {Object} ctx - Test context.
 * @param {Object} ctx.assert - Assertion utilities from the test harness.
 * @param {string} ctx.root - Filesystem root of the project.
 */
export async function test({ assert, root }) {
  const guardModule = await import(
    pathToFileURL(path.join(root, "dev/tools/runtime/preflight-mutation-guard.mjs")).href
  );

  const { buildChallengeBlockMessage, assessHeadDrift, normalizeLock } = guardModule;

  // === buildChallengeBlockMessage ===

  // --- phase: "armed" ---
  const armedMsg = buildChallengeBlockMessage({
    phase: "armed",
    targetFile: "app/src/game/worldGen.js",
    faultKind: "lake-biome-drift"
  });
  assert.match(armedMsg, /challenge armed/i, "armed phase must mention 'challenge armed'");
  assert.match(armedMsg, /worldGen\.js/, "armed phase message must include the target file");
  assert.match(armedMsg, /lake-biome-drift/, "armed phase message must include the fault kind");
  assert.match(armedMsg, /UNRESOLVED_ATTESTATION/, "armed phase must include the attestation prefix");

  // --- phase: "stale-active-fault" ---
  const staleMsg = buildChallengeBlockMessage({
    phase: "stale-active-fault",
    targetFile: "app/server/patchUtils.js",
    faultKind: "lock-validation-freeze"
  });
  assert.match(staleMsg, /stale lock/i, "stale-active-fault phase must mention 'stale lock'");
  assert.match(staleMsg, /patchUtils\.js/, "stale-active-fault message must include target file");
  assert.match(staleMsg, /UNRESOLVED_ATTESTATION/, "stale-active-fault must include the attestation prefix");

  // --- phase: "missing-lock" ---
  const missingMsg = buildChallengeBlockMessage({
    phase: "missing-lock",
    targetFile: "app/src/kernel/runtimeGuards.js"
  });
  assert.match(missingMsg, /missing lock/i, "missing-lock phase must mention 'missing lock'");
  assert.match(missingMsg, /UNRESOLVED_ATTESTATION/, "missing-lock must include the attestation prefix");

  // --- phase: "metadata-drift" ---
  const driftMsg = buildChallengeBlockMessage({
    phase: "metadata-drift",
    targetFile: "app/src/kernel/fingerprint.js"
  });
  assert.match(driftMsg, /STATE_DRIFT/, "metadata-drift phase must include STATE_DRIFT prefix");
  assert.match(driftMsg, /unresolved attestation metadata/i, "metadata-drift must mention 'unresolved attestation metadata'");

  // --- phase: "unresolved" without escalation ---
  const unresolvedMsg = buildChallengeBlockMessage({
    phase: "unresolved",
    targetFile: "app/src/game/worldGen.js",
    faultKind: "lake-biome-drift",
    pendingFailureCount: 1
  });
  assert.match(unresolvedMsg, /UNRESOLVED_ATTESTATION/, "unresolved phase must include prefix");
  assert.match(unresolvedMsg, /worldGen\.js/, "unresolved message must include target file");
  // Must NOT have escalation language for count < 2
  assert.equal(
    unresolvedMsg.includes("Eskalation"),
    false,
    "unresolved with count=1 must NOT include escalation language"
  );

  // --- phase: "unresolved" with escalation (pendingFailureCount >= 2) ---
  const escalatedMsg = buildChallengeBlockMessage({
    phase: "unresolved",
    targetFile: "app/src/game/worldGen.js",
    faultKind: "lake-biome-drift",
    pendingFailureCount: 2
  });
  assert.match(escalatedMsg, /Eskalation aktiv/i, "unresolved with count>=2 must include 'Eskalation aktiv'");
  assert.match(escalatedMsg, /UNRESOLVED_ATTESTATION/, "escalated message must include prefix");

  // Boundary: count exactly 2 is escalation
  const escalatedExact2 = buildChallengeBlockMessage({
    phase: "unresolved",
    targetFile: "x.js",
    faultKind: "test-fault",
    pendingFailureCount: 2
  });
  assert.match(escalatedExact2, /Eskalation/i, "pendingFailureCount === 2 is the escalation threshold");

  // Higher count also escalates
  const escalatedHigh = buildChallengeBlockMessage({
    phase: "unresolved",
    targetFile: "x.js",
    faultKind: "test-fault",
    pendingFailureCount: 10
  });
  assert.match(escalatedHigh, /Eskalation/i, "pendingFailureCount > 2 must also escalate");

  // --- unknown phase falls back to generic message ---
  const unknownMsg = buildChallengeBlockMessage({
    phase: "totally-unknown-phase",
    targetFile: "some/file.js",
    faultKind: "some-fault"
  });
  assert.match(unknownMsg, /UNRESOLVED_ATTESTATION/, "unknown phase must still include attestation prefix");
  assert.match(unknownMsg, /some\/file\.js/, "unknown phase must include target file");

  // --- default values: empty targetFile and faultKind ---
  const defaultsMsg = buildChallengeBlockMessage({ phase: "armed" });
  assert.match(defaultsMsg, /<unknown-target>/, "empty targetFile must default to <unknown-target>");
  assert.match(defaultsMsg, /unknown-fault/, "empty faultKind must default to 'unknown-fault'");

  // === assessHeadDrift ===

  // --- null lock: always "keep" ---
  assert.deepEqual(
    assessHeadDrift(null, "anything", "head-abc"),
    { action: "keep" },
    "null lock must return keep"
  );

  // --- lock with no head field: always "keep" ---
  const emptyLock = normalizeLock({ targetFile: "app/server/patchUtils.js", preStateHash: "aaa", postInjectHash: "bbb" });
  // emptyLock.head will be "" which is falsy
  assert.deepEqual(
    assessHeadDrift(emptyLock, "some content", "head-abc"),
    { action: "keep" },
    "lock with empty head must return keep"
  );

  // --- lock.head === currentHead: always "keep" ---
  const lockSameHead = normalizeLock({
    targetFile: "app/server/patchUtils.js",
    head: "head-abc123",
    preStateHash: "pre111",
    postInjectHash: "post222",
    faultKind: "lock-validation-freeze"
  });
  assert.deepEqual(
    assessHeadDrift(lockSameHead, "some content without fault", "head-abc123"),
    { action: "keep" },
    "when recorded head equals currentHead, must return keep"
  );

  // --- lock.head !== currentHead, fault still active: block ---
  // For patchUtils.js, isFaultStillActive checks: content.includes("ok: false,")
  const lockStaleActive = normalizeLock({
    targetFile: "app/server/patchUtils.js",
    head: "head-old-commit",
    preStateHash: "pre333",
    postInjectHash: "post444",
    faultKind: "lock-validation-freeze"
  });
  const contentWithFault = 'some code\nok: false,\nmore code';
  const blockResult = assessHeadDrift(lockStaleActive, contentWithFault, "head-new-commit");
  assert.equal(blockResult.action, "block", "active fault on stale lock must return block");
  assert.equal(blockResult.code, "stale-head-active-fault", "block result must have correct code");

  // --- lock.head !== currentHead, fault no longer active: clear-stale-lock ---
  const contentNoFault = 'some code\nok: violations.length === 0,\nmore code';
  const clearResult = assessHeadDrift(lockStaleActive, contentNoFault, "head-new-commit");
  assert.equal(clearResult.action, "clear-stale-lock", "resolved stale lock must return clear-stale-lock");
  assert.equal(clearResult.code, "stale-head-resolved", "clear result must have correct code");

  // --- runtimeGuards.js fault: isFaultStillActive checks for 'if (activeGuardScope === null) {' ---
  const lockGuards = normalizeLock({
    targetFile: "app/src/kernel/runtimeGuards.js",
    head: "head-old",
    preStateHash: "pre555",
    postInjectHash: "post666",
    faultKind: "guard-scope-inversion"
  });
  const contentWithGuardFault = 'function check() {\n  if (activeGuardScope === null) {\n    throw;\n  }\n}';
  const blockGuards = assessHeadDrift(lockGuards, contentWithGuardFault, "head-new");
  assert.equal(blockGuards.action, "block", "guard fault still active must block");

  const contentGuardFixed = 'function check() {\n  if (activeGuardScope !== null) {\n    throw;\n  }\n}';
  const clearGuards = assessHeadDrift(lockGuards, contentGuardFixed, "head-new");
  assert.equal(clearGuards.action, "clear-stale-lock", "fixed guard fault with HEAD drift must clear stale lock");
}

export const run = test;