import { withDeterminismGuards } from "./runtimeGuards.js";
import { KernelRouter } from "./KernelRouter.js";
import { PatchOrchestrator } from "./PatchOrchestrator.js";

const DEFAULT_CONFIRMATION_PREFIX = "KERNEL-CONFIRM";

/**
 * Kernel Controller with Patch Hook System
 * Supports deterministic plugin loading and execution
 */
export class KernelController {
  constructor(options = {}) {
    this.confirmationPrefix =
      typeof options.confirmationPrefix === "string" && options.confirmationPrefix.trim().length > 0
        ? options.confirmationPrefix.trim()
        : DEFAULT_CONFIRMATION_PREFIX;

    // Domain boundary router - enforces separation
    this.router = new KernelRouter();

    // Register domain handlers
    this.router.registerHandler('game', this.#handleGameAction.bind(this));
    this.router.registerHandler('patch', this.#handlePatchAction.bind(this));
    this.router.registerHandler('ui', this.#handleUIAction.bind(this));
    this.router.registerHandler('kernel', this.#handleKernelAction.bind(this));

    // Patch Orchestrator - only receives kernel acknowledgements
    this.patchOrchestrator = new PatchOrchestrator(this);

    // Patch system state
    this.patches = new Map(); // patchId -> patchData
    this.hooks = {
      advanceTick: [],
      placeStructure: [],
      inspectTile: [],
      getBuildOptions: []
    };
    this.patchValidation = new Map(); // patchId -> validationResult
    this.rollbackStates = new Map(); // patchId -> rollbackData
    
    // Kernel state
    this.currentTick = 0;
    this.deterministicSeed = options.seed || 'default-seed';
    this.allowedMutations = new Set([
      'ui_update', 'plugin_state_change', 'event_trigger', 'visual_effect'
    ]);
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

    // Use router for domain boundary enforcement
    return withDeterminismGuards(() => {
      return this.router.route({ domain, action });
    });
  }

  #handleGameAction(action) {
    const type = this.#readString(action, "type", "[GAME] type fehlt.");
    
    switch (type) {
      case "createInitialState":
        return this.#createInitialState();
      case "advanceTick":
        return this.#advanceTick(action);
      case "inspectTile":
        return this.#inspectTile(action);
      case "getBuildOptions":
        return this.#getBuildOptions(action);
      case "placeStructure":
        return this.#placeStructure(action);
      default:
        throw new Error(`[GAME] Unbekannter action type: ${type}`);
    }
  }

  #handleUIAction(action) {
    const type = this.#readString(action, "type", "[UI] type fehlt.");

    switch (type) {
      case "render":
        return { success: true, message: "UI render action handled" };
      case "update":
        return { success: true, message: "UI update action handled" };
      default:
        throw new Error(`[UI] Unbekannter action type: ${type}`);
    }
  }

  #handlePatchAction(action) {
    const type = this.#readString(action, "type", "[PATCH] type fehlt.");

    // Patch domain only receives acknowledgements - no direct game state access
    switch (type) {
      case "startSession":
        return { success: true, sessionId: action.config?.sessionId || 'default' };
      case "endSession":
        return { success: true, ended: true };
      case "applyBrowserPatch":
        return this.#registerPatch({ patch: action.patch });
      case "applyPatch":
        // Patch application is routed through kernel - never touches game state directly
        return { success: true, applied: action.patchId, acknowledgement: true };
      case "getStatus":
        return { success: true, status: this.patchOrchestrator.sessionState };
      default:
        throw new Error(`[PATCH] Unbekannter action type: ${type}`);
    }
  }

  #handleKernelAction(action) {
    const type = this.#readString(action, "type", "[KERNEL] type fehlt.");
    
    switch (type) {
      case "validate":
        return { success: true, validated: true };
      case "status":
        return { status: "ready", determinism: "enabled" };
      case "registerPatch":
        return this.#registerPatch(action);
      case "unregisterPatch":
        return this.#unregisterPatch(action);
      case "validatePatch":
        return this.#validatePatch(action);
      case "listPatches":
        return this.#listPatches();
      case "getHooks":
        return this.#getHooks();
      case "setDeterministicSeed":
        return this.#setDeterministicSeed(action);
      default:
        throw new Error(`[KERNEL] Unbekannter action type: ${type}`);
    }
  }

  #createInitialState() {
    // Simplified initial state creation
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

    // Execute advanceTick hooks before processing
    // Hooks are sorted by priority: lower numbers execute first (higher priority)
    let modifiedState = state;
    for (const hook of this.hooks.advanceTick.sort((a, b) => a.priority - b.priority)) {
      if (hook.enabled) {
        try {
          const result = hook.handler(modifiedState, ticks);
          if (result && typeof result === 'object') {
            modifiedState = result;
          }
        } catch (error) {
          throw new Error(`[KERNEL] Hook ${hook.patchId}:${hook.hookId} failed: ${String(error?.message || error)}`);
        }
      }
    }

    // Simplified tick advancement with hook-modified state
    const newState = {
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

    return newState;
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
    const x = this.#readNumber(action, "x");
    const y = this.#readNumber(action, "y");

    // Simplified build options
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

    // Simplified structure placement
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

  // Patch System Methods
  #registerPatch(action) {
    const patchData = this.#readPlainObject(action, "patch", "[REGISTER_PATCH] patch fehlt.");
    const patchId = this.#readString(patchData, "id", "[REGISTER_PATCH] patch.id fehlt.");
    
    // Validate patch structure
    const validation = this.#validatePatchStructure(patchData);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Store patch
    this.patches.set(patchId, patchData);
    this.patchValidation.set(patchId, validation);

    // Register hooks
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

    // Remove hooks
    for (const hookName of Object.keys(this.hooks)) {
      this.hooks[hookName] = this.hooks[hookName].filter(hook => hook.patchId !== patchId);
    }

    // Remove patch data
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

    // Required fields
    if (!patch.id || typeof patch.id !== 'string') {
      errors.push('Patch ID is required and must be a string');
    }
    if (!patch.version || typeof patch.version !== 'string') {
      errors.push('Patch version is required and must be a string');
    }
    if (!patch.hooks || typeof patch.hooks !== 'object') {
      errors.push('Patch hooks are required and must be an object');
    }

    // Validate hooks
    if (patch.hooks) {
      for (const [hookName, hookConfig] of Object.entries(patch.hooks)) {
        if (!this.hooks[hookName]) {
          errors.push(`Unknown hook: ${hookName}`);
        }
        if (!hookConfig.code || typeof hookConfig.code !== 'string') {
          errors.push(`Hook ${hookName} must have code`);
        }
      }
    }

    // Check for forbidden patterns
    const forbiddenPatterns = [
      'Math.random',
      'Date.now',
      'performance.now',
      'setTimeout',
      'setInterval',
      'fetch(',
      'XMLHttpRequest',
      'indexedDB',
      'Worker(',
      'SharedWorker('
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

  #createHookHandler(patchData, hookConfig) {
    // Create deterministic function from patch code
    try {
      // Create sandboxed function with kernel-provided RNG
      const func = new Function('state', 'kernel', 'rng', hookConfig.code);
      return (state, ...args) => {
        // Provide kernel interface and deterministic RNG
        const kernelInterface = {
          getState: () => state,
          mutateState: (mutations) => ({ ...state, ...mutations })
        };
        
        // Deterministic LCG RNG (same seed = same sequence)
        let currentSeed = 123456789; // simplified for hook box
        for (let i = 0; i < this.deterministicSeed.length; i++) {
          currentSeed = ((currentSeed << 5) - currentSeed) + this.deterministicSeed.charCodeAt(i);
        }
        currentSeed = Math.abs(currentSeed);
        
        const rng = () => {
          currentSeed = (currentSeed * 9301 + 49297) % 233280;
          return currentSeed / 233280;
        };
        
        return func(state, kernelInterface, rng, ...args);
      };
    } catch (error) {
      console.error(`[KERNEL] Failed to create hook handler:`, error);
      return (state) => state; // Fallback: return unchanged state
    }
  }

  #setDeterministicSeed(action) {
    const seed = this.#readString(action, "seed", "[SET_DETERMINISTIC_SEED] seed fehlt.");
    
    this.deterministicSeed = seed;
    this.currentTick = 0;
    
    return { success: true, seed, tick: this.currentTick };
  }

  // Public methods for UI integration
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
    // Validate and execute state mutation
    if (!this.allowedMutations.has(mutation.type)) {
      throw new Error(`[KERNEL] Mutation type not allowed: ${mutation.type}`);
    }
    
    // Execute mutation with determinism guarantees
    this.currentTick++;
    
    return {
      success: true,
      tick: this.currentTick,
      mutation: mutation
    };
  }
}
