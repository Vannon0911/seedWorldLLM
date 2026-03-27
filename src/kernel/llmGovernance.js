import { applyPatches, sanitizeForStore } from "./store/applyPatches.js";
import { withDeterminismGuards } from "./runtimeGuards.js";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function sanitizePath(pathValue) {
  if (typeof pathValue !== "string") {
    throw new Error("[PATCH_GATE] Ungueltiger Patch-Pfad.");
  }

  const path = pathValue.trim();
  if (path.length === 0 || path === "/" || path === "$") {
    throw new Error("[PATCH_GATE] Root-Container-Replacement ist verboten.");
  }

  if (path.includes("..") || path.startsWith(".") || path.endsWith(".")) {
    throw new Error("[PATCH_GATE] Ungueltiger Patch-Pfad.");
  }

  const parts = path.split(".");
  for (const part of parts) {
    if (!part || part === "__proto__" || part === "prototype" || part === "constructor") {
      throw new Error("[PATCH_GATE] Ungueltiger Patch-Pfad.");
    }
  }

  return path;
}

function assertAllowedPath(path, allowedPrefixes) {
  const allowed = allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
  if (!allowed) {
    throw new Error(`[PATCH_GATE] Pfad nicht in mutationMatrix erlaubt: ${path}`);
  }
}

function validateActionSchema(action, actionSchema) {
  if (!isPlainObject(action)) {
    throw new Error("[LLM_GOVERNANCE] Action muss Plain-Object sein.");
  }

  if (!isPlainObject(actionSchema)) {
    throw new Error("[LLM_GOVERNANCE] actionSchema muss Plain-Object sein.");
  }

  if (!hasOwn(action, "type") || typeof action.type !== "string") {
    throw new Error("[LLM_GOVERNANCE] Action type fehlt.");
  }

  const type = action.type.trim();
  if (!type) {
    throw new Error("[LLM_GOVERNANCE] Action type fehlt.");
  }

  const hasSchema = Object.prototype.hasOwnProperty.call(actionSchema, type);
  const schema = hasSchema ? actionSchema[type] : undefined;
  if (!schema) {
    throw new Error(`[LLM_GOVERNANCE] Action type nicht erlaubt: ${type}`);
  }

  const payloadInput = hasOwn(action, "payload") ? action.payload : {};
  const metaInput = hasOwn(action, "meta") ? action.meta : {};

  if (!isPlainObject(payloadInput)) {
    throw new Error("[LLM_GOVERNANCE] payload muss Plain-Object sein.");
  }

  if (!isPlainObject(metaInput)) {
    throw new Error("[LLM_GOVERNANCE] meta muss Plain-Object sein.");
  }

  const payload = sanitizeForStore(payloadInput);
  const required = Object.prototype.hasOwnProperty.call(schema, "required") && Array.isArray(schema.required)
    ? schema.required
    : [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(`[LLM_GOVERNANCE] Pflichtfeld fehlt: ${key}`);
    }
  }

  return { type, payload, meta: sanitizeForStore(metaInput) };
}

function validatePatchGate(patches, domain, mutationMatrix) {
  if (!isPlainObject(mutationMatrix)) {
    throw new Error("[LLM_GOVERNANCE] mutationMatrix muss Plain-Object sein.");
  }

  const hasDomainEntry = Object.prototype.hasOwnProperty.call(mutationMatrix, domain);
  const allowedPrefixes = hasDomainEntry ? mutationMatrix[domain] : undefined;
  if (!Array.isArray(allowedPrefixes) || allowedPrefixes.length === 0) {
    throw new Error(`[DOMAIN_GATE] Keine mutationMatrix-Eintraege fuer Domain ${domain}`);
  }

  const safeAllowedPrefixes = allowedPrefixes.map((prefix) => sanitizePath(prefix));

  if (!Array.isArray(patches)) {
    throw new Error("[LLM_GOVERNANCE] patches muss Array sein.");
  }

  for (const patch of patches) {
    if (!isPlainObject(patch)) {
      throw new Error("[PATCH_GATE] Patch muss Plain-Object sein.");
    }

    if (!hasOwn(patch, "op") || typeof patch.op !== "string" || !patch.op.trim()) {
      throw new Error("[PATCH_GATE] Patch muss op enthalten.");
    }

    if (!hasOwn(patch, "path") || typeof patch.path !== "string") {
      throw new Error("[PATCH_GATE] Patch muss path enthalten.");
    }

    if (!hasOwn(patch, "domain") || typeof patch.domain !== "string") {
      throw new Error("[DOMAIN_GATE] Patch-Domain fehlt.");
    }

    const patchDomain = patch.domain.trim();
    if (!patchDomain) {
      throw new Error("[DOMAIN_GATE] Patch-Domain fehlt.");
    }

    if (patchDomain !== domain) {
      throw new Error(`[DOMAIN_GATE] Patch-Domain ${patchDomain} passt nicht zu Dispatch-Domain ${domain}`);
    }

    const path = sanitizePath(patch.path);
    assertAllowedPath(path, safeAllowedPrefixes);

    const op = patch.op.trim();
    if ((op === "set" || op === "merge") && !hasOwn(patch, "value")) {
      throw new Error(`[PATCH_GATE] ${op} erfordert value.`);
    }
  }
}

export async function enforceLlmGovernanceChain(input = {}) {
  // @doc-anchor LLM-GOVERNANCE-CHAIN
  // @mut-point MUT-LLM-GOV-CHAIN
  if (!isPlainObject(input)) {
    throw new Error("[LLM_GOVERNANCE] input muss Plain-Object sein.");
  }

  const actionSchema = hasOwn(input, "actionSchema") ? input.actionSchema : {};
  const mutationMatrix = hasOwn(input, "mutationMatrix") ? input.mutationMatrix : {};
  const domain = hasOwn(input, "domain") && typeof input.domain === "string" ? input.domain.trim() : "";
  const patches = hasOwn(input, "patches") ? input.patches : [];

  if (!domain) {
    throw new Error("[LLM_GOVERNANCE] Domain fehlt.");
  }

  const validatedAction = validateActionSchema(input.action, actionSchema);
  validatePatchGate(patches, domain, mutationMatrix);

  const nextState = await withDeterminismGuards(async () => {
    const stateInput = hasOwn(input, "state") ? input.state : {};
    const state = sanitizeForStore(stateInput);
    return applyPatches(state, patches, {
      domain,
      mutationMatrix
    });
  });

  return {
    status: "ok",
    chain: [
      "Action-Schema",
      "Mutation-Matrix",
      "Domain-Patch-Gate",
      "Determinism-Guard",
      "Sanitization"
    ],
    validatedAction,
    previewState: nextState
  };
}
