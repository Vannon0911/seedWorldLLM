import { BaseUIController } from './BaseUIController.js';

/**
 * Development UI Controller
 * Development tools, debugging, and kernel inspection
 */
export class DevUIController extends BaseUIController {
  constructor(options = {}) {
    super(options);
    this.kernelInterface = options.kernelInterface || null;
    this.debugLogs = [];
    this.kernelState = null;
    this.inspectionResults = new Map();
  }

  createBaseStructure() {
    // Create dev layout
    const layout = this.createElement('div', { className: 'dev-layout' });
    
    // Header
    const header = this.createDevHeader();
    
    // Main content area with tabs
    const mainContent = this.createElement('div', { className: 'dev-main' });
    const tabContainer = this.createTabContainer();
    const contentArea = this.createElement('div', { className: 'dev-content', id: 'devContent' });
    
    // Sidebar with tools
    const sidebar = this.createDevSidebar();
    
    mainContent.appendChild(tabContainer);
    mainContent.appendChild(contentArea);
    
    layout.appendChild(header);
    layout.appendChild(mainContent);
    layout.appendChild(sidebar);
    
    this.elementRoot.appendChild(layout);
    
    // Store element references
    this.elements = {
      layout,
      header,
      mainContent,
      tabContainer,
      contentArea,
      sidebar,
      activeTab: null
    };
    
    // Initialize with kernel inspection tab
    this.switchToTab('kernel-inspection');
  }

  createDevHeader() {
    const header = this.createElement('header', { className: 'dev-header' });
    
    header.innerHTML = `
      <div class="dev-brand">
        <h1>🔧 Development Mode</h1>
        <p>Kernel Inspection & Debug Tools</p>
      </div>
      <div class="dev-actions">
        <button class="dev-btn" id="refreshKernel">🔄 Refresh Kernel</button>
        <button class="dev-btn" id="exportState">📤 Export State</button>
        <button class="dev-btn danger" id="resetKernel">⚠️ Reset Kernel</button>
      </div>
    `;
    
    // Setup event listeners
    this.setupDevHeaderEvents();
    
    return header;
  }

  createTabContainer() {
    const tabContainer = this.createElement('div', { className: 'dev-tabs' });
    
    const tabs = [
      { id: 'kernel-inspection', name: 'Kernel Inspection', icon: '🔍' },
      { id: 'debug-console', name: 'Debug Console', icon: '💻' },
      { id: 'patch-debug', name: 'Patch Debug', icon: '🐛' },
      { id: 'performance', name: 'Performance', icon: '⚡' },
      { id: 'network', name: 'Network', icon: '🌐' }
    ];
    
    for (const tab of tabs) {
      const tabButton = this.createElement('button', {
        className: 'dev-tab',
        'data-tab': tab.id
      });
      
      tabButton.innerHTML = `
        <span class="tab-icon">${tab.icon}</span>
        <span class="tab-name">${tab.name}</span>
      `;
      
      this.addEventListener(tabButton, 'click', () => this.switchToTab(tab.id));
      tabContainer.appendChild(tabButton);
    }
    
    return tabContainer;
  }

  createDevSidebar() {
    const sidebar = this.createElement('aside', { className: 'dev-sidebar' });
    
    sidebar.innerHTML = `
      <div class="sidebar-section">
        <h3>Quick Actions</h3>
        <div class="quick-actions">
          <button class="quick-action" data-action="inspect-tick">Inspect Tick</button>
          <button class="quick-action" data-action="dump-state">Dump State</button>
          <button class="quick-action" data-action="test-patch">Test Patch</button>
          <button class="quick-action" data-action="benchmark">Benchmark</button>
        </div>
      </div>
      
      <div class="sidebar-section">
        <h3>Kernel Status</h3>
        <div class="kernel-status-panel">
          <div class="status-item">
            <span class="status-label">State:</span>
            <span class="status-value" id="kernelStateValue">Unknown</span>
          </div>
          <div class="status-item">
            <span class="status-label">Tick:</span>
            <span class="status-value" id="kernelTickValue">0</span>
          </div>
          <div class="status-item">
            <span class="status-label">Patches:</span>
            <span class="status-value" id="kernelPatchesValue">0</span>
          </div>
          <div class="status-item">
            <span class="status-label">Gates:</span>
            <span class="status-value" id="kernelGatesValue">0</span>
          </div>
        </div>
      </div>
      
      <div class="sidebar-section">
        <h3>Debug Options</h3>
        <div class="debug-options">
          <label class="debug-option">
            <input type="checkbox" id="verboseLogging">
            <span>Verbose Logging</span>
          </label>
          <label class="debug-option">
            <input type="checkbox" id="pauseOnErrors">
            <span>Pause on Errors</span>
          </label>
          <label class="debug-option">
            <input type="checkbox" id="showKernelTrace">
            <span>Show Kernel Trace</span>
          </label>
        </div>
      </div>
    `;
    
    // Setup quick action handlers
    this.setupQuickActions();
    
    return sidebar;
  }

  switchToTab(tabId) {
    // Update active tab styling
    const tabs = this.elements.tabContainer.querySelectorAll('.dev-tab');
    tabs.forEach(tab => {
      if (tab.dataset.tab === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    // Clear and populate content area
    const contentArea = this.elements.contentArea;
    contentArea.innerHTML = '';
    
    this.elements.activeTab = tabId;
    
    switch (tabId) {
      case 'kernel-inspection':
        contentArea.appendChild(this.createKernelInspectionContent());
        break;
      case 'debug-console':
        contentArea.appendChild(this.createDebugConsoleContent());
        break;
      case 'patch-debug':
        contentArea.appendChild(this.createPatchDebugContent());
        break;
      case 'performance':
        contentArea.appendChild(this.createPerformanceContent());
        break;
      case 'network':
        contentArea.appendChild(this.createNetworkContent());
        break;
    }
  }

  createKernelInspectionContent() {
    const content = this.createElement('div', { className: 'tab-content' });
    
    content.innerHTML = `
      <div class="inspection-header">
        <h2>Kernel State Inspection</h2>
        <div class="inspection-controls">
          <button class="inspect-btn" data-action="refresh">🔄 Refresh</button>
          <button class="inspect-btn" data-action="deep-inspect">🔍 Deep Inspect</button>
          <button class="inspect-btn" data-action="export">📤 Export</button>
        </div>
      </div>
      
      <div class="inspection-grid">
        <div class="inspection-panel">
          <h3>Current State</h3>
          <div class="state-display" id="currentStateDisplay">
            <div class="loading">Loading kernel state...</div>
          </div>
        </div>
        
        <div class="inspection-panel">
          <h3>Active Patches</h3>
          <div class="patches-display" id="activePatchesDisplay">
            <div class="loading">Loading patches...</div>
          </div>
        </div>
        
        <div class="inspection-panel">
          <h3>Gate Status</h3>
          <div class="gates-display" id="gatesDisplay">
            <div class="loading">Loading gates...</div>
          </div>
        </div>
        
        <div class="inspection-panel">
          <h3>Event Log</h3>
          <div class="events-display" id="eventsDisplay">
            <div class="loading">Loading events...</div>
          </div>
        </div>
      </div>
    `;
    
    // Load kernel data
    this.loadKernelInspectionData();
    
    // Setup inspection controls
    this.setupInspectionControls(content);
    
    return content;
  }

  createDebugConsoleContent() {
    const content = this.createElement('div', { className: 'tab-content' });
    
    content.innerHTML = `
      <div class="console-header">
        <h2>Debug Console</h2>
        <div class="console-controls">
          <button class="console-btn" id="clearConsole">Clear</button>
          <button class="console-btn" id="exportLogs">Export</button>
          <select id="logLevelFilter">
            <option value="all">All Levels</option>
            <option value="error">Errors Only</option>
            <option value="warn">Warnings & Errors</option>
            <option value="info">Info & Above</option>
          </select>
        </div>
      </div>
      
      <div class="console-input-area">
        <div class="input-prompt">🔧></div>
        <input type="text" id="consoleInput" placeholder="Enter debug command..." />
        <button id="executeCommand">Execute</button>
      </div>
      
      <div class="console-output" id="consoleOutput">
        <div class="console-line welcome">
          <span class="timestamp">[${new Date().toLocaleTimeString()}]</span>
          <span class="message">SeedWorld Debug Console Ready</span>
        </div>
      </div>
    `;
    
    this.setupDebugConsole(content);
    
    return content;
  }

  createPatchDebugContent() {
    const content = this.createElement('div', { className: 'tab-content' });
    
    content.innerHTML = `
      <div class="patch-debug-header">
        <h2>Patch Control Plane</h2>
        <div class="patch-debug-controls">
          <button class="patch-btn" id="openPatchControl">Open Patch Control</button>
          <button class="patch-btn" id="openPatchPopup">Open Popup</button>
        </div>
      </div>
      
      <div class="patch-debug-grid">
        <div class="patch-editor-panel">
          <h3>Authority Model</h3>
          <div class="patch-editor">
            <textarea id="patchCodeEditor" readonly>Browser UI is now read/write blind for patch gates.

Write authority lives in:
- npm run patch:apply -- --input <zip|json>

Browser may only:
- start orchestrated sessions
- watch status/logs/result
- request cancel

No direct validate/apply/execute endpoints remain.</textarea>
          </div>
        </div>
        
        <div class="patch-test-panel">
          <h3>Session Notes</h3>
          <div class="test-results" id="patchTestResults">
            <div class="no-results">Use the patch control plane to upload a ZIP or JSON manifest and monitor the run.</div>
          </div>
        </div>
      </div>
    `;
    
    this.setupPatchDebug(content);
    
    return content;
  }

  createPerformanceContent() {
    const content = this.createElement('div', { className: 'tab-content' });
    
    content.innerHTML = `
      <div class="perf-header">
        <h2>Performance Monitoring</h2>
        <div class="perf-controls">
          <button class="perf-btn" id="startProfiling">Start Profile</button>
          <button class="perf-btn" id="stopProfiling">Stop Profile</button>
          <button class="perf-btn" id="clearMetrics">Clear</button>
        </div>
      </div>
      
      <div class="perf-metrics">
        <div class="metric-card">
          <h3>Tick Performance</h3>
          <div class="metric-chart" id="tickChart">
            <canvas id="tickPerformanceCanvas"></canvas>
          </div>
        </div>
        
        <div class="metric-card">
          <h3>Memory Usage</h3>
          <div class="metric-chart" id="memoryChart">
            <canvas id="memoryUsageCanvas"></canvas>
          </div>
        </div>
        
        <div class="metric-card">
          <h3>Patch Execution Time</h3>
          <div class="patch-times" id="patchTimes">
            <div class="no-data">No patch data available</div>
          </div>
        </div>
      </div>
    `;
    
    this.setupPerformanceMonitoring(content);
    
    return content;
  }

  createNetworkContent() {
    const content = this.createElement('div', { className: 'tab-content' });
    
    content.innerHTML = `
      <div class="network-header">
        <h2>Network & WebSocket Monitor</h2>
        <div class="network-controls">
          <button class="network-btn" id="captureTraffic">Capture Traffic</button>
          <button class="network-btn" id="clearTraffic">Clear</button>
          <button class="network-btn" id="exportTraffic">Export</button>
        </div>
      </div>
      
      <div class="network-status">
        <div class="status-item">
          <span>WebSocket:</span>
          <span id="wsConnectionStatus">Disconnected</span>
        </div>
        <div class="status-item">
          <span>Messages Sent:</span>
          <span id="messagesSent">0</span>
        </div>
        <div class="status-item">
          <span>Messages Received:</span>
          <span id="messagesReceived">0</span>
        </div>
      </div>
      
      <div class="network-traffic" id="networkTraffic">
        <div class="traffic-header">
          <h3>Message Log</h3>
        </div>
        <div class="traffic-list" id="trafficList">
          <div class="no-traffic">No network activity</div>
        </div>
      </div>
    `;
    
    this.setupNetworkMonitoring(content);
    
    return content;
  }

  setupDevHeaderEvents() {
    const refreshBtn = this.getElement('#refreshKernel');
    const exportBtn = this.getElement('#exportState');
    const resetBtn = this.getElement('#resetKernel');
    
    if (refreshBtn) {
      this.addEventListener(refreshBtn, 'click', () => this.refreshKernel());
    }
    
    if (exportBtn) {
      this.addEventListener(exportBtn, 'click', () => this.exportKernelState());
    }
    
    if (resetBtn) {
      this.addEventListener(resetBtn, 'click', () => this.resetKernel());
    }
  }

  setupQuickActions() {
    const quickActions = this.elementRoot.querySelectorAll('.quick-action');
    
    quickActions.forEach(action => {
      this.addEventListener(action, 'click', () => {
        const actionType = action.dataset.action;
        this.executeQuickAction(actionType);
      });
    });
  }

  executeQuickAction(actionType) {
    switch (actionType) {
      case 'inspect-tick':
        this.inspectCurrentTick();
        break;
      case 'dump-state':
        this.dumpKernelState();
        break;
      case 'test-patch':
        this.openPatchTest();
        break;
      case 'benchmark':
        this.runBenchmark();
        break;
    }
  }

  async loadKernelInspectionData() {
    if (!this.kernelInterface) {
      this.showError('Kernel interface not available');
      return;
    }

    try {
      // Load current state
      const state = this.kernelInterface('state.get');
      this.updateStateDisplay(state);
      
      // Load active patches
      const patches = this.kernelInterface('patch.list');
      this.updatePatchesDisplay(patches);
      
      // Load gate status
      const gates = this.kernelInterface('gate.status');
      this.updateGatesDisplay(gates);
      
      // Load event log
      const events = this.kernelInterface('event.recent');
      this.updateEventsDisplay(events);
      
    } catch (error) {
      this.showError(`Failed to load kernel data: ${error.message}`);
    }
  }

  updateStateDisplay(state) {
    const display = this.getElement('#currentStateDisplay');
    if (!display) return;

    display.innerHTML = `
      <div class="state-tree">
        ${this.renderStateTree(state)}
      </div>
    `;
  }

  renderStateTree(state, depth = 0) {
    if (typeof state !== 'object' || state === null) {
      return `<div class="state-value" style="margin-left: ${depth * 20}px">${JSON.stringify(state)}</div>`;
    }

    let html = '';
    for (const [key, value] of Object.entries(state)) {
      html += `
        <div class="state-item" style="margin-left: ${depth * 20}px">
          <span class="state-key">${key}:</span>
          ${typeof value === 'object' ? 
            `<div class="state-children">${this.renderStateTree(value, depth + 1)}</div>` :
            `<span class="state-value">${JSON.stringify(value)}</span>`
          }
        </div>
      `;
    }
    
    return html;
  }

  updatePatchesDisplay(patches) {
    const display = this.getElement('#activePatchesDisplay');
    if (!display) return;

    if (!patches || patches.length === 0) {
      display.innerHTML = '<div class="no-data">No active patches</div>';
      return;
    }

    display.innerHTML = patches.map(patch => `
      <div class="patch-item">
        <div class="patch-header">
          <span class="patch-id">${patch.id}</span>
          <span class="patch-version">v${patch.version}</span>
        </div>
        <div class="patch-description">${patch.description || 'No description'}</div>
        <div class="patch-status ${patch.active ? 'active' : 'inactive'}">
          ${patch.active ? 'Active' : 'Inactive'}
        </div>
      </div>
    `).join('');
  }

  updateGatesDisplay(gates) {
    const display = this.getElement('#gatesDisplay');
    if (!display) return;

    if (!gates || Object.keys(gates).length === 0) {
      display.innerHTML = '<div class="no-data">No gates configured</div>';
      return;
    }

    display.innerHTML = Object.entries(gates).map(([gateName, gateInfo]) => `
      <div class="gate-item">
        <div class="gate-name">${gateName}</div>
        <div class="gate-status ${gateInfo.active ? 'active' : 'inactive'}">
          ${gateInfo.active ? 'Active' : 'Inactive'}
        </div>
        <div class="gate-info">
          <span>Priority: ${gateInfo.priority || 100}</span>
          <span>Hooks: ${gateInfo.hooks?.length || 0}</span>
        </div>
      </div>
    `).join('');
  }

  updateEventsDisplay(events) {
    const display = this.getElement('#eventsDisplay');
    if (!display) return;

    if (!events || events.length === 0) {
      display.innerHTML = '<div class="no-data">No recent events</div>';
      return;
    }

    display.innerHTML = events.slice(0, 50).map(event => `
      <div class="event-item">
        <span class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</span>
        <span class="event-type">${event.type}</span>
        <span class="event-data">${JSON.stringify(event.data)}</span>
      </div>
    `).join('');
  }

  setupDebugConsole(content) {
    const consoleInput = content.querySelector('#consoleInput');
    const executeBtn = content.querySelector('#executeCommand');
    const clearBtn = content.querySelector('#clearConsole');
    
    const executeCommand = () => {
      const command = consoleInput.value.trim();
      if (!command) return;
      
      this.executeDebugCommand(command);
      consoleInput.value = '';
    };
    
    this.addEventListener(executeBtn, 'click', executeCommand);
    this.addEventListener(consoleInput, 'keypress', (e) => {
      if (e.key === 'Enter') executeCommand();
    });
    
    this.addEventListener(clearBtn, 'click', () => {
      const output = content.querySelector('#consoleOutput');
      output.innerHTML = '<div class="console-line">Console cleared</div>';
    });
  }

  async executeDebugCommand(command) {
    const output = this.getElement('#consoleOutput');
    if (!output) return;
    
    // Add command to output
    this.addConsoleMessage(`> ${command}`, 'command');
    
    try {
      let result;
      
      // Execute command through kernel interface
      if (command.startsWith('kernel.')) {
        result = this.kernelInterface(command.substring(7));
      } else if (command.startsWith('patch.')) {
        result = this.kernelInterface(command);
      } else {
        // Evaluate as JavaScript (with safety checks)
        result = this.evaluateSafeExpression(command);
      }
      
      this.addConsoleMessage(JSON.stringify(result, null, 2), 'result');
      
    } catch (error) {
      this.addConsoleMessage(`Error: ${error.message}`, 'error');
    }
  }

  addConsoleMessage(message, type = 'info') {
    const output = this.getElement('#consoleOutput');
    if (!output) return;
    
    const messageLine = this.createElement('div', { className: `console-line ${type}` });
    messageLine.innerHTML = `
      <span class="timestamp">[${new Date().toLocaleTimeString()}]</span>
      <span class="message">${message}</span>
    `;
    
    output.appendChild(messageLine);
    output.scrollTop = output.scrollHeight;
  }

  evaluateSafeExpression(expression) {
    // Simple safety check - only allow specific commands
    const allowedCommands = ['help', 'status', 'version', 'list.patches', 'list.gates'];
    
    if (allowedCommands.includes(expression.toLowerCase())) {
      return `Command executed: ${expression}`;
    }
    
    throw new Error('Command not allowed in debug console');
  }

  showError(message) {
    console.error('[DEV_UI] Error:', message);
    // Could add toast notification here
  }

  // Additional methods for other tabs...
  setupPatchDebug(content) {
    const openPatchControl = content.querySelector('#openPatchControl');
    const openPatchPopup = content.querySelector('#openPatchPopup');

    if (openPatchControl) {
      this.addEventListener(openPatchControl, 'click', () => {
        window.location.href = '/patch';
      });
    }

    if (openPatchPopup) {
      this.addEventListener(openPatchPopup, 'click', () => {
        window.open('/popup', 'seedworld-patch-popup', 'width=520,height=720');
      });
    }
  }

  setupPerformanceMonitoring(content) {
    // Implementation for performance monitoring
  }

  setupNetworkMonitoring(content) {
    // Implementation for network monitoring
  }

  setupInspectionControls(content) {
    // Implementation for inspection controls
  }

  refreshKernel() {
    this.loadKernelInspectionData();
  }

  exportKernelState() {
    const state = this.kernelInterface('state.get');
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `kernel-state-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  resetKernel() {
    if (confirm('Are you sure you want to reset the kernel? This will lose all current state.')) {
      this.kernelInterface('kernel.reset');
      this.refreshKernel();
    }
  }
}
