/**
 * Kernel Gates Architecture - Harmonized Implementation
 * Provides deterministic gate system for kernel operations
 */

import { validateGameAccess, validateDevAccess, validatePatcherAccess } from './gates/accessGates.js';
import { validatePatchApply, validateTickOperation, validateStateModification, validateSystemReset, validateSystemShutdown } from './gates/operationGates.js';

export class KernelGates {
  constructor(kernelInterface) {
    this.kernelInterface = kernelInterface;
    this.gates = new Map();
    this.gateHistory = [];
    
    this.initializeCoreGates();
  }

  initializeCoreGates() {
    // Access control gates
    this.registerGate('game.access', {
      type: 'access', priority: 100,
      validator: (context) => validateGameAccess(context, (...args) => this.kernelInterface(...args)),
      description: 'Controls access to game mode'
    });

    this.registerGate('dev.access', {
      type: 'access', priority: 90,
      validator: (context) => validateDevAccess(context, (...args) => this.kernelInterface(...args)),
      description: 'Controls access to development mode'
    });

    this.registerGate('patcher.access', {
      type: 'access', priority: 95,
      validator: (context) => validatePatcherAccess(context, (...args) => this.kernelInterface(...args)),
      description: 'Controls access to patcher mode'
    });

    // Operation gates
    this.registerGate('patch.apply', {
      type: 'operation', priority: 200,
      validator: (context) => validatePatchApply(context, (...args) => this.kernelInterface(...args)),
      preHooks: ['patch.validate', 'patch.backup'], postHooks: ['patch.verify', 'patch.cleanup'],
      description: 'Controls patch application'
    });

    this.registerGate('kernel.tick', {
      type: 'operation', priority: 300,
      validator: (context) => validateTickOperation(context, (...args) => this.kernelInterface(...args)),
      preHooks: ['tick.save_state'], postHooks: ['tick.update_metrics', 'tick.cleanup'],
      description: 'Controls kernel tick advancement'
    });

    this.registerGate('state.modify', {
      type: 'operation', priority: 250,
      validator: (context) => validateStateModification(context, (...args) => this.kernelInterface(...args)),
      preHooks: ['state.validate', 'state.backup'], postHooks: ['state.verify_consistency'],
      description: 'Controls state modifications'
    });

    // System gates
    this.registerGate('system.reset', {
      type: 'system', priority: 50,
      validator: (context) => validateSystemReset(context, (...args) => this.kernelInterface(...args)),
      preHooks: ['system.backup_all'], postHooks: ['system.cleanup'],
      description: 'Controls system reset operations'
    });

    this.registerGate('system.shutdown', {
      type: 'system', priority: 10,
      validator: (context) => validateSystemShutdown(context, (...args) => this.kernelInterface(...args)),
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
      metrics: { executions: 0, successes: 0, failures: 0, avgExecutionTime: 0 }
    };

    this.gates.set(gateName, gate);
  }

  async executeGate(gateName, context = {}) {
    const gate = this.gates.get(gateName);
    if (!gate) throw new Error(`Gate not found: ${gateName}`);
    if (!gate.enabled) throw new Error(`Gate disabled: ${gateName}`);

    gate.metrics.executions++;

    try {
      this.logGateExecution(gateName, 'start', context);
      const validationResult = await gate.validator(context);
      if (!validationResult.valid) {
        throw new Error(`Gate validation failed: ${validationResult.reason || 'Unknown reason'}`);
      }

      await this.executeHooks(gate.preHooks, context, 'pre');
      const result = await this.executeGateOperation(gateName, context);
      await this.executeHooks(gate.postHooks, context, 'post');

      gate.metrics.successes++;
      this.logGateExecution(gateName, 'success', { context, result });
      return result;
    } catch (error) {
      gate.metrics.failures++;
      this.logGateExecution(gateName, 'failure', { context, error: error.message });
      throw error;
    }
  }

  async executeHooks(hooks, context, phase) {
    for (const hookName of hooks) {
      await this.executeHook(hookName, context, phase);
    }
  }

  async executeHook(hookName, context, phase) {
    if (!this.kernelInterface) return;
    const result = this.kernelInterface(`hook.execute.${hookName}`, { context, phase });
    if (result instanceof Promise) return await result;
    return result;
  }

  async executeGateOperation(gateName, context) {
    switch (gateName) {
      case 'patch.apply':   return await this.kernelInterface('patch.apply', context.patchData);
      case 'kernel.tick':   return await this.kernelInterface('tick.advance', context.tickCount);
      case 'state.modify':  return await this.kernelInterface('state.modify', context.modification);
      case 'system.reset':  return await this.kernelInterface('system.reset');
      case 'system.shutdown': return await this.kernelInterface('system.shutdown');
      default: throw new Error(`Unknown gate operation: ${gateName}`);
    }
  }

  logGateExecution(gateName, status, data) {
    const logEntry = { gate: gateName, status, data: JSON.stringify(data) };
    this.gateHistory.push(logEntry);
    if (this.gateHistory.length > 1000) this.gateHistory = this.gateHistory.slice(-1000);
  }

  getGateStatus(gateName) {
    const gate = this.gates.get(gateName);
    if (!gate) return null;
    return { name: gate.name, type: gate.type, enabled: gate.enabled, metrics: { ...gate.metrics }, description: gate.description };
  }
}
