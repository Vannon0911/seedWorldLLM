/**
 * Base UI Controller with Plugin Architecture
 * All UI components must extend this base class
 */
export class BaseUIController {
  constructor(options = {}) {
    this.plugins = new Map();
    this.hooks = {
      beforeRender: [],
      afterRender: [],
      onStateChange: [],
      onEvent: [],
      onDestroy: []
    };
    this.state = {};
    this.elements = {};
    this.isActive = false;
    this.rootNode = null;
    this.boundListeners = [];
  }

  /**
   * Register a UI plugin
   */
  registerPlugin(pluginId, plugin) {
    if (!plugin.id || !plugin.init || typeof plugin.init !== 'function') {
      throw new Error(`[UI_CONTROLLER] Invalid plugin: ${pluginId}`);
    }

    this.plugins.set(pluginId, plugin);
    
    // Register plugin hooks
    if (plugin.hooks) {
      for (const [hookName, hookHandler] of Object.entries(plugin.hooks)) {
        if (this.hooks[hookName]) {
          this.hooks[hookName].push({
            pluginId,
            handler: hookHandler,
            priority: plugin.priority || 100
          });
        }
      }
    }

    // Initialize plugin
    plugin.init(this);
    console.log(`[UI_CONTROLLER] Plugin registered: ${pluginId}`);
  }

  /**
   * Unregister a UI plugin
   */
  unregisterPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    // Remove hooks
    for (const hookName of Object.keys(this.hooks)) {
      this.hooks[hookName] = this.hooks[hookName].filter(
        hook => hook.pluginId !== pluginId
      );
    }

    // Cleanup plugin
    if (plugin.destroy && typeof plugin.destroy === 'function') {
      plugin.destroy();
    }

    this.plugins.delete(pluginId);
    console.log(`[UI_CONTROLLER] Plugin unregistered: ${pluginId}`);
  }

  /**
   * Execute hooks with priority
   */
  async executeHooks(hookName, ...args) {
    const hooks = this.hooks[hookName] || [];
    const sortedHooks = hooks.sort((a, b) => a.priority - b.priority);
    
    for (const hook of sortedHooks) {
      try {
        await hook.handler(...args);
      } catch (error) {
        console.error(`[UI_CONTROLLER] Hook ${hookName} failed for plugin ${hook.pluginId}:`, error);
      }
    }
  }

  /**
   * Initialize the UI controller
   */
  async initialize(elementRoot = document.body) {
    this.elementRoot = elementRoot;
    this.isActive = true;
    
    // Execute before render hooks
    await this.executeHooks('beforeRender', this);
    
    // Create base UI structure
    this.createBaseStructure();

    // Fallback ownership if subclass did not set rootNode explicitly
    if (!this.rootNode && this.elementRoot && this.elementRoot.firstElementChild) {
      this.rootNode = this.elementRoot.firstElementChild;
    }
    
    // Execute after render hooks
    await this.executeHooks('afterRender', this);
    
    console.log(`[UI_CONTROLLER] Initialized: ${this.constructor.name}`);
  }

  /**
   * Destroy the UI controller
   */
  async destroy() {
    this.isActive = false;
    
    // Execute destroy hooks
    await this.executeHooks('onDestroy', this);
    
    // Cleanup all plugins
    for (const [pluginId] of this.plugins) {
      this.unregisterPlugin(pluginId);
    }

    // Remove event listeners registered through addEventListener
    for (const { element, eventType, wrappedHandler } of this.boundListeners) {
      try {
        element.removeEventListener(eventType, wrappedHandler);
      } catch (error) {
        console.warn('[UI_CONTROLLER] Failed to remove event listener:', error);
      }
    }
    this.boundListeners = [];

    // Remove owned DOM root from container
    if (this.rootNode && this.rootNode.parentNode) {
      this.rootNode.parentNode.removeChild(this.rootNode);
    }
    this.rootNode = null;
    this.elements = {};
    
    console.log(`[UI_CONTROLLER] Destroyed: ${this.constructor.name}`);
  }

  /**
   * Update UI state
   */
  async updateState(newState) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...newState };
    
    // Execute state change hooks
    await this.executeHooks('onStateChange', this.state, oldState);
    
    // Re-render if needed
    if (this.isActive) {
      this.render();
    }
  }

  /**
   * Handle UI events
   */
  async handleEvent(eventType, eventData) {
    // Execute event hooks
    await this.executeHooks('onEvent', eventType, eventData, this);
  }

  /**
   * Create base UI structure (to be overridden)
   */
  createBaseStructure() {
    // Override in subclasses
  }

  /**
   * Render UI (to be overridden)
   */
  render() {
    // Override in subclasses
  }

  /**
   * Get element by ID or selector
   */
  getElement(selector) {
    return this.elementRoot.querySelector(selector);
  }

  /**
   * Create element with attributes
   */
  createElement(tag, attributes = {}, textContent = '') {
    const element = document.createElement(tag);
    
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else {
        element.setAttribute(key, value);
      }
    }
    
    if (textContent) {
      element.textContent = textContent;
    }
    
    return element;
  }

  /**
   * Add event listener with plugin support
   */
  addEventListener(element, eventType, handler) {
    if (!element) {
      return null;
    }

    const wrappedHandler = async (event) => {
      await this.handleEvent(eventType, event);
      if (handler) handler(event);
    };
    
    element.addEventListener(eventType, wrappedHandler);
    this.boundListeners.push({ element, eventType, wrappedHandler });
    return wrappedHandler;
  }

  /**
   * Get all registered plugins
   */
  getPlugins() {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId) {
    return this.plugins.get(pluginId);
  }
}
