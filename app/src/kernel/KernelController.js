import { withDeterminismGuards } from "./runtimeGuards.js";
import { KernelRouter } from "./KernelRouter.js";
import { ActionRegistry } from "./ActionRegistry.js";
import { generateWorld } from "../game/worldGen.js";

const DEFAULT_CONFIRMATION_PREFIX = "KERNEL-CONFIRM";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deriveSeedSignature(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

let denyCounter = 0;

class KernelGovernanceError extends Error {
  constructor(message, { code, auditId, details } = {}) {
    super(message);
    this.name = "KernelGovernanceError";
    this.code = code || "KERNEL_GOVERNANCE_ERROR";
    this.auditId = auditId || null;
    this.details = details || null;
  }
}

export class KernelController {
  constructor(options = {}) {
    this.confirmationPrefix =
      typeof options.confirmationPrefix === "string" && options.confirmationPrefix.trim().length > 0
        ? options.confirmationPrefix.trim()
        : DEFAULT_CONFIRMATION_PREFIX;
    this.governanceMode = options.governanceMode === "shadow" ? "shadow" : "enforce";
    this.governanceAuditTrail = [];
    this.currentTick = 0;
    this.deterministicSeed =
      typeof options.seed === "string" && options.seed.trim().length > 0 ? options.seed.trim() : "default-seed";

    this.router = new KernelRouter();
    this.router.registerHandler("game", (action) => this.#handleRegisteredAction("game", action));
    this.router.registerHandler("kernel", (action) => this.#handleRegisteredAction("kernel", action));

    this.actionRegistry = new ActionRegistry();
    this.#registerActions();
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

  getCurrentState() {
    return {
      tick: this.currentTick,
      seed: this.deterministicSeed
    };
  }

  async #execute(input) {
    this.#assertPlainObject(input, "input");

    const domain = this.#readString(input, "domain", "[KERNEL_CONTROLLER] domain fehlt.");
    const action = this.#readPlainObject(input, "action", "[KERNEL_CONTROLLER] action fehlt.");
    const actionType = this.#readString(action, "type", "[KERNEL_CONTROLLER] action.type fehlt.");
    const definition = this.actionRegistry.resolve(domain, actionType);

    if (!definition) {
      throw this.#denyAction({
        code: "ACTION_NOT_REGISTERED",
        reason: `Ungemappte Action geblockt: ${domain}.${actionType}`,
        domain,
        actionType
      });
    }

    const validation = await definition.validator(action);
    if (!isPlainObject(validation) || typeof validation.valid !== "boolean") {
      throw this.#denyAction({
        code: "ACTION_VALIDATOR_INVALID",
        reason: `Ungueltiges Validator-Ergebnis fuer ${domain}.${actionType}`,
        domain,
        actionType
      });
    }
    if (!validation.valid) {
      throw this.#denyAction({
        code: "ACTION_VALIDATION_FAILED",
        reason: validation.reason || `Action-Validation fehlgeschlagen: ${domain}.${actionType}`,
        domain,
        actionType
      });
    }

    return withDeterminismGuards(() => this.router.route({ domain, action, sourceDomain: input.sourceDomain }));
  }

  #handleRegisteredAction(domain, action) {
    const type = this.#readString(action, "type", `[${domain.toUpperCase()}] type fehlt.`);
    const definition = this.actionRegistry.resolve(domain, type);
    if (!definition) {
      throw this.#denyAction({
        code: "ACTION_NOT_REGISTERED",
        reason: `Ungemappte Action im Handler geblockt: ${domain}.${type}`,
        domain,
        actionType: type
      });
    }
    return definition.handler(action);
  }

  #registerActions() {
    this.actionRegistry
      .register({
        domain: "game",
        actionType: "createInitialState",
        requiredGate: "game.action",
        validator: () => ({ valid: true }),
        handler: () => this.#createInitialState()
      })
      .register({
        domain: "game",
        actionType: "advanceTick",
        requiredGate: "game.action",
        validator: (action) => this.#validateHasPlainObject(action, "state"),
        handler: (action) => this.#advanceTick(action)
      })
      .register({
        domain: "game",
        actionType: "inspectTile",
        requiredGate: "game.action",
        validator: (action) => this.#validateHasPlainObject(action, "state"),
        handler: (action) => this.#inspectTile(action)
      })
      .register({
        domain: "game",
        actionType: "getBuildOptions",
        requiredGate: "game.action",
        validator: (action) => this.#validateHasPlainObject(action, "state"),
        handler: (action) => this.#getBuildOptions(action)
      })
      .register({
        domain: "game",
        actionType: "placeStructure",
        requiredGate: "game.action",
        validator: (action) => this.#validatePlaceStructure(action),
        handler: (action) => this.#placeStructure(action)
      });

    this.actionRegistry
      .register({
        domain: "kernel",
        actionType: "status",
        requiredGate: "kernel.action",
        validator: () => ({ valid: true }),
        handler: () => ({
          status: "deterministic",
          seed: this.deterministicSeed,
          tick: this.currentTick
        })
      })
      .register({
        domain: "kernel",
        actionType: "setDeterministicSeed",
        requiredGate: "kernel.action",
        validator: (action) => this.#validateHasString(action, "seed"),
        handler: (action) => this.#setDeterministicSeed(action)
      });
  }

  #validateHasString(action, key) {
    if (typeof action?.[key] !== "string" || action[key].trim().length === 0) {
      return { valid: false, reason: `Pflichtfeld fehlt: ${key}` };
    }
    return { valid: true };
  }

  #validateHasPlainObject(action, key) {
    if (!isPlainObject(action?.[key])) {
      return { valid: false, reason: `Pflichtfeld fehlt oder ungueltig: ${key}` };
    }
    return { valid: true };
  }

  #validatePlaceStructure(action) {
    const stateCheck = this.#validateHasPlainObject(action, "state");
    if (!stateCheck.valid) {
      return stateCheck;
    }
    if (!Number.isFinite(Number(action?.x)) || !Number.isFinite(Number(action?.y))) {
      return { valid: false, reason: "Pflichtfeld fehlt oder ungueltig: x/y" };
    }
    return this.#validateHasString(action, "structureId");
  }

  #recordGovernanceAudit(event) {
    this.governanceAuditTrail.push(event);
    if (this.governanceAuditTrail.length > 1024) {
      this.governanceAuditTrail = this.governanceAuditTrail.slice(-1024);
    }
  }

  #denyAction({ code, reason, domain, actionType }) {
    denyCounter += 1;
    const assignedAuditId = `deny-${String(denyCounter).padStart(6, "0")}`;
    const event = {
      auditId: assignedAuditId,
      decision: this.governanceMode === "shadow" ? "shadow_deny" : "deny",
      code,
      reason,
      domain,
      actionType
    };
    this.#recordGovernanceAudit(event);
    return new KernelGovernanceError(reason, { code, auditId: assignedAuditId, details: event });
  }

  #createInitialState() {
    const world = generateWorld({
      seed: this.deterministicSeed,
      width: 16,
      height: 12
    });
    const worldMap = new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, { ...tile }]));
    return {
      world,
      worldMap,
      clock: { tick: 0, msPerTick: 100 },
      resources: { ore: 1000, iron: 0 },
      structures: new Map(),
      statistics: {
        totalTicks: 0,
        structuresBuilt: 0,
        totalOreProduced: 0,
        seedSignature: deriveSeedSignature(this.deterministicSeed)
      }
    };
  }

  #advanceTick(action) {
    const state = this.#readPlainObject(action, "state", "[ADVANCE_TICK] state fehlt.");
    const ticks = this.#readInteger(action, "ticks", 1);
    assert(ticks > 0, "[ADVANCE_TICK] ticks muss positiv sein.");

    const structures = new Map(state.structures instanceof Map ? state.structures : []);
    const mines = Array.from(structures.values()).filter((entry) => entry?.id === "mine").length;
    const oreGain = mines * ticks;

    this.currentTick = (Number(state.clock?.tick) || 0) + ticks;
    return {
      ...state,
      structures,
      clock: {
        ...state.clock,
        tick: this.currentTick
      },
      resources: {
        ...state.resources,
        ore: (Number(state.resources?.ore) || 0) + oreGain
      },
      statistics: {
        ...state.statistics,
        totalTicks: (Number(state.statistics?.totalTicks) || 0) + ticks,
        totalOreProduced: (Number(state.statistics?.totalOreProduced) || 0) + oreGain
      }
    };
  }

  #inspectTile(action) {
    const state = this.#readPlainObject(action, "state", "[INSPECT_TILE] state fehlt.");
    const x = this.#readInteger(action, "x", 0);
    const y = this.#readInteger(action, "y", 0);
    const tile = this.#getTileAt(state, x, y);
    return { x, y, tile };
  }

  #getBuildOptions(action) {
    const state = this.#readPlainObject(action, "state", "[GET_BUILD_OPTIONS] state fehlt.");
    const ore = Number(state.resources?.ore) || 0;
    return [
      { id: "mine", name: "Mine", cost: { ore: 100 }, canAfford: ore >= 100 },
      { id: "smelter", name: "Smelter", cost: { ore: 200 }, canAfford: ore >= 200 }
    ];
  }

  #placeStructure(action) {
    const state = this.#readPlainObject(action, "state", "[PLACE_STRUCTURE] state fehlt.");
    const x = this.#readInteger(action, "x", 0);
    const y = this.#readInteger(action, "y", 0);
    const structureId = this.#readString(action, "structureId");
    const tile = this.#getTileAt(state, x, y);
    assert(tile, `[PLACE_STRUCTURE] Tile nicht gefunden: ${x},${y}`);
    assert(tile.biome !== "water", `[PLACE_STRUCTURE] Struktur auf water unzulaessig: ${x},${y}`);

    const cost = { ore: structureId === "mine" ? 100 : 200 };
    const ore = Number(state.resources?.ore) || 0;
    if (ore < cost.ore) {
      throw new Error(`[PLACE_STRUCTURE] Nicht genug ore: benoetigt ${cost.ore}, vorhanden ${ore}`);
    }

    const structures = new Map(state.structures instanceof Map ? state.structures : []);
    structures.set(`${x},${y}`, { id: structureId, builtAt: Number(state.clock?.tick) || 0 });
    return {
      ...state,
      structures,
      resources: {
        ...state.resources,
        ore: ore - cost.ore
      },
      statistics: {
        ...state.statistics,
        structuresBuilt: (Number(state.statistics?.structuresBuilt) || 0) + 1
      }
    };
  }

  #setDeterministicSeed(action) {
    const seed = this.#readString(action, "seed", "[SET_SEED] seed fehlt.");
    this.deterministicSeed = seed;
    return {
      success: true,
      seed,
      seedSignature: deriveSeedSignature(seed)
    };
  }

  #getTileAt(state, x, y) {
    if (state.worldMap instanceof Map && state.worldMap.has(`${x},${y}`)) {
      return state.worldMap.get(`${x},${y}`);
    }
    const tiles = Array.isArray(state.world?.tiles) ? state.world.tiles : [];
    return tiles.find((entry) => entry?.x === x && entry?.y === y) || null;
  }

  #assertPlainObject(value, name) {
    if (!isPlainObject(value)) {
      throw new Error(`[KERNEL_CONTROLLER] ${name} muss ein Plain Object sein.`);
    }
  }

  #readString(value, key, errorMessage) {
    if (!(key in value) || typeof value[key] !== "string" || value[key].trim().length === 0) {
      throw new Error(errorMessage || `[KERNEL_CONTROLLER] ${key} fehlt oder ist kein String.`);
    }
    return value[key];
  }

  #readPlainObject(value, key, errorMessage) {
    if (!(key in value) || !isPlainObject(value[key])) {
      throw new Error(errorMessage || `[KERNEL_CONTROLLER] ${key} fehlt oder ist kein Plain Object.`);
    }
    return value[key];
  }

  #readInteger(value, key, defaultValue = 0) {
    if (!(key in value)) {
      return defaultValue;
    }
    const num = Number(value[key]);
    if (!Number.isInteger(num)) {
      throw new Error(`[KERNEL_CONTROLLER] ${key} muss eine ganze Zahl sein.`);
    }
    return num;
  }
}
