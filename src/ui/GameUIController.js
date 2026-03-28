import { BaseUIController } from './BaseUIController.js';
import { TileGridRenderer } from './TileGridRenderer.js';
import { ResourceBar } from './events.js';

/**
 * Game UI Controller with Plugin Architecture
 * Manages the game interface with extensible plugin system
 */
export class GameUIController extends BaseUIController {
  constructor(gameLogic, options = {}) {
    super(options);
    this.gameLogic = gameLogic;
    this.currentState = null;
    this.selectedTile = null;
    this.tickTimer = null;
    this.tileGridRenderer = null;
    this.resourceBar = null;
  }

  async initialize(elementRoot = document.body) {
    // Initialize game state
    this.currentState = this.gameLogic.createInitialState();
    await super.initialize(elementRoot);
    
    // Start game loop
    this.startTickLoop();
  }

  createBaseStructure() {
    // Ensure the mode container is clean before (re)rendering this controller
    this.elementRoot.innerHTML = '';

    // Create main game layout
    const layout = this.createElement('div', { className: 'game-layout' });
    
    // Sidebar with HUD
    const sidebar = this.createElement('aside', { className: 'game-sidebar' });
    sidebar.appendChild(this.createResourcePanel());
    sidebar.appendChild(this.createStatsPanel());
    
    // Main game area
    const main = this.createElement('div', { className: 'game-main' });
    main.appendChild(this.createGameWorld());
    main.appendChild(this.createGameStatus());
    
    layout.appendChild(sidebar);
    layout.appendChild(main);
    
    this.elementRoot.appendChild(layout);
    this.rootNode = layout;
    
    // Store element references
    this.elements = {
      layout,
      sidebar,
      main,
      gameWorld: this.getElement('.game-world'),
      resourceDisplay: this.getElement('.resource-display'),
      statsDisplay: this.getElement('.stats-display'),
      gameStatus: this.getElement('.game-status')
    };
  }

  createResourcePanel() {
    const panel = this.createElement('div', { className: 'hud-panel' });
    panel.appendChild(this.createElement('h3', {}, 'Ressourcen'));
    
    const resourceDisplay = this.createElement('div', { className: 'resource-display' });
    
    // Ore resource
    const oreResource = this.createElement('div', { className: 'resource' });
    oreResource.appendChild(this.createElement('span', { className: 'resource-icon' }, '⛏️'));
    oreResource.appendChild(this.createElement('span', { className: 'resource-value', id: 'oreCount' }, '0'));
    
    // Iron resource
    const ironResource = this.createElement('div', { className: 'resource' });
    ironResource.appendChild(this.createElement('span', { className: 'resource-icon' }, '🔧'));
    ironResource.appendChild(this.createElement('span', { className: 'resource-value', id: 'ironCount' }, '0'));
    
    resourceDisplay.appendChild(oreResource);
    resourceDisplay.appendChild(ironResource);
    panel.appendChild(resourceDisplay);
    
    return panel;
  }

  createStatsPanel() {
    const panel = this.createElement('div', { className: 'hud-panel' });
    panel.appendChild(this.createElement('h3', {}, 'Statistiken'));
    
    const statsDisplay = this.createElement('div', { className: 'stats-display' });
    
    // Tick stat
    const tickStat = this.createElement('div', { className: 'stat' });
    tickStat.appendChild(this.createElement('span', { className: 'stat-label' }, 'Tick:'));
    tickStat.appendChild(this.createElement('span', { className: 'stat-value', id: 'tickCount' }, '0'));
    
    // Miner stat
    const minerStat = this.createElement('div', { className: 'stat' });
    minerStat.appendChild(this.createElement('span', { className: 'stat-label' }, 'Abbauer:'));
    minerStat.appendChild(this.createElement('span', { className: 'stat-value', id: 'minerCount' }, '0'));
    
    statsDisplay.appendChild(tickStat);
    statsDisplay.appendChild(minerStat);
    panel.appendChild(statsDisplay);
    
    return panel;
  }

  createGameWorld() {
    const gameWorld = this.createElement('div', { className: 'game-world', id: 'gameWorld' });
    
    // Initialize tile grid renderer - pass the container element directly
    const world = this.currentState.world;
    this.tileGridRenderer = new TileGridRenderer(gameWorld, world.width, world.height, 84);
    
    this.tileGridRenderer.onTileClick(({ x, y }) => {
      this.selectedTile = { x, y };
      this.handleTileSelection();
    });
    
    return gameWorld;
  }

  createGameStatus() {
    const gameStatus = this.createElement('div', { className: 'game-status', id: 'gameStatus' });
    gameStatus.appendChild(this.createElement('p', {}, 'Bereit für den ersten Abbauer.'));
    return gameStatus;
  }

  startTickLoop() {
    const intervalMs = this.gameLogic.getTickMs();
    this.tickTimer = setInterval(async () => {
      // Execute before tick hooks
      await this.executeHooks('beforeTick', this.currentState);
      
      // Advance game state
      this.currentState = this.gameLogic.advanceTick(this.currentState, 1);
      
      // Execute after tick hooks
      await this.executeHooks('afterTick', this.currentState);
      
      // Update UI
      this.updateUI();
      
      // Notify plugins of state change
      await this.handleEvent('tick', this.currentState);
    }, intervalMs);
  }

  handleTileSelection() {
    // Execute tile selection hooks
    this.executeHooks('onTileSelect', this.selectedTile, this.currentState);
    
    // Update UI
    this.updateTileInfo();
    this.updateBuildActions();
    
    // Notify plugins
    this.handleEvent('tileSelected', this.selectedTile);
  }

  updateUI() {
    this.updateResources();
    this.updateStats();
    this.updateGameWorld();
    this.updateStatus();
  }

  updateResources() {
    const oreCount = this.getElement('#oreCount');
    const ironCount = this.getElement('#ironCount');
    
    if (oreCount) oreCount.textContent = this.currentState.resources?.ore || 0;
    if (ironCount) ironCount.textContent = this.currentState.resources?.iron || 0;
  }

  updateStats() {
    const tickCount = this.getElement('#tickCount');
    const minerCount = this.getElement('#minerCount');
    
    if (tickCount) tickCount.textContent = this.currentState.clock?.tick || 0;
    if (minerCount) minerCount.textContent = this.countStructures('miner');
  }

  updateGameWorld() {
    if (this.tileGridRenderer) {
      this.tileGridRenderer.render(this.currentState, this.currentState?.clock?.tick ?? 0);
    }
  }

  updateStatus() {
    const gameStatus = this.getElement('.game-status p');
    if (gameStatus && this.currentState.meta?.statusText) {
      gameStatus.textContent = this.currentState.meta.statusText;
    }
  }

  updateTileInfo() {
    if (!this.selectedTile) return;
    
    const info = this.gameLogic.inspectTile(this.currentState, this.selectedTile);
    // Update tile info display (could be enhanced with plugins)
    this.handleEvent('tileInfoUpdated', info);
  }

  updateBuildActions() {
    if (!this.selectedTile) return;
    
    const options = this.gameLogic.getBuildCatalog(this.currentState, this.selectedTile);
    
    // Execute build actions hooks
    this.executeHooks('onBuildActions', options, this.selectedTile, this.currentState);
    
    // Create build action buttons
    this.renderBuildActions(options);
    
    this.handleEvent('buildActionsUpdated', options);
  }

  renderBuildActions(options) {
    // This would render build action buttons
    // For now, just notify plugins
    this.handleEvent('buildActionsRendered', options);
  }

  countStructures(type) {
    return Array.isArray(this.currentState?.structures)
      ? this.currentState.structures.filter(s => s.type === type).length
      : 0;
  }

  async placeStructure(structureType, x, y) {
    // Execute before build hooks
    await this.executeHooks('beforeBuild', structureType, { x, y }, this.currentState);
    
    const result = this.gameLogic.placeStructure(this.currentState, {
      type: structureType,
      x,
      y
    });
    
    if (result.ok) {
      this.currentState = result.state;
      this.updateUI();
      
      // Execute after build hooks
      await this.executeHooks('afterBuild', structureType, { x, y }, this.currentState);
      
      this.handleEvent('structurePlaced', { type: structureType, x, y, result });
    } else {
      this.handleEvent('buildFailed', { type: structureType, x, y, error: result.statusText });
    }
    
    return result;
  }

  async destroy() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    if (this.tileGridRenderer && typeof this.tileGridRenderer.destroy === "function") {
      this.tileGridRenderer.destroy();
    }
    
    await super.destroy();
  }

  render() {
    this.updateUI();
  }

  // Plugin-specific methods
  getSelectedTile() {
    return this.selectedTile;
  }

  getCurrentState() {
    return this.currentState;
  }

  getGameLogic() {
    return this.gameLogic;
  }
}
