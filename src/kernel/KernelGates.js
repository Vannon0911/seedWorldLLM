import { validateGameAccess, validateDevAccess, validatePatcherAccess } from "./gates/accessGates.js";
import {
  validatePatchApply,
  validateTickOperation,
  validateStateModification,
  validateSystemReset,
  validateSystemShutdown
} from "./gates/operationGates.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class KernelGates {
  constructor(kernelInterface) {
    this.kernelInterface = typeof kernelInterface === "function" ? kernelInterface : () => false;
    this.gates = new Map();
    this.gateHistory = [];
    this.initializeCoreGates();
  }

  initializeCoreGates() {
    this.registerGate("game.access", {
      type: "access",
      priority: 100,
      validator: (context) => validateGameAccess(context, (...args) => this.kernelInterface(...args)),
      description: "Controls access to game mode"
    });

    this.registerGate("dev.access", {
      type: "access",
      priority: 90,
      validator: (context) => validateDevAccess(context, (...args) => this.kernelInterface(...args)),
      description: "Controls access to development mode"
    });

    this.registerGate("patcher.access", {
      type: "access",
      priority: 95,
      validator: (context) => validatePatcherAccess(context, (...args) => this.kernelInterface(...args)),
      description: "Controls access to patch mode"
    });

    this.registerGate("patch.apply", {
      type: "operation",
      priority: 200,
      validator: (context) => validatePatchApply(context, (...args) => this.kernelInterface(...args)),
      description: "Controls patch apply operations"
    });

    this.registerGate("kernel.tick", {
      type: "operation",
      priority: 300,
      validator: (context) => validateTickOperation(context, (...args) => this.kernelInterface(...args)),
      description: "Controls tick advancement"
    });

    this.registerGate("state.modify", {
      type: "operation",
      priority: 250,
      validator: (context) => validateStateModification(context, (...args) => this.kernelInterface(...args)),
      description: "Controls state modifications"
    });

    this.registerGate("system.reset", {
      type: "system",
      priority: 50,
      validator: (context) => validateSystemReset(context, (...args) => this.kernelInterface(...args)),
      description: "Controls system reset"
    });

    this.registerGate("system.shutdown", {
      type: "system",
      priority: 10,
      validator: (context) => validateSystemShutdown(context, (...args) => this.kernelInterface(...args)),
      description: "Controls system shutdown"
    });

    // Generic governance gates used by ActionRegistry mapping.
    this.registerGate("game.action", {
      type: "access",
      priority: 120,
      validator: (context) => validateGameAccess(context, (...args) => this.kernelInterface(...args)),
      description: "Kernel-enforced game action gate"
    });
    this.registerGate("ui.action", {
      type: "access",
      priority: 120,
      validator: () => ({ valid: true }),
      description: "Kernel-enforced UI action gate"
    });
    this.registerGate("kernel.action", {
      type: "access",
      priority: 120,
      validator: () => ({ valid: true }),
      description: "Kernel-enforced kernel action gate"
    });
    this.registerGate("patch.action", {
      type: "access",
      priority: 120,
      validator: () => ({ valid: true }),
      description: "Kernel-enforced patch action gate"
    });
  }

  registerGate(gateName, config = {}) {
    if (typeof gateName !== "string" || gateName.trim().length === 0) {
      throw new Error("[KERNEL_GATES] gateName fehlt.");
    }
    if (typeof config.validator !== "function") {
      throw new Error(`[KERNEL_GATES] validator fehlt fuer Gate '${gateName}'.`);
    }

    const gate = {
      name: gateName,
      type: config.type || "operation",
      priority: Number.isFinite(config.priority) ? config.priority : 100,
      validator: config.validator,
      description: config.description || "",
      enabled: config.enabled !== false,
      metrics: { executions: 0, successes: 0, failures: 0 }
    };

    this.gates.set(gateName, gate);
  }

  getGateNames() {
    return Array.from(this.gates.keys());
  }

  getGateStatus(gateName) {
    const gate = this.gates.get(gateName);
    if (!gate) {
      return null;
    }
    return {
      name: gate.name,
      type: gate.type,
      enabled: gate.enabled,
      metrics: { ...gate.metrics },
      description: gate.description
    };
  }

  async executeGate(gateName, context = {}) {
    const gate = this.gates.get(gateName);
    if (!gate) {
      throw new Error(`Gate not found: ${gateName}`);
    }
    if (!gate.enabled) {
      throw new Error(`Gate disabled: ${gateName}`);
    }

    gate.metrics.executions += 1;
    const startedAt = Date.now();

    try {
      const validationResult = await gate.validator(context);
      if (!isPlainObject(validationResult) || typeof validationResult.valid !== "boolean") {
        throw new Error(`Gate '${gateName}' returned invalid validator result.`);
      }
      if (!validationResult.valid) {
        throw new Error(validationResult.reason || `Gate validation failed: ${gateName}`);
      }

      gate.metrics.successes += 1;
      this.#logGateExecution(gateName, "allow", context, startedAt);
      return { allowed: true, gateName };
    } catch (error) {
      gate.metrics.failures += 1;
      this.#logGateExecution(gateName, "deny", { ...context, error: String(error?.message || error) }, startedAt);
      throw error;
    }
  }

  #logGateExecution(gateName, decision, payload, startedAt) {
    this.gateHistory.push({
      gateName,
      decision,
      elapsedMs: Date.now() - startedAt,
      payload
    });
    if (this.gateHistory.length > 1000) {
      this.gateHistory = this.gateHistory.slice(-1000);
    }
  }
}
