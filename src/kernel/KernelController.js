import { applyPatches, sanitizeForStore } from "./store/applyPatches.js";
import { withDeterminismGuards } from "./runtimeGuards.js";

const DEFAULT_CONFIRMATION_PREFIX = "KERNEL-CONFIRM";

export class KernelController {
  constructor(options = {}) {
    this.confirmationPrefix =
      typeof options.confirmationPrefix === "string" && options.confirmationPrefix.trim().length > 0
        ? options.confirmationPrefix.trim()
        : DEFAULT_CONFIRMATION_PREFIX;
  }

  async execute(input = {}) {
    return this.#execute(input);
  }

  async plan(input = {}) {
    return this.#execute(input);
  }

  async apply(input = {}) {
    return this.#execute(input);
  }

  #execute(input) {
    this.#assertPlainObject(input, "input");

    const domain = this.#readString(input, "domain", "[KERNEL_CONTROLLER] domain fehlt.");
    const action = this.#readPlainObject(input, "action", "[KERNEL_CONTROLLER] action fehlt.");
    const state = this.#readPlainObject(input, "state", "[KERNEL_CONTROLLER] state fehlt.");
    const patches = this.#readArray(input, "patches", "[KERNEL_CONTROLLER] patches fehlen.");
    const actionSchema = this.#readPlainObject(input, "actionSchema", "[KERNEL_CONTROLLER] actionSchema fehlt.");
    const mutationMatrix = this.#readPlainObject(input, "mutationMatrix", "[KERNEL_CONTROLLER] mutationMatrix fehlt.");

    this.#assertDomainWhitelist(domain, mutationMatrix);
    this.#assertPathWhitelist(domain, patches, mutationMatrix);

    return withDeterminismGuards(async () => {
      this.#assertActionSchema(action, actionSchema);
      this.#assertNoUnsafeData(domain, action, state, patches, actionSchema, mutationMatrix);
      const safeState = sanitizeForStore(state);
      const safePatches = this.#sanitizeAndValidatePatches(domain, patches, mutationMatrix);
      const previewState = applyPatches(safeState, safePatches, {
        domain,
        mutationMatrix
      });

      const output = { ok: true, previewState };
      if (safePatches.length > 1) {
        output.confirmationToken = `${this.confirmationPrefix}-${domain}-${safePatches.length}`;
      }

      return output;
    });
  }

  #assertDomainWhitelist(domain, mutationMatrix) {
    const allowedDomains = Object.keys(mutationMatrix);
    if (allowedDomains.length === 0) {
      throw new Error("[KERNEL_CONTROLLER] mutationMatrix ohne Domains.");
    }

    if (!allowedDomains.includes(domain)) {
      throw new Error(`[KERNEL_CONTROLLER] Domain nicht erlaubt: ${domain}`);
    }
  }

  #assertPathWhitelist(domain, patches, mutationMatrix) {
    const allowedPrefixes = this.#readAllowedPrefixes(domain, mutationMatrix);

    for (const patch of patches) {
      this.#assertPlainObject(patch, "[KERNEL_CONTROLLER] Patch muss Plain-Object sein.");
      const path = this.#readString(patch, "path", "[KERNEL_CONTROLLER] Patch path fehlt.");
      this.#assertSafePath(path);
      this.#assertPathMatchesWhitelist(path, allowedPrefixes);
    }
  }

  #assertNoUnsafeData(domain, action, state, patches, actionSchema, mutationMatrix) {
    this.#scanForUnsafeTokens(domain, "domain");
    this.#scanForUnsafeTokens(action, "action");
    this.#scanForUnsafeTokens(state, "state");
    this.#scanForUnsafeTokens(patches, "patches");
    this.#scanForUnsafeTokens(actionSchema, "actionSchema");
    this.#scanForUnsafeTokens(mutationMatrix, "mutationMatrix");
  }

  #assertActionSchema(action, actionSchema) {
    const type = this.#readString(action, "type", "[KERNEL_CONTROLLER] action.type fehlt.");
    if (type === "eval") {
      throw new Error("[KERNEL_CONTROLLER] action.type eval ist verboten.");
    }

    const schema = actionSchema[type];
    if (!this.#isPlainObject(schema)) {
      throw new Error(`[KERNEL_CONTROLLER] Unbekannter Action-Type: ${type}`);
    }

    const payload = this.#readPlainObject(action, "payload", "[KERNEL_CONTROLLER] action.payload fehlt.");
    const required = Array.isArray(schema.required) ? schema.required : [];

    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) {
        throw new Error(`[KERNEL_CONTROLLER] Pflichtfeld fehlt: ${key}`);
      }
    }
  }

  #sanitizeAndValidatePatches(domain, patches, mutationMatrix) {
    const allowedPrefixes = this.#readAllowedPrefixes(domain, mutationMatrix);
    const safePatches = [];

    for (const patch of patches) {
      this.#assertPlainObject(patch, "[KERNEL_CONTROLLER] Patch muss Plain-Object sein.");

      const op = this.#readString(patch, "op", "[KERNEL_CONTROLLER] Patch op fehlt.");
      if (op === "eval") {
        throw new Error("[KERNEL_CONTROLLER] Patch op eval ist verboten.");
      }

      const path = this.#readString(patch, "path", "[KERNEL_CONTROLLER] Patch path fehlt.");
      this.#assertSafePath(path);
      this.#assertPathMatchesWhitelist(path, allowedPrefixes);
      this.#assertNoUnsafeDescriptors(patch, "patch");

      if (Object.prototype.hasOwnProperty.call(patch, "value")) {
        this.#scanForUnsafeTokens(patch.value, `patch.value:${path}`);
      }

      safePatches.push(sanitizeForStore(patch));
    }

    return safePatches;
  }

  #readAllowedPrefixes(domain, mutationMatrix) {
    const prefixes = mutationMatrix[domain];
    if (!Array.isArray(prefixes) || prefixes.length === 0) {
      throw new Error(`[KERNEL_CONTROLLER] Keine PATH_WHITELIST fuer Domain: ${domain}`);
    }

    const out = [];
    for (const prefix of prefixes) {
      const safePrefix = this.#normalizePath(prefix);
      out.push(safePrefix);
    }

    return out;
  }

  #assertPathMatchesWhitelist(path, allowedPrefixes) {
    const allowed = allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
    if (!allowed) {
      throw new Error(`[KERNEL_CONTROLLER] Pfad nicht erlaubt: ${path}`);
    }
  }

  #assertSafePath(pathValue) {
    const path = this.#normalizePath(pathValue);
    if (path.length === 0 || path === "/" || path === "$") {
      throw new Error("[KERNEL_CONTROLLER] Root-Pfad ist verboten.");
    }

    if (path.includes("..") || path.startsWith(".") || path.endsWith(".")) {
      throw new Error(`[KERNEL_CONTROLLER] Ungueltiger Pfad: ${path}`);
    }

    const parts = path.split(".");
    for (const part of parts) {
      if (!part || part === "__proto__" || part === "prototype" || part === "constructor") {
        throw new Error(`[KERNEL_CONTROLLER] Ungueltiger Pfad: ${path}`);
      }
    }
  }

  #scanForUnsafeTokens(value, label) {
    if (value === null) {
      return;
    }

    const type = typeof value;
    if (type === "string") {
      if (value.trim() === "eval") {
        throw new Error(`[KERNEL_CONTROLLER] eval ist verboten: ${label}`);
      }
      return;
    }

    if (type === "number" || type === "boolean") {
      return;
    }

    if (type === "undefined" || type === "function" || type === "symbol" || type === "bigint") {
      throw new Error(`[KERNEL_CONTROLLER] Unerlaubter Typ in ${label}: ${type}`);
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        this.#scanForUnsafeTokens(value[i], `${label}[${i}]`);
      }
      return;
    }

    if (!this.#isPlainObject(value)) {
      throw new Error(`[KERNEL_CONTROLLER] Nur Plain-Objects erlaubt in ${label}.`);
    }

    this.#assertNoUnsafeDescriptors(value, label);
    const keys = Object.keys(value);
    for (const key of keys) {
      this.#scanForUnsafeTokens(value[key], `${label}.${key}`);
    }
  }

  #assertNoUnsafeDescriptors(value, label) {
    if (!this.#isPlainObject(value) && !Array.isArray(value)) {
      return;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor" || key === "eval") {
        throw new Error(`[KERNEL_CONTROLLER] Ungueltiger Key in ${label}: ${key}`);
      }

      const descriptor = descriptors[key];
      if (typeof descriptor.get === "function" || typeof descriptor.set === "function") {
        throw new Error(`[KERNEL_CONTROLLER] Getter/Setter verboten in ${label}: ${key}`);
      }
    }
  }

  #normalizePath(pathValue) {
    if (typeof pathValue !== "string") {
      throw new Error("[KERNEL_CONTROLLER] Pfad muss String sein.");
    }

    return pathValue.trim();
  }

  #readString(object, key, message) {
    if (!this.#isPlainObject(object) || !Object.prototype.hasOwnProperty.call(object, key)) {
      throw new Error(message);
    }

    const value = object[key];
    if (typeof value !== "string") {
      throw new Error(message);
    }

    return value.trim();
  }

  #readPlainObject(object, key, message) {
    if (!this.#isPlainObject(object) || !Object.prototype.hasOwnProperty.call(object, key)) {
      throw new Error(message);
    }

    const value = object[key];
    if (!this.#isPlainObject(value)) {
      throw new Error(message);
    }

    this.#assertNoUnsafeDescriptors(value, key);
    return value;
  }

  #readArray(object, key, message) {
    if (!this.#isPlainObject(object) || !Object.prototype.hasOwnProperty.call(object, key)) {
      throw new Error(message);
    }

    const value = object[key];
    if (!Array.isArray(value)) {
      throw new Error(message);
    }

    this.#assertNoUnsafeDescriptors(value, key);
    return value;
  }

  #assertPlainObject(value, message) {
    if (!this.#isPlainObject(value)) {
      throw new Error(message);
    }
  }

  #isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
}
