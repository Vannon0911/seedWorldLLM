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

function assertSafeKey(key) {
  if (key === "__proto__" || key === "prototype" || key === "constructor") {
    throw new Error("[SANITIZE] Ungueltiger Objekt-Schluessel.");
  }
}

function assertDataPropertyDescriptor(descriptor) {
  if (!descriptor || typeof descriptor.get === "function" || typeof descriptor.set === "function") {
    throw new Error("[SANITIZE] Accessor-Properties sind nicht erlaubt.");
  }
}

function sanitizePlainObject(value) {
  const out = Object.create(null);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(value);

  for (const key of keys) {
    assertSafeKey(key);
    assertDataPropertyDescriptor(descriptors[key]);
    out[key] = deepSanitize(value[key]);
  }

  return out;
}

function sanitizeArray(value) {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(value);

  for (const key of keys) {
    assertDataPropertyDescriptor(descriptors[key]);
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new Error("[SANITIZE] Unerlaubter Array-Schluessel.");
    }
  }

  const out = new Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    if (!hasOwn(value, String(i))) {
      throw new Error("[SANITIZE] Sparse Arrays sind nicht erlaubt.");
    }

    out[i] = deepSanitize(value[i]);
  }

  return out;
}

function deepSanitize(value) {
  if (value === null) {
    return null;
  }

  const type = typeof value;
  if (type === "string" || type === "boolean") {
    return value;
  }

  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("[SANITIZE] NaN/Infinity nicht erlaubt.");
    }

    return value;
  }

  if (type === "undefined" || type === "function" || type === "symbol" || type === "bigint") {
    throw new Error(`[SANITIZE] Typ nicht erlaubt: ${type}`);
  }

  if (Array.isArray(value)) {
    return sanitizeArray(value);
  }

  if (!isPlainObject(value)) {
    throw new Error("[SANITIZE] Nur Plain-Objects erlaubt.");
  }

  return sanitizePlainObject(value);
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

function hasOwnStringField(object, key, errorMessage) {
  if (!hasOwn(object, key)) {
    throw new Error(errorMessage);
  }

  if (typeof object[key] !== "string") {
    throw new Error(errorMessage);
  }

  return object[key].trim();
}

function setAtPath(target, parts, value) {
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!isPlainObject(cursor[key])) {
      cursor[key] = Object.create(null);
    }
    cursor = cursor[key];
  }

  cursor[parts[parts.length - 1]] = deepSanitize(value);
}

function removeAtPath(target, parts) {
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!isPlainObject(cursor[key])) {
      return;
    }
    cursor = cursor[key];
  }

  delete cursor[parts[parts.length - 1]];
}

function mergeAtPath(target, parts, value) {
  if (!isPlainObject(value)) {
    throw new Error("[PATCH_GATE] merge erwartet Plain-Object value.");
  }

  let cursor = target;
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    if (!isPlainObject(cursor[key])) {
      cursor[key] = Object.create(null);
    }
    cursor = cursor[key];
  }

  for (const key of Object.keys(value)) {
    cursor[key] = deepSanitize(value[key]);
  }
}

function assertAllowedPath(path, allowedPrefixes) {
  const allowed = allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
  if (!allowed) {
    throw new Error(`[PATCH_GATE] Pfad nicht in mutationMatrix erlaubt: ${path}`);
  }
}

function assertDomainGate(domain, patchDomain) {
  if (!patchDomain) {
    throw new Error("[DOMAIN_GATE] Patch-Domain fehlt.");
  }

  if (patchDomain !== domain) {
    throw new Error(`[DOMAIN_GATE] Patch-Domain ${patchDomain} passt nicht zu Dispatch-Domain ${domain}`);
  }
}

export function applyPatches(baseState, patches, options = {}) {
  // @doc-anchor STORE-PATCH-GATE
  // @mut-point MUT-STORE-PATCH
  const domain = hasOwn(options, "domain") && typeof options.domain === "string" ? options.domain.trim() : "";
  const mutationMatrix = hasOwn(options, "mutationMatrix") ? options.mutationMatrix : {};

  if (!isPlainObject(baseState)) {
    throw new Error("[STORE] baseState muss Plain-Object sein.");
  }

  if (!isPlainObject(mutationMatrix)) {
    throw new Error("[STORE] mutationMatrix muss Plain-Object sein.");
  }

  if (!Array.isArray(patches)) {
    throw new Error("[STORE] patches muss Array sein.");
  }

  if (!domain) {
    throw new Error("[DOMAIN_GATE] Dispatch-Domain fehlt.");
  }

  const hasDomainEntry = Object.prototype.hasOwnProperty.call(mutationMatrix, domain);
  const allowedPrefixes = hasDomainEntry ? mutationMatrix[domain] : undefined;
  if (!Array.isArray(allowedPrefixes) || allowedPrefixes.length === 0) {
    throw new Error(`[DOMAIN_GATE] Keine mutationMatrix-Eintraege fuer Domain ${domain}`);
  }

  const safeAllowedPrefixes = allowedPrefixes.map((prefix) => sanitizePath(prefix));
  const nextState = structuredClone(sanitizeForStore(baseState));

  for (const patch of patches) {
    if (!isPlainObject(patch)) {
      throw new Error("[PATCH_GATE] Patch muss Plain-Object sein.");
    }

    const op = hasOwnStringField(patch, "op", "[PATCH_GATE] Patch muss op enthalten.");
    const path = sanitizePath(hasOwnStringField(patch, "path", "[PATCH_GATE] Patch muss path enthalten."));
    const patchDomain = hasOwnStringField(patch, "domain", "[DOMAIN_GATE] Patch-Domain fehlt.");

    assertDomainGate(domain, patchDomain);
    assertAllowedPath(path, safeAllowedPrefixes);

    const parts = path.split(".");

    if (op === "set") {
      if (!hasOwn(patch, "value")) {
        throw new Error("[PATCH_GATE] set erfordert value.");
      }

      setAtPath(nextState, parts, patch.value);
      continue;
    }

    if (op === "remove") {
      removeAtPath(nextState, parts);
      continue;
    }

    if (op === "merge") {
      if (!hasOwn(patch, "value")) {
        throw new Error("[PATCH_GATE] merge erfordert value.");
      }

      mergeAtPath(nextState, parts, patch.value);
      continue;
    }

    throw new Error(`[PATCH_GATE] Unbekannte Patch-Operation: ${op}`);
  }

  return sanitizeForStore(nextState);
}

export function sanitizeForStore(value) {
  return deepSanitize(value);
}
