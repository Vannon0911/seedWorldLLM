const DEFAULT_DOMAIN = "game";

const DEFAULT_ACTION_SCHEMA = Object.freeze({
  produce: {
    required: ["resource", "amount"]
  },
  consume: {
    required: ["resource", "amount"]
  },
  transport: {
    required: ["from", "to", "amount"]
  },
  build: {
    required: ["machine", "count"]
  },
  inspect: {
    required: []
  }
});

const DEFAULT_MUTATION_MATRIX = Object.freeze({
  game: [
    "resources.ore",
    "resources.copper",
    "resources.iron",
    "resources.gears",
    "machines.miners",
    "machines.conveyors",
    "machines.assemblers",
    "logistics.storageA",
    "logistics.storageB",
    "meta.lastAction",
    "meta.revision"
  ]
});

const BUILD_COSTS = Object.freeze({
  miner: 5,
  conveyor: 2,
  assembler: 8
});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepClone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }

  return value;
}

function coercePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`[GAME_LOGIC] ${label} muss eine positive ganze Zahl sein.`);
  }

  return number;
}

function coerceString(value, label) {
  if (typeof value !== "string") {
    throw new Error(`[GAME_LOGIC] ${label} muss String sein.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`[GAME_LOGIC] ${label} darf nicht leer sein.`);
  }

  return trimmed;
}

function normalizeKernelApi(kernelApi) {
  if (!kernelApi || typeof kernelApi !== "object") {
    throw new Error("[GAME_LOGIC] kernelApi fehlt.");
  }

  const planPatch =
    typeof kernelApi.planPatch === "function"
      ? kernelApi.planPatch.bind(kernelApi)
      : typeof kernelApi.plan === "function"
        ? kernelApi.plan.bind(kernelApi)
        : typeof kernelApi.execute === "function"
          ? kernelApi.execute.bind(kernelApi)
          : null;

  const applyPatch =
    typeof kernelApi.applyPatch === "function"
      ? kernelApi.applyPatch.bind(kernelApi)
      : typeof kernelApi.apply === "function"
        ? kernelApi.apply.bind(kernelApi)
        : typeof kernelApi.execute === "function"
          ? kernelApi.execute.bind(kernelApi)
          : null;

  if (!planPatch || !applyPatch) {
    throw new Error("[GAME_LOGIC] kernelApi braucht planPatch/applyPatch.");
  }

  return {
    planPatch,
    applyPatch
  };
}

function readAction(action) {
  if (!isPlainObject(action)) {
    throw new Error("[GAME_LOGIC] action muss Plain-Object sein.");
  }

  const type = coerceString(action.type, "action.type");
  const payload = action.payload === undefined ? {} : action.payload;
  if (!isPlainObject(payload)) {
    throw new Error("[GAME_LOGIC] action.payload muss Plain-Object sein.");
  }

  return { type, payload };
}

function readState(state) {
  if (!isPlainObject(state)) {
    throw new Error("[GAME_LOGIC] state muss Plain-Object sein.");
  }

  return state;
}

function readSchema(actionSchema) {
  if (!isPlainObject(actionSchema)) {
    throw new Error("[GAME_LOGIC] actionSchema muss Plain-Object sein.");
  }

  return actionSchema;
}

function readMutationMatrix(mutationMatrix) {
  if (!isPlainObject(mutationMatrix)) {
    throw new Error("[GAME_LOGIC] mutationMatrix muss Plain-Object sein.");
  }

  return mutationMatrix;
}

function getMachineStateKey(machine) {
  if (machine === "miner") return "miners";
  if (machine === "conveyor") return "conveyors";
  if (machine === "assembler") return "assemblers";
  throw new Error(`[GAME_LOGIC] Unbekannte Maschine: ${machine}`);
}

function getResourcePath(resource) {
  if (resource === "ore" || resource === "copper" || resource === "iron" || resource === "gears") {
    return `resources.${resource}`;
  }

  throw new Error(`[GAME_LOGIC] Unbekannte Resource: ${resource}`);
}

function getStoragePath(slot) {
  if (slot === "storageA" || slot === "storageB") {
    return `logistics.${slot}`;
  }

  throw new Error(`[GAME_LOGIC] Unbekannter Storage-Slot: ${slot}`);
}

function getCountAtPath(state, path) {
  const [root, key] = path.split(".");
  const branch = state[root];
  const value = branch && typeof branch === "object" ? branch[key] : undefined;
  return Number.isFinite(value) ? value : 0;
}

function setCountPatch(path, value) {
  return { op: "set", domain: DEFAULT_DOMAIN, path, value };
}

function buildPatches(action, state) {
  switch (action.type) {
    case "produce": {
      const resource = coerceString(action.payload.resource, "produce.resource");
      const amount = coercePositiveInteger(action.payload.amount, "produce.amount");
      const path = getResourcePath(resource);
      const nextValue = getCountAtPath(state, path) + amount;
      return [setCountPatch(path, nextValue)];
    }

    case "consume": {
      const resource = coerceString(action.payload.resource, "consume.resource");
      const amount = coercePositiveInteger(action.payload.amount, "consume.amount");
      const path = getResourcePath(resource);
      const nextValue = Math.max(0, getCountAtPath(state, path) - amount);
      return [setCountPatch(path, nextValue)];
    }

    case "transport": {
      const from = coerceString(action.payload.from, "transport.from");
      const to = coerceString(action.payload.to, "transport.to");
      const amount = coercePositiveInteger(action.payload.amount, "transport.amount");
      const fromPath = getStoragePath(from);
      const toPath = getStoragePath(to);
      if (fromPath === toPath) {
        return [];
      }

      const nextFrom = Math.max(0, getCountAtPath(state, fromPath) - amount);
      const nextTo = getCountAtPath(state, toPath) + amount;
      return [setCountPatch(fromPath, nextFrom), setCountPatch(toPath, nextTo)];
    }

    case "build": {
      const machine = coerceString(action.payload.machine, "build.machine");
      const count = coercePositiveInteger(action.payload.count, "build.count");
      const machineKey = getMachineStateKey(machine);
      const machinePath = `machines.${machineKey}`;
      const costPerUnit = BUILD_COSTS[machine];
      if (!Number.isFinite(costPerUnit)) {
        throw new Error(`[GAME_LOGIC] Keine Baukosten fuer Maschine: ${machine}`);
      }

      const orePath = "resources.ore";
      const nextMachines = getCountAtPath(state, machinePath) + count;
      const nextOre = Math.max(0, getCountAtPath(state, orePath) - costPerUnit * count);

      return [setCountPatch(machinePath, nextMachines), setCountPatch(orePath, nextOre)];
    }

    case "inspect":
      return [];

    default:
      throw new Error(`[GAME_LOGIC] Unbekannte Action: ${action.type}`);
  }
}

function validateActionAgainstSchema(action, actionSchema) {
  const schema = actionSchema[action.type];
  if (!isPlainObject(schema)) {
    throw new Error(`[GAME_LOGIC] Action nicht erlaubt: ${action.type}`);
  }

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(action.payload, key)) {
      throw new Error(`[GAME_LOGIC] Pflichtfeld fehlt: ${action.type}.${key}`);
    }
  }
}

function validatePatchesAgainstMatrix(patches, mutationMatrix) {
  const allowedPrefixes = mutationMatrix[DEFAULT_DOMAIN];
  if (!Array.isArray(allowedPrefixes) || allowedPrefixes.length === 0) {
    throw new Error("[GAME_LOGIC] mutationMatrix fuer game fehlt.");
  }

  for (const patch of patches) {
    if (!isPlainObject(patch)) {
      throw new Error("[GAME_LOGIC] Patch muss Plain-Object sein.");
    }

    if (patch.domain !== DEFAULT_DOMAIN) {
      throw new Error(`[GAME_LOGIC] Patch-Domain ungueltig: ${String(patch.domain)}`);
    }

    if (typeof patch.path !== "string" || !patch.path.trim()) {
      throw new Error("[GAME_LOGIC] Patch path fehlt.");
    }

    if (patch.path.includes("__proto__") || patch.path.includes("prototype") || patch.path.includes("constructor")) {
      throw new Error("[GAME_LOGIC] Ungueltiger Patch-Pfad.");
    }

    const allowed = allowedPrefixes.some((prefix) => patch.path === prefix || patch.path.startsWith(`${prefix}.`));
    if (!allowed) {
      throw new Error(`[GAME_LOGIC] Patch-Pfad nicht erlaubt: ${patch.path}`);
    }
  }
}

function buildOperationSummary(action, patches) {
  return {
    action: action.type,
    patchCount: patches.length,
    affectedPaths: patches.map((patch) => patch.path)
  };
}

export class GameLogicController {
  constructor(kernelApi, options = {}) {
    this.kernel = normalizeKernelApi(kernelApi);
    this.domain = typeof options.domain === "string" && options.domain.trim() ? options.domain.trim() : DEFAULT_DOMAIN;
    this.actionSchema = deepFreeze({
      ...DEFAULT_ACTION_SCHEMA,
      ...(isPlainObject(options.actionSchema) ? options.actionSchema : {})
    });
    this.mutationMatrix = deepFreeze({
      ...DEFAULT_MUTATION_MATRIX,
      ...(isPlainObject(options.mutationMatrix) ? options.mutationMatrix : {})
    });
  }

  getActionSchema() {
    return deepClone(this.actionSchema);
  }

  getMutationMatrix() {
    return deepClone(this.mutationMatrix);
  }

  calculateAction(input = {}, state = {}) {
    const action = readAction(input);
    const safeState = readState(state);

    validateActionAgainstSchema(action, this.actionSchema);
    const patches = buildPatches(action, safeState);
    validatePatchesAgainstMatrix(patches, this.mutationMatrix);

    return {
      ok: true,
      domain: this.domain,
      action,
      patches: deepClone(patches),
      summary: buildOperationSummary(action, patches)
    };
  }

  async planAction(input = {}) {
    const action = readAction(input.action);
    const state = readState(input.state);
    const calculation = this.calculateAction(action, state);

    return this.kernel.planPatch({
      domain: this.domain,
      action,
      state,
      patches: calculation.patches,
      actionSchema: this.actionSchema,
      mutationMatrix: this.mutationMatrix
    });
  }

  async applyAction(input = {}) {
    const action = readAction(input.action);
    const state = readState(input.state);
    const calculation = this.calculateAction(action, state);

    return this.kernel.applyPatch({
      domain: this.domain,
      action,
      state,
      patches: calculation.patches,
      actionSchema: this.actionSchema,
      mutationMatrix: this.mutationMatrix
    });
  }
}

export function createGameLogicController(kernelApi, options = {}) {
  return new GameLogicController(kernelApi, options);
}

export function getDefaultGameActionSchema() {
  return deepClone(DEFAULT_ACTION_SCHEMA);
}

export function getDefaultGameMutationMatrix() {
  return deepClone(DEFAULT_MUTATION_MATRIX);
}
