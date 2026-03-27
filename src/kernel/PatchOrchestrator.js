/**
 * PatchOrchestrator - Manages patches through Kernel only
 * Never reads or writes gameState directly - only kernel acknowledgements
 */

export class PatchOrchestrator {
  constructor(kernel) {
    this.kernel = kernel;
    this.patchQueue = [];
    this.acknowledgements = [];
    this.sessionState = 'idle';
    // Strict flag - prevents any direct game state access
    this.gameStateAccess = false;
  }

  // All patch operations go through kernel
  async registerPatch(patchData) {
    // Capture tick before async operations
    const tick = this.kernel.getCurrentTick();
    
    // Queue patch for kernel processing
    const patchRequest = {
      type: 'registerPatch',
      patch: patchData,
      queuedAt: tick
    };

    this.patchQueue.push(patchRequest);

    // Send to kernel - no direct game state access
    const result = await this.kernel.execute({
      domain: 'patch',
      action: {
        type: 'registerPatch',
        patch: patchData
      }
    });

    // Store only acknowledgement with original tick
    const acknowledgement = {
      action: 'registerPatch',
      patchId: patchData.id,
      status: result.success ? 'registered' : 'failed',
      tick,
      kernelResponse: result.success ? { success: true } : { error: result.error }
    };

    this.acknowledgements.push(acknowledgement);
    return acknowledgement;
  }

  async unregisterPatch(patchId) {
    // Capture tick before async operations
    const tick = this.kernel.getCurrentTick();
    
    const result = await this.kernel.execute({
      domain: 'patch',
      action: {
        type: 'unregisterPatch',
        patchId
      }
    });

    const acknowledgement = {
      action: 'unregisterPatch',
      patchId,
      status: result.success ? 'unregistered' : 'failed',
      tick
    };

    this.acknowledgements.push(acknowledgement);
    return acknowledgement;
  }

  async listPatches() {
    // Capture tick before async operations
    const tick = this.kernel.getCurrentTick();
    
    // Only through kernel - no direct state access
    const result = await this.kernel.execute({
      domain: 'patch',
      action: { type: 'listPatches' }
    });

    const acknowledgement = {
      action: 'listPatches',
      count: result.patches?.length || 0,
      tick
    };

    this.acknowledgements.push(acknowledgement);
    return acknowledgement;
  }

  // Session management via kernel only
  async startSession(sessionConfig) {
    // Capture tick before async operations
    const tick = this.kernel.getCurrentTick();
    this.sessionState = 'starting';

    const result = await this.kernel.execute({
      domain: 'patch',
      action: {
        type: 'startSession',
        config: sessionConfig
      }
    });

    const acknowledgement = {
      action: 'startSession',
      sessionId: result.sessionId,
      status: result.success ? 'started' : 'failed',
      tick
    };

    this.acknowledgements.push(acknowledgement);

    if (result.success) {
      this.sessionState = 'active';
    }

    return acknowledgement;
  }

  async endSession() {
    // Capture tick before async operations
    const tick = this.kernel.getCurrentTick();
    
    const result = await this.kernel.execute({
      domain: 'patch',
      action: { type: 'endSession' }
    });

    this.sessionState = result.success ? 'ended' : 'error';

    const acknowledgement = {
      action: 'endSession',
      status: this.sessionState,
      tick
    };

    this.acknowledgements.push(acknowledgement);
    return acknowledgement;
  }

  // Apply patch via kernel only - never touches gameState directly
  async applyPatch(patchId) {
    // Capture tick before async operations
    const tick = this.kernel.getCurrentTick();
    
    const result = await this.kernel.execute({
      domain: 'patch',
      action: {
        type: 'applyPatch',
        patchId
      }
    });

    const acknowledgement = {
      action: 'applyPatch',
      patchId,
      status: result.success ? 'applied' : 'failed',
      tick
    };

    this.acknowledgements.push(acknowledgement);
    return acknowledgement;
  }

  // Get acknowledgements only - never gameState
  getAcknowledgements(filter = {}) {
    return this.acknowledgements.filter(ack => {
      if (filter.action && ack.action !== filter.action) return false;
      if (filter.patchId && ack.patchId !== filter.patchId) return false;
      if (filter.since && ack.tick < filter.since) return false;
      return true;
    });
  }

  // STRICT ENFORCEMENT: This will throw if attempted
  getGameState() {
    throw new Error(
      '[PATCH_ORCHESTRATOR] Direct game state access forbidden. ' +
      'Patch domain only receives kernel acknowledgements.'
    );
  }

  // STRICT ENFORCEMENT: This will throw if attempted
  mutateGameState() {
    throw new Error(
      '[PATCH_ORCHESTRATOR] Direct game state mutation forbidden. ' +
      'Use kernel.execute with domain: "game" for state changes.'
    );
  }

  getStats() {
    return {
      queuedPatches: this.patchQueue.length,
      totalAcknowledgements: this.acknowledgements.length,
      sessionState: this.sessionState,
      gameStateAccess: this.gameStateAccess // Should always be false
    };
  }

  clearAcknowledgements() {
    this.acknowledgements = [];
  }
}
