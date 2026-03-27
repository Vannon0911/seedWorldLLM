import { BaseUIController } from './BaseUIController.js';

/**
 * Main Menu Controller - Unified UI Mode Management
 * Harmonized with Kernel Gates Architecture
 */
export class MainMenuController extends BaseUIController {
  constructor(kernelInterface, options = {}) {
    super(options);
    this.kernelInterface = kernelInterface;
    this.modes = new Map();
    this.currentMode = null;
    this.modeHistory = [];
    this.kernelGates = {
      beforeModeSwitch: [],
      afterModeSwitch: [],
      onModeInit: [],
      onModeDestroy: []
    };
    
    this.initializeModes();
  }

  initializeModes() {
    // Register available modes
    this.modes.set('game', {
      name: 'Game Mode',
      icon: '🎮',
      description: 'Play the deterministic RTS game',
      controller: 'GameUIController',
      requires: ['gameLogic'],
      kernelGate: 'game.access'
    });

    this.modes.set('dev', {
      name: 'Development Mode', 
      icon: '🔧',
      description: 'Development tools and debugging',
      controller: 'DevUIController',
      requires: ['kernelInterface'],
      kernelGate: 'dev.access'
    });

    this.modes.set('patcher', {
      name: 'Patch Control',
      icon: '📦', 
      description: 'Open the terminal-authority patch control plane',
      controller: 'ExternalPatchControl',
      requires: [],
      kernelGate: 'patcher.access'
    });
  }

  createBaseStructure() {
    // Clear existing content
    this.elementRoot.innerHTML = '';
    
    // Create main menu layout
    const layout = this.createElement('div', { className: 'main-menu-layout' });
    
    // Header
    const header = this.createMenuHeader();
    
    // Mode selection grid
    const modeGrid = this.createModeGrid();
    
    // Status panel
    const statusPanel = this.createStatusPanel();
    
    layout.appendChild(header);
    layout.appendChild(modeGrid);
    layout.appendChild(statusPanel);
    
    this.elementRoot.appendChild(layout);
    
    // Store element references
    this.elements = {
      layout,
      header,
      modeGrid,
      statusPanel,
      modeTitle: this.getElement('.menu-title'),
      modeSubtitle: this.getElement('.menu-subtitle'),
      connectionStatus: this.getElement('.connection-status'),
      kernelStatus: this.getElement('.kernel-status')
    };
  }

  createMenuHeader() {
    const header = this.createElement('header', { className: 'menu-header' });
    
    header.innerHTML = `
      <div class="menu-brand">
        <h1 class="menu-title">🌱 SeedWorld</h1>
        <p class="menu-subtitle">Deterministic Kernel Interface</p>
      </div>
      <div class="menu-info">
        <div class="connection-status">
          <span class="status-dot offline"></span>
          <span class="status-text">Connecting...</span>
        </div>
        <div class="kernel-status">
          <span class="kernel-text">Kernel: <span id="kernelState">Initializing</span></span>
        </div>
      </div>
    `;
    
    return header;
  }

  createModeGrid() {
    const modeGrid = this.createElement('div', { className: 'mode-grid' });
    
    // Create mode cards
    for (const [modeId, modeConfig] of this.modes) {
      const modeCard = this.createModeCard(modeId, modeConfig);
      modeGrid.appendChild(modeCard);
    }
    
    return modeGrid;
  }

  createModeCard(modeId, modeConfig) {
    const card = this.createElement('div', { 
      className: 'mode-card',
      'data-mode': modeId
    });
    
    // Check kernel gate access
    const hasAccess = this.checkKernelGate(modeConfig.kernelGate);
    
    card.innerHTML = `
      <div class="mode-card-header">
        <span class="mode-icon">${modeConfig.icon}</span>
        <h3 class="mode-name">${modeConfig.name}</h3>
      </div>
      <p class="mode-description">${modeConfig.description}</p>
      <div class="mode-card-footer">
        <button class="mode-launch-btn ${hasAccess ? 'enabled' : 'disabled'}" 
                data-mode="${modeId}"
                ${!hasAccess ? 'disabled' : ''}>
          ${hasAccess ? 'Launch' : 'Locked'}
        </button>
      </div>
    `;
    
    // Add click handler for enabled modes
    if (hasAccess) {
      const launchBtn = card.querySelector('.mode-launch-btn');
      this.addEventListener(launchBtn, 'click', () => this.switchToMode(modeId));
    }
    
    return card;
  }

  createStatusPanel() {
    const panel = this.createElement('div', { className: 'status-panel' });
    
    panel.innerHTML = `
      <div class="status-section">
        <h4>System Status</h4>
        <div class="status-items">
          <div class="status-item">
            <span class="status-label">WebSocket:</span>
            <span class="status-value" id="wsStatus">Disconnected</span>
          </div>
          <div class="status-item">
            <span class="status-label">Kernel:</span>
            <span class="status-value" id="kernelStatus">Offline</span>
          </div>
          <div class="status-item">
            <span class="status-label">Active Gates:</span>
            <span class="status-value" id="gatesStatus">0</span>
          </div>
        </div>
      </div>
      <div class="status-section">
        <h4>Recent Activity</h4>
        <div class="activity-log" id="activityLog">
          <div class="activity-item">System initialized</div>
        </div>
      </div>
    `;
    
    return panel;
  }

  async switchToMode(modeId) {
    const modeConfig = this.modes.get(modeId);
    if (!modeConfig) {
      console.error(`[MAIN_MENU] Unknown mode: ${modeId}`);
      return;
    }

    // Check kernel gate access
    if (!this.checkKernelGate(modeConfig.kernelGate)) {
      this.showAccessDenied(modeConfig.kernelGate);
      return;
    }

    try {
      if (modeConfig.controller === 'ExternalPatchControl') {
        window.location.href = '/patch';
        return;
      }

      // Execute before mode switch hooks
      await this.executeKernelGate('beforeModeSwitch', {
        from: this.currentMode,
        to: modeId,
        modeConfig
      });

      // Destroy current mode controller if exists
      if (this.currentMode && this.currentController) {
        await this.currentController.destroy();
        this.currentController = null;
      }

      // Update mode history
      if (this.currentMode) {
        this.modeHistory.push(this.currentMode);
      }

      // Load and initialize new mode controller
      const ControllerClass = await this.loadModeController(modeConfig.controller);
      this.currentController = new ControllerClass(...this.getControllerArgs(modeConfig.requires));
      
      // Clear main menu and initialize mode
      this.elementRoot.innerHTML = '';
      await this.currentController.initialize(this.elementRoot);

      // Update current mode
      this.currentMode = modeId;

      // Execute after mode switch hooks
      await this.executeKernelGate('afterModeSwitch', {
        from: this.modeHistory[this.modeHistory.length - 1],
        to: modeId,
        controller: this.currentController
      });

      // Add mode switcher button
      this.addModeSwitcher();

      this.logActivity(`Switched to ${modeConfig.name}`);

    } catch (error) {
      console.error(`[MAIN_MENU] Failed to switch to mode ${modeId}:`, error);
      this.showError(`Failed to launch ${modeConfig.name}: ${error.message}`);
    }
  }

  async loadModeController(controllerName) {
    const controllerMap = {
      'GameUIController': () => import('./GameUIController.js').then(m => m.GameUIController),
      'DevUIController': () => import('./DevUIController.js').then(m => m.DevUIController)
    };

    const controllerLoader = controllerMap[controllerName];
    if (!controllerLoader) {
      throw new Error(`Unknown controller: ${controllerName}`);
    }

    return await controllerLoader();
  }

  getControllerArgs(requires) {
    const args = [];
    
    if (requires.includes('gameLogic')) {
      args.push(window.appState?.gameController);
    }
    
    if (requires.includes('kernelInterface')) {
      args.push({ kernelInterface: this.kernelInterface });
    }
    
    return args;
  }

  checkKernelGate(gateName) {
    if (!this.kernelInterface) {
      console.warn(`[MAIN_MENU] No kernel interface to check gate: ${gateName}`);
      return true; // Allow access if no kernel interface
    }

    try {
      // Use the kernel gates system instead of direct interface
      if (window.appState?.kernelGates) {
        const gateStatus = window.appState.kernelGates.getGateStatus(gateName);
        return gateStatus && gateStatus.enabled;
      }
      
      // Fallback to direct interface call
      return this.kernelInterface(`gate.check.${gateName}`);
    } catch (error) {
      console.error(`[MAIN_MENU] Gate check failed for ${gateName}:`, error);
      return false;
    }
  }

  async executeKernelGate(gateName, data) {
    if (!this.kernelInterface) {
      console.warn(`[MAIN_MENU] No kernel interface for gate: ${gateName}`);
      return;
    }

    try {
      // Use the kernel gates system instead of direct interface
      if (window.appState?.kernelGates) {
        return await window.appState.kernelGates.executeGate(gateName, data);
      }
      
      // Fallback to direct interface call
      return this.kernelInterface(`gate.execute.${gateName}`, data);
    } catch (error) {
      console.error(`[MAIN_MENU] Gate execution failed for ${gateName}:`, error);
    }
  }

  addModeSwitcher() {
    const switcher = this.createElement('div', { className: 'mode-switcher' });
    switcher.innerHTML = `
      <button class="back-to-menu-btn" title="Back to Main Menu">
        <span class="switcher-icon">🏠</span>
        <span class="switcher-text">Main Menu</span>
      </button>
    `;

    const backBtn = switcher.querySelector('.back-to-menu-btn');
    this.addEventListener(backBtn, 'click', () => this.returnToMainMenu());

    this.elementRoot.appendChild(switcher);
  }

  async returnToMainMenu() {
    // Destroy current controller
    if (this.currentController) {
      await this.currentController.destroy();
      this.currentController = null;
    }

    // Reset current mode
    this.currentMode = null;

    // Recreate main menu
    this.createBaseStructure();
    this.updateConnectionStatus();
    this.logActivity('Returned to main menu');
  }

  updateConnectionStatus() {
    const wsStatus = this.getElement('#wsStatus');
    const kernelStatus = this.getElement('#kernelStatus');
    const gatesStatus = this.getElement('#gatesStatus');
    
    if (wsStatus) {
      wsStatus.textContent = window.appState?.wsConnection ? 'Connected' : 'Disconnected';
    }
    
    if (kernelStatus) {
      kernelStatus.textContent = this.kernelInterface ? 'Online' : 'Offline';
    }
    
    if (gatesStatus) {
      const activeGates = Object.keys(this.kernelGates).filter(key => 
        this.kernelGates[key].length > 0
      ).length;
      gatesStatus.textContent = activeGates.toString();
    }
  }

  showAccessDenied(gateName) {
    this.showError(`Access denied: ${gateName} gate not authorized`);
  }

  showError(message) {
    this.logActivity(`Error: ${message}`, 'error');
    
    // Create error toast
    const toast = this.createElement('div', { className: 'toast error' });
    toast.textContent = message;
    this.elementRoot.appendChild(toast);
    
    setTimeout(() => toast.remove(), 5000);
  }

  logActivity(message, type = 'info') {
    const activityLog = this.getElement('#activityLog');
    if (!activityLog) return;

    const activityItem = this.createElement('div', { 
      className: `activity-item ${type}` 
    });
    
    const timestamp = new Date().toLocaleTimeString();
    activityItem.innerHTML = `
      <span class="activity-time">[${timestamp}]</span>
      <span class="activity-text">${message}</span>
    `;
    
    activityLog.insertBefore(activityItem, activityLog.firstChild);
    
    // Keep only last 10 activities
    const items = activityLog.querySelectorAll('.activity-item');
    if (items.length > 10) {
      items[items.length - 1].remove();
    }
  }

  // Kernel gate registration
  registerKernelGate(gateName, handler) {
    if (!this.kernelGates[gateName]) {
      this.kernelGates[gateName] = [];
    }
    this.kernelGates[gateName].push(handler);
  }

  // Public methods
  getCurrentMode() {
    return this.currentMode;
  }

  getCurrentController() {
    return this.currentController;
  }

  getAvailableModes() {
    return Array.from(this.modes.entries()).map(([id, config]) => ({
      id,
      ...config,
      accessible: this.checkKernelGate(config.kernelGate)
    }));
  }
}
