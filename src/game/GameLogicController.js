import { generateWorld } from "./worldGen.js";
import { buildTransportPatches } from "./actions/transportAction.js";
import { buildBuildPatches } from "./actions/buildAction.js";

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
  },
  generate_world: {
    required: ["seed"]
  },
  regenerate_world: {
    required: ["seed"]
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
    "world.seed",
    "world.size",
    "world.meta",
    "world.tiles",
    "meta.lastAction",
    "meta.revision"
  ]
});

const BUILD_COSTS = Object.freeze({
  miner: 5,
  conveyor: 2,
  assembler: 8
});

const PROGRESSION_LEVELS = Object.freeze([
  Object.freeze({ id: "seed", title: "Seed", threshold: 0 }),
  Object.freeze({ id: "sprout", title: "Sprout", threshold: 16 }),
  Object.freeze({ id: "builder", title: "Builder", threshold: 40 }),
  Object.freeze({ id: "flow", title: "Flow", threshold: 76 }),
  Object.freeze({ id: "assembly", title: "Assembly", threshold: 124 }),
  Object.freeze({ id: "horizon", title: "Horizon", threshold: 188 })
]);

const REWARD_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "ore-first",
    title: "Ore First",
    description: "First ore signal online.",
    when: (snapshot) => snapshot.resources.ore > 0
  }),
  Object.freeze({
    id: "copper-first",
    title: "Copper First",
    description: "Copper flow established.",
    when: (snapshot) => snapshot.resources.copper > 0
  }),
  Object.freeze({
    id: "iron-first",
    title: "Iron First",
    description: "Iron flow established.",
    when: (snapshot) => snapshot.resources.iron > 0
  }),
  Object.freeze({
    id: "gear-first",
    title: "Gear First",
    description: "Gear stock is available.",
    when: (snapshot) => snapshot.resources.gears > 0
  }),
  Object.freeze({
    id: "machine-first",
    title: "Machine First",
    description: "At least one machine is working.",
    when: (snapshot) => snapshot.machines.total > 0
  }),
  Object.freeze({
    id: "assembler-line",
    title: "Assembler Line",
    description: "Assembler capacity is online.",
    when: (snapshot) => snapshot.machines.assemblers > 0
  }),
  Object.freeze({
    id: "logistics-flow",
    title: "Logistics Flow",
    description: "Storage is carrying load.",
    when: (snapshot) => snapshot.logistics.total > 0
  })
]);

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

function readCount(state, root, key) {
  const branch = state[root];
  if (!branch || typeof branch !== "object") {
    return 0;
  }

  const value = branch[key];
  return Number.isFinite(value) ? value : 0;
}

function buildProgressSnapshot(state) {
  const resources = {
    ore: readCount(state, "resources", "ore"),
    copper: readCount(state, "resources", "copper"),
    iron: readCount(state, "resources", "iron"),
    gears: readCount(state, "resources", "gears")
  };
  const machines = {
    miners: readCount(state, "machines", "miners"),
    conveyors: readCount(state, "machines", "conveyors"),
    assemblers: readCount(state, "machines", "assemblers")
  };
  const logistics = {
    storageA: readCount(state, "logistics", "storageA"),
    storageB: readCount(state, "logistics", "storageB")
  };

  const resourceTotal = Object.values(resources).reduce((sum, value) => sum + value, 0);
  const machineTotal = Object.values(machines).reduce((sum, value) => sum + value, 0);
  const logisticsTotal = Object.values(logistics).reduce((sum, value) => sum + value, 0);
  const score = resourceTotal + machineTotal * 12 + logisticsTotal * 4;

  let levelIndex = 0;
  for (let i = 0; i < PROGRESSION_LEVELS.length; i += 1) {
    if (score >= PROGRESSION_LEVELS[i].threshold) {
      levelIndex = i;
    }
  }

  const level = PROGRESSION_LEVELS[levelIndex];
  const nextLevel = PROGRESSION_LEVELS[levelIndex + 1] || null;
  const progressToNext = nextLevel
    ? Math.max(0, Math.min(1, (score - level.threshold) / (nextLevel.threshold - level.threshold)))
    : 1;

  const earnedRewards = REWARD_DEFINITIONS.filter((reward) => reward.when({ resources, machines, logistics }));
  const focus =
    machines.assemblers > 0
      ? "Grow throughput with more logistics."
      : machines.conveyors > 0
        ? "Connect output into assembler readiness."
        : machines.miners > 0
          ? "Bridge mining into transport."
          : "Start with the first production node.";

  return {
    score,
    level: {
      id: level.id,
      title: level.title,
      threshold: level.threshold
    },
    nextLevel: nextLevel
      ? {
          id: nextLevel.id,
          title: nextLevel.title,
          threshold: nextLevel.threshold
        }
      : null,
    progressToNext,
    resourceTotal,
    machineTotal,
    logisticsTotal,
    resources,
    machines,
    logistics,
    earnedRewards: earnedRewards.map((reward) => ({
      id: reward.id,
      title: reward.title,
      description: reward.description
    })),
    focus
  };
}

function buildRewardFeedback(beforeState, afterState, summary = null) {
  const beforeSnapshot = buildProgressSnapshot(beforeState);
  const afterSnapshot = buildProgressSnapshot(afterState);
  const scoreDelta = afterSnapshot.score - beforeSnapshot.score;
  const levelDelta =
    PROGRESSION_LEVELS.findIndex((entry) => entry.id === afterSnapshot.level.id) -
    PROGRESSION_LEVELS.findIndex((entry) => entry.id === beforeSnapshot.level.id);

  const newlyEarnedRewards = afterSnapshot.earnedRewards.filter(
    (reward) => !beforeSnapshot.earnedRewards.some((entry) => entry.id === reward.id)
  );

  const headline =
    levelDelta > 0
      ? `Milestone unlocked: ${afterSnapshot.level.title}`
      : scoreDelta > 0
        ? `Progress +${scoreDelta}`
        : "No new reward";

  const details = [];
  if (summary?.action) {
    details.push(`Action: ${summary.action}`);
  }
  details.push(`Level: ${beforeSnapshot.level.title} -> ${afterSnapshot.level.title}`);
  details.push(`Score: ${beforeSnapshot.score} -> ${afterSnapshot.score}`);
  if (newlyEarnedRewards.length > 0) {
    details.push(`Unlocked: ${newlyEarnedRewards.map((reward) => reward.title).join(", ")}`);
  }
  details.push(`Focus: ${afterSnapshot.focus}`);

  return {
    headline,
    details,
    scoreDelta,
    levelDelta,
    level: afterSnapshot.level,
    nextLevel: afterSnapshot.nextLevel,
    progressToNext: afterSnapshot.progressToNext,
    earnedRewards: afterSnapshot.earnedRewards,
    newlyEarnedRewards,
    focus: afterSnapshot.focus,
    summary
  };
}

function setCountPatch(path, value) {
  return { op: "set", domain: DEFAULT_DOMAIN, path, value };
}

function createWorldPatches(seed, payload = {}) {
  const width = Number.isInteger(payload.width) ? payload.width : 16;
  const height = Number.isInteger(payload.height) ? payload.height : 12;
  const generated = generateWorld({
    seed,
    width,
    height
  });

  return [
    setCountPatch("world.seed", generated.seed),
    setCountPatch("world.size", generated.size),
    setCountPatch("world.meta", generated.meta),
    setCountPatch("world.tiles", generated.tiles)
  ];
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
      return buildTransportPatches({
        domain: DEFAULT_DOMAIN,
        fromPath,
        toPath,
        amount,
        state
      });
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
      return buildBuildPatches({
        domain: DEFAULT_DOMAIN,
        machinePath,
        orePath,
        costPerUnit,
        count,
        state
      });
    }

    case "inspect":
      return [];

    case "generate_world": {
      const seed = coerceString(action.payload.seed, "generate_world.seed");
      return createWorldPatches(seed, action.payload);
    }

    case "regenerate_world": {
      const seed = coerceString(action.payload.seed, "regenerate_world.seed");
      return createWorldPatches(seed, action.payload);
    }

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

  getProgressSnapshot(state = {}) {
    return deepClone(buildProgressSnapshot(state));
  }

  getRewardFeedback(beforeState = {}, afterState = {}, summary = null) {
    return deepClone(buildRewardFeedback(beforeState, afterState, summary));
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
