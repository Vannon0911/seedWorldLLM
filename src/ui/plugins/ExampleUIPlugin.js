/**
 * Example UI Plugin for GameUIController
 * Demonstrates plugin architecture for UI extensions
 */
export class ExampleUIPlugin {
  constructor() {
    this.id = 'example-ui-plugin';
    this.name = 'Example UI Plugin';
    this.version = '1.0.0';
    this.priority = 100;
    this.controller = null;
    this.elements = new Map();
  }

  /**
   * Initialize plugin with UI controller
   */
  init(controller) {
    this.controller = controller;
    console.log(`[PLUGIN] ${this.name} initialized`);
    
    // Add custom UI elements
    this.addCustomHUD();
    this.setupEventHandlers();
  }

  /**
   * Plugin hooks for UI controller integration
   */
  get hooks() {
    return {
      beforeRender: this.beforeRender.bind(this),
      afterRender: this.afterRender.bind(this),
      onEvent: this.onEvent.bind(this),
      beforeTick: this.beforeTick.bind(this),
      afterTick: this.afterTick.bind(this),
      onTileSelect: this.onTileSelect.bind(this),
      beforeBuild: this.beforeBuild.bind(this),
      afterBuild: this.afterBuild.bind(this),
      onDestroy: this.onDestroy.bind(this)
    };
  }

  /**
   * Before render hook
   */
  async beforeRender(controller) {
    console.log('[PLUGIN] Before render hook');
    // Modify UI before rendering
  }

  /**
   * After render hook
   */
  async afterRender(controller) {
    console.log('[PLUGIN] After render hook');
    // Add post-render modifications
    this.addAnimations();
  }

  /**
   * Event handler hook
   */
  async onEvent(eventType, eventData, controller) {
    console.log(`[PLUGIN] Event: ${eventType}`, eventData);
    
    switch (eventType) {
      case 'tick':
        this.onTick(eventData);
        break;
      case 'tileSelected':
        this.onTileSelected(eventData);
        break;
      case 'structurePlaced':
        this.onStructurePlaced(eventData);
        break;
    }
  }

  /**
   * Before tick hook
   */
  async beforeTick(currentState) {
    // Modify state before tick
    console.log('[PLUGIN] Before tick:', currentState.clock?.tick);
  }

  /**
   * After tick hook
   */
  async afterTick(currentState) {
    // React to tick
    console.log('[PLUGIN] After tick:', currentState.clock?.tick);
    this.updateCustomHUD(currentState);
  }

  /**
   * Tile selection hook
   */
  async onTileSelect(tile, currentState) {
    console.log('[PLUGIN] Tile selected:', tile);
    this.highlightTile(tile);
  }

  /**
   * Before build hook
   */
  async beforeBuild(structureType, position, currentState) {
    console.log('[PLUGIN] Before build:', structureType, position);
    // Validate build conditions
    return this.validateBuild(structureType, position, currentState);
  }

  /**
   * After build hook
   */
  async afterBuild(structureType, position, currentState) {
    console.log('[PLUGIN] After build:', structureType, position);
    this.celebrateBuild(structureType, position);
  }

  /**
   * Add custom HUD elements
   */
  addCustomHUD() {
    // Add custom resource display
    const customHUD = this.controller.createElement('div', {
      className: 'custom-hud-plugin'
    });
    
    const efficiencyDisplay = this.controller.createElement('div', {
      className: 'efficiency-display'
    }, 'Efficiency: 100%');
    
    customHUD.appendChild(efficiencyDisplay);
    
    // Add to sidebar
    const sidebar = this.controller.getElement('.game-sidebar');
    if (sidebar) {
      sidebar.appendChild(customHUD);
      this.elements.set('customHUD', customHUD);
      this.elements.set('efficiencyDisplay', efficiencyDisplay);
    }
  }

  /**
   * Setup custom event handlers
   */
  setupEventHandlers() {
    // Add keyboard shortcuts
    this.controller.addEventListener(document, 'keydown', (event) => {
      if (event.key === 'e' && event.ctrlKey) {
        this.toggleEfficiencyMode();
      }
    });
  }

  /**
   * Update custom HUD
   */
  updateCustomHUD(currentState) {
    const efficiencyDisplay = this.elements.get('efficiencyDisplay');
    if (efficiencyDisplay) {
      const efficiency = this.calculateEfficiency(currentState);
      efficiencyDisplay.textContent = `Efficiency: ${efficiency}%`;
    }
  }

  /**
   * Calculate efficiency metric
   */
  calculateEfficiency(currentState) {
    const miners = currentState.structures?.filter(s => s.type === 'miner').length || 0;
    const totalStructures = currentState.structures?.length || 0;
    
    if (totalStructures === 0) return 100;
    
    // Simple efficiency calculation
    return Math.round((miners / totalStructures) * 100);
  }

  /**
   * Highlight selected tile
   */
  highlightTile(tile) {
    // Add visual feedback for tile selection
    const tileElements = this.controller.elementRoot.querySelectorAll('.tile');
    tileElements.forEach(tileEl => {
      tileEl.classList.remove('highlighted-plugin');
    });
    
    const selectedTileEl = this.controller.elementRoot.querySelector(
      `.tile[data-x="${tile.x}"][data-y="${tile.y}"]`
    );
    if (selectedTileEl) {
      selectedTileEl.classList.add('highlighted-plugin');
    }
  }

  /**
   * Validate build conditions
   */
  validateBuild(structureType, position, currentState) {
    // Custom validation logic
    const tile = this.controller.gameLogic.inspectTile(currentState, position);
    
    if (structureType === 'miner' && tile.terrain !== 'ore') {
      return { valid: false, reason: 'Miner can only be placed on ore tiles' };
    }
    
    return { valid: true };
  }

  /**
   * Celebrate building placement
   */
  celebrateBuild(structureType, position) {
    // Add celebration animation
    const celebration = this.controller.createElement('div', {
      className: 'build-celebration',
      style: {
        position: 'absolute',
        left: `${position.x * 84}px`,
        top: `${position.y * 84}px`,
        animation: 'celebrate 1s ease-out'
      }
    }, '✨');
    
    const gameWorld = this.controller.getElement('.game-world');
    if (gameWorld) {
      gameWorld.appendChild(celebration);
      setTimeout(() => celebration.remove(), 1000);
    }
  }

  /**
   * Add animations
   */
  addAnimations() {
    // Add CSS animations
    const style = this.controller.createElement('style');
    style.textContent = `
      .highlighted-plugin {
        border: 3px solid #ff6b6b !important;
        box-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
      }
      
      .build-celebration {
        font-size: 24px;
        pointer-events: none;
        z-index: 1000;
      }
      
      @keyframes celebrate {
        0% { transform: scale(0) rotate(0deg); opacity: 1; }
        50% { transform: scale(1.5) rotate(180deg); opacity: 1; }
        100% { transform: scale(2) rotate(360deg); opacity: 0; }
      }
      
      .custom-hud-plugin {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 10px;
        margin: 10px 0;
      }
      
      .efficiency-display {
        font-weight: bold;
        color: #4ecdc4;
      }
    `;
    
    this.controller.elementRoot.appendChild(style);
  }

  /**
   * Toggle efficiency mode
   */
  toggleEfficiencyMode() {
    document.body.classList.toggle('efficiency-mode');
    console.log('[PLUGIN] Efficiency mode toggled');
  }

  /**
   * Handle tick events
   */
  onTick(currentState) {
    // Custom tick logic
    this.checkAchievements(currentState);
  }

  /**
   * Handle tile selection
   */
  onTileSelected(tile) {
    // Custom tile selection logic
    this.showTileInfo(tile);
  }

  /**
   * Handle structure placement
   */
  onStructurePlaced(data) {
    // Custom structure placement logic
    this.updateStatistics(data);
  }

  /**
   * Check achievements
   */
  checkAchievements(currentState) {
    const structuresCount = currentState.structures?.length || 0;
    
    if (structuresCount === 10 && !this.achievement10) {
      this.achievement10 = true;
      this.showAchievement('First Decade!', 'Built 10 structures');
    }
  }

  /**
   * Show achievement notification
   */
  showAchievement(title, description) {
    const notification = this.controller.createElement('div', {
      className: 'achievement-notification',
      style: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '15px 20px',
        borderRadius: '10px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        zIndex: '10000',
        animation: 'slideIn 0.3s ease-out'
      }
    });
    
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">🏆 ${title}</div>
      <div style="font-size: 14px;">${description}</div>
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
  }

  /**
   * Show tile information
   */
  showTileInfo(tile) {
    // Enhanced tile information display
    console.log('[PLUGIN] Enhanced tile info:', tile);
  }

  /**
   * Update statistics
   */
  updateStatistics(data) {
    // Custom statistics tracking
    console.log('[PLUGIN] Statistics updated:', data);
  }

  /**
   * Cleanup plugin
   */
  async onDestroy() {
    console.log(`[PLUGIN] ${this.name} destroyed`);
    
    // Remove custom elements
    for (const [key, element] of this.elements) {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }
    this.elements.clear();
  }
}
