/**
 * Kernel Gates Architecture - Harmonized Implementation
 * Provides deterministic gate system for kernel operations
 */

export class KernelGates {
  constructor(kernelInterface) {
    this.kernelInterface = kernelInterface;
    this.gates = new Map();
    this.gateHistory = [];
    this.gateMetrics = new Map();
    
    this.initializeCoreGates();
  }

  initializeCoreGates() {
    // Access control gates
    this.registerGate('game.access', {
      type: 'access',
      priority: 100,
      validator: (context) => this.validateGameAccess(context),
      description: 'Controls access to game mode'
    });

    this.registerGate('dev.access', {
      type: 'access',
      priority: 90,
      validator: (context) => this.validateDevAccess(context),
      description: 'Controls access to development mode'
    });

    this.registerGate('patcher.access', {
      type: 'access',
      priority: 95,
      validator: (context) => this.validatePatcherAccess(context),
      description: 'Controls access to patcher mode'
    });

    // Operation gates
    this.registerGate('patch.apply', {
      type: 'operation',
      priority: 200,
      validator: (context) => this.validatePatchApply(context),
      preHooks: ['patch.validate', 'patch.backup'],
      postHooks: ['patch.verify', 'patch.cleanup'],
      description: 'Controls patch application'
    });

    this.registerGate('kernel.tick', {
      type: 'operation',
      priority: 300,
      validator: (context) => this.validateTickOperation(context),
      preHooks: ['tick.save_state'],
      postHooks: ['tick.update_metrics', 'tick.cleanup'],
      description: 'Controls kernel tick advancement'
    });

    this.registerGate('state.modify', {
      type: 'operation',
      priority: 250,
      validator: (context) => this.validateStateModification(context),
      preHooks: ['state.validate', 'state.backup'],
      postHooks: ['state.verify_consistency'],
      description: 'Controls state modifications'
    });

    // System gates
    this.registerGate('system.reset', {
      type: 'system',
      priority: 50,
      validator: (context) => this.validateSystemReset(context),
      preHooks: ['system.backup_all'],
      postHooks: ['system.cleanup'],
      description: 'Controls system reset operations'
    });

    this.registerGate('system.shutdown', {
      type: 'system',
      priority: 10,
      validator: (context) => this.validateSystemShutdown(context),
      preHooks: ['system.save_all', 'system.notify_clients'],
      description: 'Controls system shutdown'
    });
  }

  registerGate(gateName, config) {
    const gate = {
      name: gateName,
      type: config.type || 'operation',
      priority: config.priority || 100,
      validator: config.validator || (() => true),
      preHooks: config.preHooks || [],
      postHooks: config.postHooks || [],
      description: config.description || '',
      enabled: true,
      metrics: {
        executions: 0,
        successes: 0,
        failures: 0,
        avgExecutionTime: 0
      }
    };

    this.gates.set(gateName, gate);
    console.log(`[KERNEL_GATES] Registered gate: ${gateName}`);
  }

  async executeGate(gateName, context = {}) {
    const gate = this.gates.get(gateName);
    if (!gate) {
      throw new Error(`Gate not found: ${gateName}`);
    }

    if (!gate.enabled) {
      throw new Error(`Gate disabled: ${gateName}`);
    }

    const startTime = performance.now();
    gate.metrics.executions++;

    try {
      // Log gate execution
      this.logGateExecution(gateName, 'start', context);

      // Validate through gate
      const validationResult = await gate.validator(context);
      if (!validationResult.valid) {
        throw new Error(`Gate validation failed: ${validationResult.reason || 'Unknown reason'}`);
      }

      // Execute pre-hooks
      await this.executeHooks(gate.preHooks, context, 'pre');

      // Execute the main operation
      const result = await this.executeGateOperation(gateName, context);

      // Execute post-hooks
      await this.executeHooks(gate.postHooks, context, 'post');

      // Update metrics
      gate.metrics.successes++;
      const executionTime = performance.now() - startTime;
      gate.metrics.avgExecutionTime = 
        (gate.metrics.avgExecutionTime * (gate.metrics.successes - 1) + executionTime) / gate.metrics.successes;

      this.logGateExecution(gateName, 'success', { context, result, executionTime });

      return result;

    } catch (error) {
      gate.metrics.failures++;
      this.logGateExecution(gateName, 'failure', { context, error: error.message });
      throw error;
    }
  }

  async executeHooks(hooks, context, phase) {
    for (const hookName of hooks) {
      try {
        await this.executeHook(hookName, context, phase);
      } catch (error) {
        console.error(`[KERNEL_GATES] Hook ${hookName} failed in ${phase}:`, error);
        // Continue with other hooks, but log the error
      }
    }
  }

  async executeHook(hookName, context, phase) {
    if (!this.kernelInterface) {
      console.warn(`[KERNEL_GATES] No kernel interface for hook: ${hookName}`);
      return;
    }

    try {
      const result = this.kernelInterface(`hook.execute.${hookName}`, {
        context,
        phase,
        timestamp: Date.now()
      });

      if (result instanceof Promise) {
        return await result;
      }

      return result;
    } catch (error) {
      console.error(`[KERNEL_GATES] Hook execution failed: ${hookName}`, error);
      throw error;
    }
  }

  async executeGateOperation(gateName, context) {
    // Route to appropriate kernel operation
    switch (gateName) {
      case 'patch.apply':
        return await this.kernelInterface('patch.apply', context.patchData);
      
      case 'kernel.tick':
        return await this.kernelInterface('tick.advance', context.tickCount);
      
      case 'state.modify':
        return await this.kernelInterface('state.modify', context.modification);
      
      case 'system.reset':
        return await this.kernelInterface('system.reset');
      
      case 'system.shutdown':
        return await this.kernelInterface('system.shutdown');
      
      default:
        throw new Error(`Unknown gate operation: ${gateName}`);
    }
  }

  // Gate validators
  validateGameAccess(context) {
    // Check if game mode is accessible
    const hasGameLogic = !!(context.gameLogic || this.kernelInterface('game.exists'));
    const systemReady = this.kernelInterface('system.ready');
    
    return {
      valid: hasGameLogic && systemReady,
      reason: !hasGameLogic ? 'Game logic not available' : 'System not ready'
    };
  }

  validateDevAccess(context) {
    // Check if development mode is accessible
    const isDevEnvironment = process.env.NODE_ENV === 'development' || 
                           window.location.hostname === 'localhost';
    const hasDevTools = !!(context.kernelInterface || this.kernelInterface('dev.available'));
    
    return {
      valid: isDevEnvironment && hasDevTools,
      reason: !isDevEnvironment ? 'Not in development environment' : 'Dev tools not available'
    };
  }

  validatePatcherAccess(context) {
    // Check if patcher mode is accessible
    const hasPatchSystem = this.kernelInterface('patch.system.available');
    const userCanPatch = this.kernelInterface('user.can_patch');
    
    return {
      valid: hasPatchSystem && userCanPatch,
      reason: !hasPatchSystem ? 'Patch system not available' : 'User lacks patch permissions'
    };
  }

  validatePatchApply(context) {
    const patchData = context.patchData;
    if (!patchData) {
      return { valid: false, reason: 'No patch data provided' };
    }

    // Validate patch structure
    const requiredFields = ['id', 'version', 'schema'];
    for (const field of requiredFields) {
      if (!patchData[field]) {
        return { valid: false, reason: `Missing required field: ${field}` };
      }
    }

    // Check if patch already exists
    const existingPatch = this.kernelInterface('patch.get', patchData.id);
    if (existingPatch && existingPatch.version >= patchData.version) {
      return { 
        valid: false, 
        reason: `Patch version ${patchData.version} is not newer than existing version ${existingPatch.version}` 
      };
    }

    return { valid: true };
  }

  validateTickOperation(context) {
    const tickCount = context.tickCount;
    if (typeof tickCount !== 'number' || tickCount <= 0) {
      return { valid: false, reason: 'Invalid tick count' };
    }

    // Check if system can advance
    const canAdvance = this.kernelInterface('tick.can_advance');
    if (!canAdvance) {
      return { valid: false, reason: 'System cannot advance tick' };
    }

    return { valid: true };
  }

  validateStateModification(context) {
    const modification = context.modification;
    if (!modification || typeof modification !== 'object') {
      return { valid: false, reason: 'Invalid modification object' };
    }

    // Check if modification is allowed
    const canModify = this.kernelInterface('state.can_modify', modification);
    if (!canModify) {
      return { valid: false, reason: 'State modification not allowed' };
    }

    return { valid: true };
  }

  validateSystemReset(context) {
    // Check if system reset is allowed
    const canReset = this.kernelInterface('system.can_reset');
    if (!canReset) {
      return { valid: false, reason: 'System reset not allowed' };
    }

    return { valid: true };
  }

  validateSystemShutdown(context) {
    // Check if system shutdown is allowed
    const canShutdown = this.kernelInterface('system.can_shutdown');
    if (!canShutdown) {
      return { valid: false, reason: 'System shutdown not allowed' };
    }

    return { valid: true };
  }

  logGateExecution(gateName, status, data) {
    const logEntry = {
      timestamp: Date.now(),
      gate: gateName,
      status,
      data: JSON.stringify(data)
    };

    this.gateHistory.push(logEntry);

    // Keep only last 1000 entries
    if (this.gateHistory.length > 1000) {
      this.gateHistory = this.gateHistory.slice(-1000);
    }

    console.log(`[KERNEL_GATES] ${gateName} ${status}`, data);
  }

  // Public API methods
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

  getAllGateStatuses() {
    return Array.from(this.gates.entries()).map(([name, gate]) => ({
      name,
      type: gate.type,
      enabled: gate.enabled,
      metrics: { ...gate.metrics },
      description: gate.description
    }));
  }

  enableGate(gateName) {
    const gate = this.gates.get(gateName);
    if (gate) {
      gate.enabled = true;
      console.log(`[KERNEL_GATES] Gate enabled: ${gateName}`);
    }
  }

  disableGate(gateName) {
    const gate = this.gates.get(gateName);
    if (gate) {
      gate.enabled = false;
      console.log(`[KERNEL_GATES] Gate disabled: ${gateName}`);
    }
  }

  getGateHistory(limit = 100) {
    return this.gateHistory.slice(-limit);
  }

  getGateMetrics() {
    const metrics = {};
    for (const [name, gate] of this.gates) {
      metrics[name] = { ...gate.metrics };
    }
    return metrics;
  }

  resetGateMetrics() {
    for (const gate of this.gates.values()) {
      gate.metrics = {
        executions: 0,
        successes: 0,
        failures: 0,
        avgExecutionTime: 0
      };
    }
  }
}

// Hook system for kernel gates
export class KernelHooks {
  constructor() {
    this.hooks = new Map();
  }

  registerHook(hookName, handler, priority = 100) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    this.hooks.get(hookName).push({
      handler,
      priority,
      id: Math.random().toString(36).substr(2, 9)
    });

    // Sort by priority
    this.hooks.get(hookName).sort((a, b) => a.priority - b.priority);
  }

  async executeHook(hookName, context) {
    const hooks = this.hooks.get(hookName) || [];
    const results = [];

    for (const hook of hooks) {
      try {
        const result = await hook.handler(context);
        results.push({ hookId: hook.id, result, success: true });
      } catch (error) {
        results.push({ hookId: hook.id, error: error.message, success: false });
      }
    }

    return results;
  }

  unregisterHook(hookName, hookId) {
    const hooks = this.hooks.get(hookName);
    if (hooks) {
      const index = hooks.findIndex(h => h.id === hookId);
      if (index !== -1) {
        hooks.splice(index, 1);
      }
    }
  }

  getHookList() {
    const hookList = {};
    for (const [name, hooks] of this.hooks) {
      hookList[name] = hooks.map(h => ({
        id: h.id,
        priority: h.priority
      }));
    }
    return hookList;
  }
}
