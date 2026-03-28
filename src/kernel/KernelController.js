import { withDeterminismGuards } from "./runtimeGuards.js";
import { KernelRouter } from "./KernelRouter.js";
import { PatchOrchestrator } from "./PatchOrchestrator.js";
import { ActionRegistry } from "./ActionRegistry.js";
import { KernelGates } from "./KernelGates.js";
import { GateManager } from "./GateManager.js";

const DEFAULT_CONFIRMATION_PREFIX = "KERNEL-CONFIRM";
const UNUSED_GATE_ALLOWLIST = new Set([
  "system.reset",
  "system.shutdown",
  "patch.apply",
  "kernel.tick",
  "state.modify",
  "game.access",
  "dev.access",
  "patcher.access"
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

class KernelGovernanceError extends Error {
  constructor(message, { code, auditId, details } = {}) {
    super(message);
    this.name = "KernelGovernanceError";
    this.code = code || "KERNEL_GOVERNANCE_ERROR";
    this.auditId = auditId || null;
    this.details = details || null;
  }
}

/**
 * Kernel Controller with enforced governance chokepoint.
 */
export class KernelController {
  constructor(options = {}) {
    this.confirmationPrefix =
      typeof options.confirmationPrefix === "string" && options.confirmationPrefix.trim().length > 0
        ? options.confirmationPrefix.trim()
        : DEFAULT_CONFIRMATION_PREFIX;

    this.governanceMode = options.governanceMode === "shadow" ? "shadow" : "enforce";
    this.governanceAuditTrail = [];

    this.router = new KernelRouter();
    this.router.registerHandler("game", (action) => this.#handleRegisteredAction("game", action));
    this.router.registerHandler("patch", (action) => this.#handleRegisteredAction("patch", action));
    this.router.registerHandler("ui", (action) => this.#handleRegisteredAction("ui", action));
    this.router.registerHandler("kernel", (action) => this.#handleRegisteredAction("kernel", action));

    this.patchOrchestrator = new PatchOrchestrator(this);

    this.patches = new Map();
    this.hooks = {
      advanceTick: [],
      placeStructure: [],
      inspectTile: [],
      getBuildOptions: []
    };
    this.patchValidation = new Map();
    this.rollbackStates = new Map();

    this.currentTick = 0;
    this.deterministicSeed = options.seed || "default-seed";
    this.allowedMutations = new Set(["ui_update", "plugin_state_change", "event_trigger", "visual_effect"]);

    this.actionRegistry = new ActionRegistry();
    this.kernelGates = new KernelGates(this.#kernelGateInterface.bind(this));
    this.gateManager = new GateManager({
      kernelGates: this.kernelGates,
      mode: this.governanceMode,
      onAudit: (event) => this.#recordGovernanceAudit(event)
    });

    this.#registerActions();
    if (options.governanceSelfTest !== false) {
      this.#verifyGovernanceIntegrity();
    }
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

    const gateDecision = await this.gateManager.enforce({
      domain,
      actionType,
      requiredGate: definition.requiredGate,
      context: this.#createGateContext({ domain, actionType, action })
    });

    if (!gateDecision.allowed) {
      throw this.#denyAction({
        code: "GATE_DENIED",
        reason: gateDecision.event?.reason || `Gate denied for ${domain}.${actionType}`,
        domain,
        actionType,
        auditId: gateDecision.auditId
      });
    }

    return withDeterminismGuards(() => {
      return this.router.route({ domain, action, sourceDomain: input.sourceDomain });
    });
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
    // Game domain
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
        validator: (action) => this.#validateHasPlainObject(action, "state"),
        handler: (action) => this.#placeStructure(action)
      });

    // UI domain
    this.actionRegistry
      .register({
        domain: "ui",
        actionType: "render",
        requiredGate: "ui.action",
        validator: () => ({ valid: true }),
        handler: () => ({ success: true, message: "UI render action handled" })
      })
      .register({
        domain: "ui",
        actionType: "update",
        requiredGate: "ui.action",
        validator: () => ({ valid: true }),
        handler: () => ({ success: true, message: "UI update action handled" })
      });

    // Patch domain
    this.actionRegistry
      .register({
        domain: "patch",
        actionType: "startSession",
        requiredGate: "patch.action",
        validator: () => ({ valid: true }),
        handler: (action) => ({ success: true, sessionId: action.config?.sessionId || "default" })
      })
      .register({
        domain: "patch",
        actionType: "endSession",
        requiredGate: "patch.action",
        validator: () => ({ valid: true }),
        handler: () => ({ success: true, ended: true })
      })
      .register({
        domain: "patch",
        actionType: "applyBrowserPatch",
        requiredGate: "patch.action",
        validator: (action) => this.#validateHasPlainObject(action, "patch"),
        handler: (action) => this.#registerPatch({ patch: action.patch })
      })
      .register({
        domain: "patch",
        actionType: "applyPatch",
        requiredGate: "patch.action",
        validator: (action) => this.#validateHasString(action, "patchId"),
        handler: (action) => ({ success: true, applied: action.patchId, acknowledgement: true })
      })
      .register({
        domain: "patch",
        actionType: "getStatus",
        requiredGate: "patch.action",
        validator: () => ({ valid: true }),
        handler: () => ({ success: true, status: this.patchOrchestrator.sessionState })
      })
      .register({
        domain: "patch",
        actionType: "registerPatch",
        requiredGate: "patch.action",
        validator: (action) => this.#validateHasPlainObject(action, "patch"),
        handler: (action) => this.#registerPatch(action)
      })
      .register({
        domain: "patch",
        actionType: "unregisterPatch",
        requiredGate: "patch.action",
        validator: (action) => this.#validateHasString(action, "patchId"),
        handler: (action) => this.#unregisterPatch(action)
      })
      .register({
        domain: "patch",
        actionType: "listPatches",
        requiredGate: "patch.action",
        validator: () => ({ valid: true }),
        handler: () => this.#listPatches()
      })
      .register({
        domain: "patch",
        actionType: "validatePatch",
        requiredGate: "patch.action",
        validator: (action) => this.#validateHasPlainObject(action, "patch"),
        handler: (action) => this.#validatePatch(action)
      });

    // Kernel domain
    this.actionRegistry
      .register({
        domain: "kernel",
        actionType: "validate",
        requiredGate: "kernel.action",
        validator: () => ({ valid: true }),
        handler: () => ({ success: true, validated: true })
      })
      .register({
        domain: "kernel",
        actionType: "status",
        requiredGate: "kernel.action",
        validator: () => ({ valid: true }),
        handler: () => ({ status: "ready", determinism: "enabled" })
      })
      .register({
        domain: "kernel",
        actionType: "registerPatch",
        requiredGate: "kernel.action",
        validator: (action) => this.#validateHasPlainObject(action, "patch"),
        handler: (action) => this.#registerPatch(action)
      })
      .register({
        domain: "kernel",
        actionType: "unregisterPatch",
        requiredGate: "kernel.action",
        validator: (action) => this.#validateHasString(action, "patchId"),
        handler: (action) => this.#unregisterPatch(action)
      })
      .register({
        domain: "kernel",
        actionType: "validatePatch",
        requiredGate: "kernel.action",
        validator: (action) => this.#validateHasPlainObject(action, "patch"),
        handler: (action) => this.#validatePatch(action)
      })
      .register({
        domain: "kernel",
        actionType: "listPatches",
        requiredGate: "kernel.action",
        validator: () => ({ valid: true }),
        handler: () => this.#listPatches()
      })
      .register({
        domain: "kernel",
        actionType: "getHooks",
        requiredGate: "kernel.action",
        validator: () => ({ valid: true }),
        handler: () => this.#getHooks()
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

  #createGateContext({ domain, actionType, action }) {
    return {
      domain,
      actionType,
      action,
      patchData: action.patch,
      tickCount: Number.isFinite(action.ticks) ? action.ticks : 1,
      modification: isPlainObject(action.modification) ? action.modification : {},
      gameLogic: true,
      devEnabled: true
    };
  }

  #recordGovernanceAudit(event) {
    this.governanceAuditTrail.push(event);
    if (this.governanceAuditTrail.length > 2000) {
      this.governanceAuditTrail = this.governanceAuditTrail.slice(-2000);
    }
  }

  #verifyGovernanceIntegrity() {
    this.actionRegistry.verifyAgainstGates(this.kernelGates.getGateNames());

    const referencedGates = new Set(this.actionRegistry.list().map((entry) => entry.requiredGate));
    const unreferenced = this.kernelGates
      .getGateNames()
      .filter((gateName) => !referencedGates.has(gateName) && !UNUSED_GATE_ALLOWLIST.has(gateName));

    if (unreferenced.length > 0) {
      throw new Error(
        `[KERNEL_GOVERNANCE] Nicht referenzierte Gates gefunden: ${unreferenced.join(", ")}`
      );
    }
  }

  #denyAction({ code, reason, domain, actionType, auditId = null }) {
    const assignedAuditId = auditId || `deny-${Date.now()}-${this.governanceAuditTrail.length + 1}`;
    const event = {
      auditId: assignedAuditId,
      decision: "deny",
      code,
      reason,
      domain,
      actionType,
      timestamp: Date.now()
    };
    this.#recordGovernanceAudit(event);
    return new KernelGovernanceError(reason, { code, auditId: assignedAuditId, details: event });
  }

  #kernelGateInterface(command, payload) {
    switch (command) {
      case "game.exists":
      case "system.ready":
      case "dev.available":
      case "patch.system.available":
      case "user.can_patch":
      case "tick.can_advance":
      case "state.can_modify":
      case "system.can_reset":
      case "system.can_shutdown":
        return true;
      case "patch.get":
        return this.patches.get(String(payload)) || null;
      default:
        return false;
    }
  }

  #createInitialState() {
    return {
      worldMap: new Map(),
      clock: { tick: 0, msPerTick: 100 },
      resources: { ore: 1000, iron: 0 },
      structures: new Map(),
      statistics: { totalTicks: 0, structuresBuilt: 0 }
    };
  }

  #advanceTick(action) {
    const state = this.#readPlainObject(action, "state", "[ADVANCE_TICK] state fehlt.");
    const ticks = this.#readNumber(action, "ticks", 1);

    let modifiedState = state;
    for (const hook of this.hooks.advanceTick.sort((a, b) => a.priority - b.priority)) {
      if (hook.enabled) {
        try {
          const result = hook.handler(modifiedState, ticks);
          if (result && typeof result === "object") {
            modifiedState = result;
          }
        } catch (error) {
          throw new Error(`[KERNEL] Hook ${hook.patchId}:${hook.hookId} failed: ${String(error?.message || error)}`);
        }
      }
    }

    return {
      ...modifiedState,
      clock: {
        ...modifiedState.clock,
        tick: modifiedState.clock.tick + ticks
      },
      statistics: {
        ...modifiedState.statistics,
        totalTicks: modifiedState.statistics.totalTicks + ticks
      }
    };
  }

  #inspectTile(action) {
    const state = this.#readPlainObject(action, "state", "[INSPECT_TILE] state fehlt.");
    const x = this.#readNumber(action, "x");
    const y = this.#readNumber(action, "y");

    const tileKey = `${x},${y}`;
    const tile = state.worldMap.get(tileKey) || { terrain: "grass", structure: null };
    return { x, y, tile };
  }

  #getBuildOptions(action) {
    const state = this.#readPlainObject(action, "state", "[GET_BUILD_OPTIONS] state fehlt.");

    return [
      { id: "mine", name: "Mine", cost: { ore: 100 }, canAfford: state.resources.ore >= 100 },
      { id: "smelter", name: "Smelter", cost: { ore: 200 }, canAfford: state.resources.ore >= 200 }
    ];
  }

  #placeStructure(action) {
    const state = this.#readPlainObject(action, "state", "[PLACE_STRUCTURE] state fehlt.");
    const x = this.#readNumber(action, "x");
    const y = this.#readNumber(action, "y");
    const structureId = this.#readString(action, "structureId");

    const cost = { ore: structureId === "mine" ? 100 : 200 };
    if (state.resources.ore < cost.ore) {
      throw new Error(`[PLACE_STRUCTURE] Nicht genug ore: benoetigt ${cost.ore}, vorhanden ${state.resources.ore}`);
    }

    const newState = {
      ...state,
      resources: {
        ...state.resources,
        ore: state.resources.ore - cost.ore
      },
      structures: new Map(state.structures || [])
    };

    newState.structures.set(`${x},${y}`, { id: structureId, builtAt: state.clock.tick });
    return newState;
  }

  #assertPlainObject(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`[KERNEL_CONTROLLER] ${name} muss ein Plain Object sein.`);
    }
  }

  #readString(value, key, errorMessage) {
    if (!(key in value) || typeof value[key] !== "string") {
      throw new Error(errorMessage || `[KERNEL_CONTROLLER] ${key} fehlt oder ist kein String.`);
    }
    return value[key];
  }

  #readPlainObject(value, key, errorMessage) {
    if (!(key in value) || typeof value[key] !== "object" || Array.isArray(value[key])) {
      throw new Error(errorMessage || `[KERNEL_CONTROLLER] ${key} fehlt oder ist kein Plain Object.`);
    }
    return value[key];
  }

  #readNumber(value, key, defaultValue = 0) {
    if (!(key in value)) {
      return defaultValue;
    }
    const num = Number(value[key]);
    if (!Number.isFinite(num)) {
      throw new Error(`[KERNEL_CONTROLLER] ${key} muss eine Zahl sein.`);
    }
    return num;
  }

  #registerPatch(action) {
    const patchData = this.#readPlainObject(action, "patch", "[REGISTER_PATCH] patch fehlt.");
    const patchId = this.#readString(patchData, "id", "[REGISTER_PATCH] patch.id fehlt.");

    const validation = this.#validatePatchStructure(patchData);
    if (!validation.valid) {
      return { success: false, error: validation.error || validation.errors?.[0] || "Patch validation failed" };
    }

    this.patches.set(patchId, patchData);
    this.patchValidation.set(patchId, validation);

    if (patchData.hooks) {
      for (const [hookName, hookConfig] of Object.entries(patchData.hooks)) {
        if (this.hooks[hookName]) {
          this.hooks[hookName].push({
            patchId,
            hookId: hookConfig.id || `${patchId}-${hookName}`,
            priority: hookConfig.priority || 100,
            enabled: hookConfig.enabled !== false,
            handler: this.#createHookHandler(patchData, hookConfig)
          });
        }
      }
    }

    return { success: true, patchId, registeredHooks: Object.keys(patchData.hooks || {}) };
  }

  #unregisterPatch(action) {
    const patchId = this.#readString(action, "patchId", "[UNREGISTER_PATCH] patchId fehlt.");

    if (!this.patches.has(patchId)) {
      return { success: false, error: `Patch ${patchId} nicht gefunden` };
    }

    for (const hookName of Object.keys(this.hooks)) {
      this.hooks[hookName] = this.hooks[hookName].filter((hook) => hook.patchId !== patchId);
    }

    this.patches.delete(patchId);
    this.patchValidation.delete(patchId);
    this.rollbackStates.delete(patchId);

    return { success: true, patchId };
  }

  #validatePatch(action) {
    const patchData = this.#readPlainObject(action, "patch", "[VALIDATE_PATCH] patch fehlt.");
    const validation = this.#validatePatchStructure(patchData);

    return {
      success: true,
      valid: validation.valid,
      errors: validation.errors || [],
      warnings: validation.warnings || []
    };
  }

  #listPatches() {
    const patches = [];
    for (const [patchId, patchData] of this.patches) {
      const validation = this.patchValidation.get(patchId);
      patches.push({
        id: patchId,
        version: patchData.version,
        description: patchData.description,
        valid: validation?.valid || false,
        hooks: Object.keys(patchData.hooks || {}),
        enabled: patchData.enabled !== false
      });
    }
    return { success: true, patches };
  }

  #getHooks() {
    return { success: true, hooks: Object.keys(this.hooks) };
  }

  #validatePatchStructure(patch) {
    const errors = [];
    const warnings = [];

    if (!patch.id || typeof patch.id !== "string") {
      errors.push("Patch ID is required and must be a string");
    }
    if (!patch.version || typeof patch.version !== "string") {
      errors.push("Patch version is required and must be a string");
    }
    if (!patch.hooks || typeof patch.hooks !== "object") {
      errors.push("Patch hooks are required and must be an object");
    }

    if (patch.hooks) {
      for (const [hookName, hookConfig] of Object.entries(patch.hooks)) {
        if (!this.hooks[hookName]) {
          errors.push(`Unknown hook: ${hookName}`);
        }
        if (!hookConfig.code || typeof hookConfig.code !== "string") {
          errors.push(`Hook ${hookName} must have code`);
        }
      }
    }

    const forbiddenPatterns = [
      "Math.random",
      "Date.now",
      "performance.now",
      "setTimeout",
      "setInterval",
      "fetch(",
      "XMLHttpRequest",
      "indexedDB",
      "Worker(",
      "SharedWorker("
    ];
    const patchCode = JSON.stringify(patch);
    for (const pattern of forbiddenPatterns) {
      if (patchCode.includes(pattern)) {
        errors.push(`Forbidden pattern detected: ${pattern}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  #createHookHandler(_patchData, hookConfig) {
    try {
      const func = new Function("state", "kernel", "rng", hookConfig.code);
      return (state, ...args) => {
        const kernelInterface = {
          getState: () => state,
          mutateState: (mutations) => ({ ...state, ...mutations })
        };

        let currentSeed = 123456789;
        for (let i = 0; i < this.deterministicSeed.length; i += 1) {
          currentSeed = (currentSeed << 5) - currentSeed + this.deterministicSeed.charCodeAt(i);
        }
        currentSeed = Math.abs(currentSeed);

        const rng = () => {
          currentSeed = (currentSeed * 9301 + 49297) % 233280;
          return currentSeed / 233280;
        };

        return func(state, kernelInterface, rng, ...args);
      };
    } catch (error) {
      console.error("[KERNEL] Failed to create hook handler:", error);
      return (state) => state;
    }
  }

  #setDeterministicSeed(action) {
    const seed = this.#readString(action, "seed", "[SET_DETERMINISTIC_SEED] seed fehlt.");

    this.deterministicSeed = seed;
    this.currentTick = 0;

    return { success: true, seed, tick: this.currentTick };
  }

  getCurrentTick() {
    return this.currentTick;
  }

  getCurrentState() {
    return {
      tick: this.currentTick,
      seed: this.deterministicSeed
    };
  }

  executeMutation(mutation) {
    if (!this.allowedMutations.has(mutation.type)) {
      throw new Error(`[KERNEL] Mutation type not allowed: ${mutation.type}`);
    }

    this.currentTick += 1;
    return {
      success: true,
      tick: this.currentTick,
      mutation
    };
  }
}
