/**
 * Kernel-controlled UI Plugin Controller
 * Ensures deterministic UI behavior and prevents unauthorized mutations
 */
export class UIPluginController {
  constructor(kernelController) {
    this.kernel = kernelController;
    this.plugins = new Map();
    this.uiState = new Map();
    this.mutationLog = [];
    this.deterministicSeed = null;
    this.allowedMutations = new Set([
      'ui_update', 'plugin_state_change', 'event_trigger', 'visual_effect'
    ]);
    // Track current plugin execution context
    this.currentPluginId = null;
  }

  /**
   * Register UI plugin with kernel validation
   */
  registerPlugin(pluginId, pluginConfig) {
    // Validate plugin determinism
    const validation = this.validatePluginDeterminism(pluginConfig);
    if (!validation.valid) {
      throw new Error(`[KERNEL_UI] Plugin ${pluginId} failed determinism validation: ${validation.errors.join(', ')}`);
    }

    // Create sandboxed plugin instance
    const sandboxedPlugin = this.createSandboxedPlugin(pluginId, pluginConfig);
    
    this.plugins.set(pluginId, {
      id: pluginId,
      config: pluginConfig,
      instance: sandboxedPlugin,
      registeredAt: this.kernel.getCurrentTick(),
      mutationCount: 0,
      lastMutation: null
    });

    console.log(`[KERNEL_UI] Plugin registered: ${pluginId} (deterministic: ${validation.valid})`);
  }

  /**
   * Validate plugin for deterministic behavior
   */
  validatePluginDeterminism(pluginConfig) {
    const errors = [];
    const warnings = [];

    // Check for forbidden patterns (only direct access)
    const forbiddenDirectPatterns = [
      'Math.random', 'Date.now', 'performance.now', 
      'setTimeout', 'setInterval', 'localStorage',
      'sessionStorage', 'fetch(', 'XMLHttpRequest',
      'Worker(', 'EventSource'
    ];

    // Allow kernel-controlled WebSocket access
    const allowedPatterns = [
      'sandbox.ws.send', 'sandbox.ws.onmessage', 
      'sandbox.ws.connect', 'sandbox.kernel.ws'
    ];

    const pluginCode = JSON.stringify(pluginConfig);
    for (const pattern of forbiddenDirectPatterns) {
      if (pluginCode.includes(pattern)) {
        errors.push(`Direct forbidden pattern detected: ${pattern}. Use sandbox.ws instead.`);
      }
    }

    // Validate plugin structure
    if (!pluginConfig.id || typeof pluginConfig.id !== 'string') {
      errors.push('Plugin ID is required and must be a string');
    }

    if (!pluginConfig.hooks || typeof pluginConfig.hooks !== 'object') {
      errors.push('Plugin hooks are required and must be an object');
    }

    // Check for external dependencies
    if (pluginConfig.dependencies && pluginConfig.dependencies.length > 0) {
      warnings.push('Plugin has external dependencies - may affect determinism');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create sandboxed plugin instance
   */
  createSandboxedPlugin(pluginId, pluginConfig) {
    const sandbox = {
      // Kernel-provided deterministic functions
      rng: this.createDeterministicRNG(),
      time: this.createDeterministicTime(),
      state: this.createDeterministicState(pluginId),
      
      // Safe UI operations (kernel-controlled)
      ui: {
        createElement: this.safeCreateElement.bind(this),
        updateElement: this.safeUpdateElement.bind(this),
        addEvent: this.safeAddEvent.bind(this),
        removeEvent: this.safeRemoveEvent.bind(this)
      },
      
      // Kernel-controlled WebSocket for browser patches
      ws: this.createDeterministicWebSocket(pluginId),
      
      // Kernel interface
      kernel: {
        getState: () => this.kernel.getCurrentState(),
        mutateState: (mutation) => this.kernel.executeMutation(mutation),
        logEvent: (event) => this.logUIEvent(pluginId, event),
        ws: this.getKernelWebSocket()
      }
    };

    // Create plugin in sandbox
    const pluginInstance = {
      id: pluginId,
      sandbox,
      hooks: {},
      
      // Safe hook registration
      registerHook: (hookName, handler) => {
        if (typeof handler === 'function') {
          pluginInstance.hooks[hookName] = this.sandboxHook(pluginId, handler);
        }
      },
      
      // Safe execution
      execute: (action, ...args) => {
        return this.executePluginAction(pluginId, action, ...args);
      }
    };

    // Initialize plugin hooks
    if (pluginConfig.hooks) {
      for (const [hookName, hookCode] of Object.entries(pluginConfig.hooks)) {
        try {
          const handler = new Function('sandbox', hookCode);
          pluginInstance.registerHook(hookName, handler.bind(null, sandbox));
        } catch (error) {
          console.error(`[KERNEL_UI] Failed to create hook ${hookName} for plugin ${pluginId}:`, error);
        }
      }
    }

    return pluginInstance;
  }

  /**
   * Create deterministic RNG for plugin
   */
  createDeterministicRNG() {
    const seed = this.deterministicSeed || 'default-seed';
    
    // Simple deterministic RNG (same seed = same sequence)
    let currentSeed = this.hashCode(seed);
    const nextRandom = () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };
    
    return {
      random: () => nextRandom(),
      
      randint: (min, max) => {
        return Math.floor(nextRandom() * (max - min + 1)) + min;
      },
      
      choice: (array) => {
        return array[Math.floor(nextRandom() * array.length)];
      }
    };
  }

  /**
   * Create deterministic WebSocket for plugin
   */
  createDeterministicWebSocket(pluginId) {
    return {
      send: (data) => {
        // Log WebSocket send for reproducibility
        this.logMutation(pluginId, 'websocket_send', {
          data: this.sanitizeResult(data),
          tick: this.kernel.getCurrentTick(),
          seed: this.deterministicSeed
        });
        
        // Send through kernel-controlled WebSocket
        if (this.kernelWebSocket && this.kernelWebSocket.readyState === 1) {
          const message = {
            type: 'plugin_message',
            pluginId: pluginId,
            data: data,
            tick: this.kernel.getCurrentTick(),
            seed: this.deterministicSeed,
            timestamp: this.kernel.getCurrentTick()
          };
          
          this.kernelWebSocket.send(JSON.stringify(message));
        }
      },
      
      onmessage: null,
      
      connect: (url) => {
        // Only allow kernel-controlled WebSocket URLs
        const allowedUrls = ['ws://localhost:8080', 'ws://127.0.0.1:8080'];
        
        if (!allowedUrls.includes(url)) {
          throw new Error(`[KERNEL_UI] WebSocket URL not allowed: ${url}`);
        }
        
        this.logMutation(pluginId, 'websocket_connect', { url });
        
        // Connect through kernel
        return this.connectKernelWebSocket(url, pluginId);
      },
      
      close: () => {
        this.logMutation(pluginId, 'websocket_close');
        
        if (this.kernelWebSocket) {
          this.kernelWebSocket.close();
        }
      },
      
      readyState: 1 // OPEN (simulated)
    };
  }

  /**
   * Get kernel WebSocket instance
   */
  getKernelWebSocket() {
    return this.createDeterministicWebSocket('kernel');
  }

  /**
   * Connect kernel WebSocket
   */
  connectKernelWebSocket(url, pluginId) {
    if (!this.kernelWebSocket) {
      try {
        this.kernelWebSocket = new WebSocket(url);
        
        this.kernelWebSocket.onopen = () => {
          console.log(`[KERNEL_UI] WebSocket connected for plugin: ${pluginId}`);
          this.logMutation(pluginId, 'websocket_connected', { url });
        };
        
        this.kernelWebSocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(pluginId, data);
        };
        
        this.kernelWebSocket.onclose = () => {
          console.log(`[KERNEL_UI] WebSocket disconnected for plugin: ${pluginId}`);
          this.logMutation(pluginId, 'websocket_disconnected');
          this.kernelWebSocket = null;
        };
        
        this.kernelWebSocket.onerror = (error) => {
          console.error(`[KERNEL_UI] WebSocket error for plugin ${pluginId}:`, error);
          this.logMutation(pluginId, 'websocket_error', { error: error.message });
        };
        
      } catch (error) {
        console.error(`[KERNEL_UI] Failed to connect WebSocket for plugin ${pluginId}:`, error);
        this.logMutation(pluginId, 'websocket_connection_failed', { error: error.message });
      }
    }
    
    return this.kernelWebSocket;
  }

  /**
   * Handle WebSocket message
   */
  handleWebSocketMessage(pluginId, data) {
    // Route message to appropriate plugin
    const plugin = this.plugins.get(pluginId);
    if (plugin && plugin.instance.sandbox.ws.onmessage) {
      try {
        plugin.instance.sandbox.ws.onmessage(data);
      } catch (error) {
        console.error(`[KERNEL_UI] WebSocket message handling failed for plugin ${pluginId}:`, error);
      }
    }
    
    this.logMutation(pluginId, 'websocket_message_received', { data });
  }

  /**
   * Create deterministic time for plugin
   */
  createDeterministicTime() {
    return {
      tick: () => this.kernel.getCurrentTick(),
      ticks: () => this.kernel.getCurrentTick(),
      
      // No real-time access - only kernel ticks
      now: () => {
        throw new Error('[KERNEL_UI] Real-time access not allowed in deterministic plugins');
      }
    };
  }

  /**
   * Create deterministic state for plugin
   */
  createDeterministicState(pluginId) {
    return {
      get: (key) => this.uiState.get(`${pluginId}:${key}`),
      set: (key, value) => {
        this.logMutation(pluginId, 'plugin_state_change', { key, value });
        this.uiState.set(`${pluginId}:${key}`, value);
      },
      
      // No direct access to global state
      global: () => {
        throw new Error('[KERNEL_UI] Direct global state access not allowed');
      }
    };
  }

  /**
   * Sandbox plugin hook for deterministic execution
   */
  sandboxHook(pluginId, handler) {
    return (...args) => {
      const executionId = `${pluginId}-${this.kernel.getCurrentTick()}`;
      
      // Set plugin execution context
      this.setCurrentPluginId(pluginId);
      
      try {
        // Log hook execution
        this.logMutation(pluginId, 'hook_execution', { 
          executionId, 
          args: this.sanitizeArgs(args) 
        });
        
        // Execute hook in controlled environment
        const result = handler(...args);
        
        // Validate result is deterministic
        if (result && typeof result === 'object') {
          this.validateDeterministicResult(pluginId, result);
        }
        
        return result;
        
      } catch (error) {
        console.error(`[KERNEL_UI] Hook execution failed for plugin ${pluginId}:`, error);
        this.logMutation(pluginId, 'hook_error', { error: error.message });
        return null;
      } finally {
        // Clear plugin execution context
        this.clearCurrentPluginId();
      }
    };
  }

  /**
   * Execute plugin action with kernel validation
   */
  executePluginAction(pluginId, action, ...args) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`[KERNEL_UI] Plugin ${pluginId} not found`);
    }

    // Set plugin execution context
    this.setCurrentPluginId(pluginId);

    try {
      // Validate action is deterministic
      this.validateDeterministicAction(pluginId, action, args);
      
      // Execute with mutation tracking
      const startTime = this.kernel.getCurrentTick();
      const result = plugin.instance.execute(action, ...args);
      const endTime = this.kernel.getCurrentTick();
      
      // Log execution for reproducibility
      this.logMutation(pluginId, 'plugin_action', {
        action,
        args: this.sanitizeArgs(args),
        result: this.sanitizeResult(result),
        startTick: startTime,
        endTick: endTime,
        seed: this.deterministicSeed
      });
      
      return result;
    } catch (error) {
      // Log execution error
      this.logMutation(pluginId, 'plugin_action_error', {
        action,
        error: error.message,
        tick: this.kernel.getCurrentTick()
      });
      
      console.error(`[KERNEL_UI] Plugin action execution failed for ${pluginId}:`, error);
      throw error;
    } finally {
      // Clear plugin execution context
      this.clearCurrentPluginId();
    }
  }

  /**
   * Safe element creation (kernel-controlled)
   */
  safeCreateElement(tag, attributes = {}) {
    // Validate element creation
    this.validateElementCreation(tag, attributes);
    
    const element = document.createElement(tag);
    
    // Apply safe attributes only
    for (const [key, value] of Object.entries(attributes)) {
      if (this.isValidAttribute(key, value)) {
        element.setAttribute(key, value);
      }
    }
    
    // Mark as kernel-controlled
    element.setAttribute('data-kernel-controlled', 'true');
    element.setAttribute('data-plugin-id', this.getCurrentPluginId());
    
    return element;
  }

  /**
   * Safe element update (kernel-controlled)
   */
  safeUpdateElement(element, updates) {
    if (!element || !element.hasAttribute('data-kernel-controlled')) {
      throw new Error('[KERNEL_UI] Cannot update non-kernel-controlled element');
    }

    for (const [key, value] of Object.entries(updates)) {
      if (this.isValidUpdate(key, value)) {
        this.logMutation(this.getCurrentPluginId(), 'ui_update', { 
          element: element.tagName, 
          key, 
          value 
        });
        
        if (key === 'textContent') {
          element.textContent = value;
        } else if (key === 'style' && typeof value === 'object') {
          Object.assign(element.style, value);
        } else {
          element.setAttribute(key, value);
        }
      }
    }
  }

  /**
   * Safe event addition (kernel-controlled)
   */
  safeAddEvent(element, eventType, handler) {
    if (!element || !element.hasAttribute('data-kernel-controlled')) {
      throw new Error('[KERNEL_UI] Cannot add event to non-kernel-controlled element');
    }

    const wrappedHandler = this.sandboxEventHandler(this.getCurrentPluginId(), handler);
    element.addEventListener(eventType, wrappedHandler);
    
    this.logMutation(this.getCurrentPluginId(), 'event_trigger', {
      element: element.tagName,
      eventType
    });
  }

  /**
   * Safe event removal (kernel-controlled)
   */
  safeRemoveEvent(element, eventType, handler) {
    if (!element || !element.hasAttribute('data-kernel-controlled')) {
      throw new Error('[KERNEL_UI] Cannot remove event from non-kernel-controlled element');
    }

    element.removeEventListener(eventType, handler);
    
    this.logMutation(this.getCurrentPluginId(), 'event_removal', {
      element: element.tagName,
      eventType
    });
  }

  /**
   * Sandbox event handler
   */
  sandboxEventHandler(pluginId, handler) {
    return (event) => {
      try {
        // Prevent default dangerous behaviors
        if (event.type === 'contextmenu') {
          event.preventDefault();
        }
        
        // Execute handler in controlled environment
        const result = handler(event);
        
        // Log event for reproducibility
        this.logMutation(pluginId, 'event_execution', {
          eventType: event.type,
          target: event.target.tagName,
          result: this.sanitizeResult(result)
        });
        
        return result;
        
      } catch (error) {
        console.error(`[KERNEL_UI] Event handler failed for plugin ${pluginId}:`, error);
        return null;
      }
    };
  }

  /**
   * Validate deterministic action
   */
  validateDeterministicAction(pluginId, action, args) {
    // Check for non-deterministic patterns
    const actionStr = JSON.stringify({ action, args });
    const forbiddenPatterns = ['random', 'time', 'date', 'Math.', 'Date.'];
    
    for (const pattern of forbiddenPatterns) {
      if (actionStr.toLowerCase().includes(pattern)) {
        throw new Error(`[KERNEL_UI] Non-deterministic pattern detected in plugin ${pluginId}: ${pattern}`);
      }
    }
  }

  /**
   * Validate deterministic result
   */
  validateDeterministicResult(pluginId, result) {
    // Ensure result doesn't contain non-deterministic values
    const resultStr = JSON.stringify(result);
    
    if (resultStr.includes('undefined') || resultStr.includes('function')) {
      console.warn(`[KERNEL_UI] Potentially non-deterministic result from plugin ${pluginId}`);
    }
  }

  /**
   * Validate element creation
   */
  validateElementCreation(tag, attributes) {
    const allowedTags = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'button', 'input'];
    
    if (!allowedTags.includes(tag.toLowerCase())) {
      throw new Error(`[KERNEL_UI] Element tag '${tag}' not allowed for deterministic UI`);
    }
  }

  /**
   * Check if attribute is valid
   */
  isValidAttribute(key, value) {
    const allowedKeys = ['id', 'class', 'style', 'textContent', 'disabled', 'readonly'];
    const dangerousValues = ['javascript:', 'data:', '<script'];
    
    if (!allowedKeys.includes(key)) return false;
    
    const valueStr = String(value).toLowerCase();
    return !dangerousValues.some(dangerous => valueStr.includes(dangerous));
  }

  /**
   * Check if update is valid
   */
  isValidUpdate(key, value) {
    return this.isValidAttribute(key, value);
  }

  /**
   * Log mutation for reproducibility
   */
  logMutation(pluginId, type, data) {
    const mutation = {
      pluginId,
      type,
      data,
      tick: this.kernel.getCurrentTick(),
      seed: this.deterministicSeed,
      timestamp: this.kernel.getCurrentTick()
    };
    
    this.mutationLog.push(mutation);
    
    // Update plugin mutation count
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.mutationCount++;
      plugin.lastMutation = mutation;
    }
    
    // Keep log size manageable
    if (this.mutationLog.length > 10000) {
      this.mutationLog = this.mutationLog.slice(-5000);
    }
  }

  /**
   * Log UI event
   */
  logUIEvent(pluginId, event) {
    this.logMutation(pluginId, 'ui_event', event);
  }

  /**
   * Get current plugin ID (from execution context)
   */
  getCurrentPluginId() {
    return this.currentPluginId || 'unknown-plugin';
  }

  /**
   * Set current plugin execution context
   */
  setCurrentPluginId(pluginId) {
    this.currentPluginId = pluginId;
  }

  /**
   * Clear current plugin execution context
   */
  clearCurrentPluginId() {
    this.currentPluginId = null;
  }

  /**
   * Sanitize arguments for logging
   */
  sanitizeArgs(args) {
    return args.map(arg => {
      if (typeof arg === 'function') return '[Function]';
      if (arg && typeof arg === 'object') return '[Object]';
      return arg;
    });
  }

  /**
   * Sanitize result for logging
   */
  sanitizeResult(result) {
    if (typeof result === 'function') return '[Function]';
    if (result && typeof result === 'object') return '[Object]';
    return result;
  }

  /**
   * Simple hash function for deterministic seeding
   */
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Set deterministic seed
   */
  setDeterministicSeed(seed) {
    this.deterministicSeed = seed;
    console.log(`[KERNEL_UI] Deterministic seed set: ${seed}`);
  }

  /**
   * Get mutation log
   */
  getMutationLog() {
    return [...this.mutationLog];
  }

  /**
   * Get plugin statistics
   */
  getPluginStats() {
    const stats = {};
    
    for (const [pluginId, plugin] of this.plugins) {
      stats[pluginId] = {
        mutationCount: plugin.mutationCount,
        registeredAt: plugin.registeredAt,
        lastMutation: plugin.lastMutation
      };
    }
    
    return stats;
  }

  /**
   * Unregister plugin
   */
  unregisterPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      // Cleanup plugin elements
      const elements = document.querySelectorAll(`[data-plugin-id="${pluginId}"]`);
      elements.forEach(el => el.remove());
      
      // Remove plugin
      this.plugins.delete(pluginId);
      
      console.log(`[KERNEL_UI] Plugin unregistered: ${pluginId}`);
    }
  }
}
