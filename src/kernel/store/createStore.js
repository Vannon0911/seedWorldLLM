import { withDeterminismGuards } from "../runtimeGuards.js";
import { applyPatches, sanitizeForStore } from "./applyPatches.js";

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

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    const keys = Array.isArray(value) ? Object.keys(value) : Object.keys(value);
    for (const key of keys) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

function validateActionAgainstSchema(action, actionSchema) {
  if (!isPlainObject(action)) {
    throw new Error("[ACTION_SCHEMA] Action muss Plain-Object sein.");
  }

  if (!hasOwn(action, "type") || typeof action.type !== "string") {
    throw new Error("[ACTION_SCHEMA] type fehlt.");
  }

  const type = action.type.trim();
  if (!type) {
    throw new Error("[ACTION_SCHEMA] type fehlt.");
  }

  const hasSchema = Object.prototype.hasOwnProperty.call(actionSchema, type);
  const schema = hasSchema ? actionSchema[type] : undefined;
  if (!schema) {
    throw new Error(`[ACTION_SCHEMA] Unbekannter Action-Type: ${type}`);
  }

  const payloadInput = hasOwn(action, "payload") ? action.payload : {};
  const metaInput = hasOwn(action, "meta") ? action.meta : {};

  if (!isPlainObject(payloadInput)) {
    throw new Error("[ACTION_SCHEMA] payload muss Plain-Object sein.");
  }

  if (!isPlainObject(metaInput)) {
    throw new Error("[ACTION_SCHEMA] meta muss Plain-Object sein.");
  }

  const payload = sanitizeForStore(payloadInput);
  const required = Object.prototype.hasOwnProperty.call(schema, "required") && Array.isArray(schema.required)
    ? schema.required
    : [];

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(`[ACTION_SCHEMA] Pflichtfeld fehlt: ${key}`);
    }
  }

  return { type, payload, meta: sanitizeForStore(metaInput) };
}

export function createStore(options = {}) {
  // @doc-anchor STORE-DISPATCH-GATE
  // @mut-point MUT-STORE-DISPATCH
  if (!isPlainObject(options)) {
    throw new Error("[STORE] options muss Plain-Object sein.");
  }

  const reducer = hasOwn(options, "reducer") ? options.reducer : undefined;
  const simStep = hasOwn(options, "simStep") ? options.simStep : undefined;
  const actionSchema = hasOwn(options, "actionSchema") ? options.actionSchema : {};
  const mutationMatrix = hasOwn(options, "mutationMatrix") ? options.mutationMatrix : {};
  const guardDeterminism = !hasOwn(options, "guardDeterminism") || options.guardDeterminism !== false;

  if (hasOwn(options, "guardDeterminism") && options.guardDeterminism === false) {
    throw new Error("[STORE] guardDeterminism darf nicht deaktiviert werden.");
  }

  if (typeof reducer !== "function") {
    throw new Error("[STORE] reducer Funktion fehlt.");
  }

  if (simStep !== undefined && typeof simStep !== "function") {
    throw new Error("[STORE] simStep muss Funktion sein.");
  }

  if (!isPlainObject(actionSchema)) {
    throw new Error("[STORE] actionSchema muss Plain-Object sein.");
  }

  if (!isPlainObject(mutationMatrix)) {
    throw new Error("[STORE] mutationMatrix muss Plain-Object sein.");
  }

  const initialStateInput = hasOwn(options, "initialState") ? options.initialState : {};
  const sanitizedInitialState = sanitizeForStore(initialStateInput);
  if (!isPlainObject(sanitizedInitialState)) {
    throw new Error("[STORE] initialState muss Plain-Object sein.");
  }

  let state = deepFreeze(sanitizedInitialState);

  async function runWithGuard(run) {
    if (!guardDeterminism) {
      throw new Error("[STORE] guardDeterminism muss true sein.");
    }

    return withDeterminismGuards(run);
  }

  return {
    getState() {
      return state;
    },

    async dispatch(action, dispatchOptions = {}) {
      if (!isPlainObject(dispatchOptions)) {
        throw new Error("[DOMAIN_GATE] dispatch() verlangt eine Plain-Object-Option.");
      }

      const domain = hasOwn(dispatchOptions, "domain") && typeof dispatchOptions.domain === "string" ? dispatchOptions.domain.trim() : "";
      if (!domain) {
        throw new Error("[DOMAIN_GATE] dispatch() verlangt eine Domain.");
      }

      const safeAction = validateActionAgainstSchema(action, actionSchema);

      const reducerInput = deepFreeze(structuredClone(state));
      const reduced = await runWithGuard(async () => reducer(reducerInput, safeAction));
      const reducedState = deepFreeze(sanitizeForStore(reduced));

      if (!isPlainObject(reducedState)) {
        throw new Error("[STORE] reducer muss Plain-Object State liefern.");
      }

      const simInput = deepFreeze(structuredClone(reducedState));
      const patches = simStep ? await runWithGuard(async () => simStep(simInput, safeAction)) : [];

      const patchList = patches === undefined ? [] : patches;
      const patchedState = applyPatches(reducedState, patchList, {
        domain,
        mutationMatrix
      });

      state = deepFreeze(sanitizeForStore(patchedState));
      return state;
    }
  };
}
