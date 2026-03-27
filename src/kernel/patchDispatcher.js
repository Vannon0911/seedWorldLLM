const patchState = {
  functions: new Set([
    "executeKernelCommand",
    "planPatchDispatch",
    "applyPatchDispatch",
    "getPatchStateSnapshot",
    "enforceLlmGovernanceChain",
    "withDeterminismGuards",
    "sanitizeForStore",
    "applyPatches"
  ]),
  appliedPatches: new Map(),
  pendingConfirmations: new Map(),
  confirmCounter: 0,
  applyCounter: 0
};

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function gateError(code, message) {
  const error = new Error(`[PATCH_GATE][${code}] ${message}`);
  error.code = code;
  return error;
}

function assert(condition, code, message) {
  if (!condition) {
    throw gateError(code, message);
  }
}

function addUnique(target, seen, value) {
  if (!seen.has(value)) {
    seen.add(value);
    target.push(value);
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

function createPatchSignature(patch) {
  return stableStringify({
    patchId: patch.patchId,
    target: patch.target,
    operations: patch.operations
  });
}

function parsePatchEnvelope(envelope) {
  // @doc-anchor PATCH-DISPATCHER-GATE
  // @mut-point MUT-PATCH-GATE
  assert(isPlainObject(envelope), "BLOCKED_FORMAT", "Payload muss Objekt sein.");
  assert(envelope.patched === true, "BLOCKED_FORMAT", "`patched: true` ist Pflicht.");

  const patch = envelope.patch;
  assert(isPlainObject(patch), "BLOCKED_FORMAT", "`patch` Objekt fehlt.");
  assert(typeof patch.patchId === "string" && patch.patchId.trim().length > 0, "BLOCKED_FORMAT", "patchId fehlt.");
  assert(patch.target === "kernel", "BLOCKED_FORMAT", "target muss `kernel` sein.");
  assert(Array.isArray(patch.operations) && patch.operations.length > 0, "BLOCKED_FORMAT", "operations fehlt/leer.");

  for (const op of patch.operations) {
    assert(isPlainObject(op), "BLOCKED_FORMAT", "Operation muss Objekt sein.");
    assert(op.op === "addFunction", "BLOCKED_FORMAT", "Nur op=addFunction ist erlaubt.");
    assert(typeof op.name === "string" && op.name.trim().length > 0, "BLOCKED_FORMAT", "Function-Name fehlt.");
    if (op.linksTo !== undefined) {
      assert(Array.isArray(op.linksTo), "BLOCKED_FORMAT", "linksTo muss Array sein.");
      for (const link of op.linksTo) {
        assert(typeof link === "string" && link.trim().length > 0, "BLOCKED_FORMAT", "linksTo Eintrag ungueltig.");
      }
    }
  }

  return {
    patchId: patch.patchId.trim(),
    target: patch.target,
    signature: createPatchSignature({
      patchId: patch.patchId.trim(),
      target: patch.target,
      operations: patch.operations.map((op) => ({
        op: op.op,
        name: op.name.trim(),
        linksTo: Array.isArray(op.linksTo) ? op.linksTo.map((x) => String(x).trim()) : []
      }))
    }),
    operations: patch.operations.map((op) => ({
      op: op.op,
      name: op.name.trim(),
      linksTo: Array.isArray(op.linksTo) ? op.linksTo.map((x) => String(x).trim()) : []
    }))
  };
}

function analyzePatch(patch) {
  const conflicts = [];
  const directLinks = [];
  const internalLinks = [];
  const unresolvedLinks = [];
  const selfLinks = [];
  const knownNewNames = new Set(patch.operations.map((op) => op.name));
  const nameCounts = new Map();
  const seenMessages = new Set();

  for (const op of patch.operations) {
    nameCounts.set(op.name, (nameCounts.get(op.name) || 0) + 1);
  }

  for (const [name, count] of nameCounts.entries()) {
    if (count > 1) {
      addUnique(conflicts, seenMessages, `Doppelte neue Funktion im selben Patch: ${name}`);
    }
  }

  for (const op of patch.operations) {
    if (patchState.functions.has(op.name)) {
      addUnique(conflicts, seenMessages, `Funktion existiert bereits: ${op.name}`);
    }

    for (const link of op.linksTo) {
      if (link === op.name) {
        addUnique(selfLinks, seenMessages, `Neue Funktion ${op.name} verweist auf sich selbst.`);
        continue;
      }

      if (patchState.functions.has(link)) {
        addUnique(directLinks, seenMessages, `Neue Funktion ${op.name} verknuepft direkt mit bestehender Funktion ${link}`);
        continue;
      }

      if (knownNewNames.has(link)) {
        addUnique(internalLinks, seenMessages, `Neue Funktion ${op.name} koppelt an ${link} im selben Patch.`);
        continue;
      }

      addUnique(unresolvedLinks, seenMessages, `Neue Funktion ${op.name} referenziert unbekannte Funktion ${link}.`);
    }
  }

  const couplings = [...directLinks, ...internalLinks, ...selfLinks, ...unresolvedLinks];
  const requiresConfirmation = conflicts.length > 0 || couplings.length > 0;

  return {
    patchId: patch.patchId,
    target: patch.target,
    newFunctions: [...new Set(patch.operations.map((op) => op.name))],
    conflicts,
    directLinks,
    internalLinks,
    unresolvedLinks,
    selfLinks,
    couplings,
    requiresConfirmation
  };
}

function createConfirmationToken(patchId) {
  patchState.confirmCounter += 1;
  return `PATCH-CONFIRM-${patchState.confirmCounter}-${patchId}`;
}

export function planPatchDispatch(envelope) {
  const patch = parsePatchEnvelope(envelope);
  const analysis = analyzePatch(patch);

  if (!analysis.requiresConfirmation) {
    return {
      status: "ok",
      mode: "direct-apply-allowed",
      analysis
    };
  }

  const confirmationToken = createConfirmationToken(patch.patchId);
  patchState.pendingConfirmations.set(confirmationToken, {
    patch,
    analysis,
    signature: patch.signature
  });

  return {
    status: "needs_confirmation",
    confirmationToken,
    analysis
  };
}

export function applyPatchDispatch(envelope, confirmation = {}) {
  const patch = parsePatchEnvelope(envelope);
  const analysis = analyzePatch(patch);

  if (analysis.requiresConfirmation) {
    assert(isPlainObject(confirmation), "CONFIRMATION_REQUIRED", "Bestaetigungsdaten muessen Objekt sein.");

    const token = String(confirmation.token || "").trim();
    const accept = confirmation.accept === true;

    assert(token.length > 0, "CONFIRMATION_REQUIRED", "Bestaetigungstoken fehlt.");
    assert(accept, "CONFIRMATION_REQUIRED", "Explizite Bestaetigung (`accept: true`) fehlt.");

    const pending = patchState.pendingConfirmations.get(token);
    assert(Boolean(pending), "CONFIRMATION_INVALID", "Bestaetigungstoken ungueltig oder abgelaufen.");
    assert(pending.patch.patchId === patch.patchId, "CONFIRMATION_INVALID", "Token passt nicht zu patchId.");
    assert(pending.signature === patch.signature, "CONFIRMATION_INVALID", "Token passt nicht zum Patch-Inhalt.");

    patchState.pendingConfirmations.delete(token);
  }

  assert(!patchState.appliedPatches.has(patch.patchId), "CONFLICT", `Patch bereits angewendet: ${patch.patchId}`);

  for (const op of patch.operations) {
    patchState.functions.add(op.name);
  }

  patchState.applyCounter += 1;
  patchState.appliedPatches.set(patch.patchId, {
    patch,
    sequence: patchState.applyCounter
  });

  return {
    status: "applied",
    patchId: patch.patchId,
    appliedFunctions: patch.operations.map((op) => op.name),
    analysis
  };
}

export function getPatchStateSnapshot() {
  return {
    functions: [...patchState.functions].sort(),
    appliedPatchIds: [...patchState.appliedPatches.keys()].sort(),
    pendingConfirmations: [...patchState.pendingConfirmations.keys()].sort()
  };
}
