import { MS_PER_TICK } from "./IconAnimations.js";
import { TileGridRenderer } from "./TileGridRenderer.js";
import { generateWorld } from "../game/worldGen.js";
import { ensureCanonicalWorldModel } from "../game/worldState.js";
import { DEFAULT_GRID_BOUNDS, DEFAULT_TILE_SIZE } from "./RenderManager.js";

const DEFAULT_STATE = Object.freeze({
  world: {
    seed: "seedworld-v1",
    size: {
      width: DEFAULT_GRID_BOUNDS.width,
      height: DEFAULT_GRID_BOUNDS.height
    }
  }
});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function clone(value) {
  return structuredClone(value);
}

function toPositiveInteger(value, fallback = null) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function resolveGridSpecFromState(state, fallback = {}) {
  const fallbackWidth = toPositiveInteger(fallback.width, DEFAULT_GRID_BOUNDS.width);
  const fallbackHeight = toPositiveInteger(fallback.height, DEFAULT_GRID_BOUNDS.height);
  const fallbackTileSize = toPositiveInteger(fallback.tileSize, DEFAULT_TILE_SIZE);
  const world = isPlainObject(state?.world) ? state.world : {};
  const size = isPlainObject(world.size) ? world.size : {};

  let width = toPositiveInteger(size.width, null);
  let height = toPositiveInteger(size.height, null);

  if ((!width || !height) && Array.isArray(world.tiles) && world.tiles.length > 0) {
    let maxX = -1;
    let maxY = -1;
    for (const tile of world.tiles) {
      const x = Number.isFinite(tile?.x) ? Math.trunc(tile.x) : -1;
      const y = Number.isFinite(tile?.y) ? Math.trunc(tile.y) : -1;
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }

    width = width || toPositiveInteger(maxX + 1, fallbackWidth);
    height = height || toPositiveInteger(maxY + 1, fallbackHeight);
  }

  return {
    width: width || fallbackWidth,
    height: height || fallbackHeight,
    tileSize: fallbackTileSize
  };
}

export class UIController {
  constructor({ gameLogic, viewportManager = null, renderManager = null, elements = {} } = {}) {
    if (!gameLogic || typeof gameLogic.calculateAction !== "function") {
      throw new Error("[UI_CONTROLLER] gameLogic mit calculateAction erforderlich.");
    }

    this.gameLogic = gameLogic;
    this.viewportManager = viewportManager && typeof viewportManager.subscribe === "function" ? viewportManager : null;
    this.renderManager = renderManager && typeof renderManager.subscribe === "function" ? renderManager : null;
    this.unsubscribeViewport = null;
    this.elements = elements;
    this.currentState = clone(DEFAULT_STATE);
    this.currentTick = 0;
    this.tickTimer = null;
    this.tickDrainTimer = null;
    this.renderFrameHandle = null;
    this.pendingTicks = 0;
    this.tickRateMs = Number.isFinite(elements.tickRateMs) ? elements.tickRateMs : MS_PER_TICK;
    this.tileGridRenderer = null;
  }

  bootstrap() {
    this.currentState = this.#normalizeWorldState(this.currentState);
    this.#ensureWorldState();
    this.#syncRenderGridFromState(this.currentState);
    this.#bindViewport();
    this.#renderGrid();
    this.#startTickScheduler();
    this.#startRenderLoop();
  }

  #ensureTileGrid() {
    const container = this.elements.tileGridContainer || document.getElementById("tile-grid-container");
    if (!container) {
      return;
    }

    const snapshot = this.#getRenderSnapshot();
    const shouldRebuild =
      !this.tileGridRenderer ||
      this.tileGridRenderer.width !== snapshot.gridBounds.width ||
      this.tileGridRenderer.height !== snapshot.gridBounds.height ||
      this.tileGridRenderer.tileSize !== snapshot.tileSize;

    if (shouldRebuild) {
      this.tileGridRenderer = new TileGridRenderer(
        container,
        snapshot.gridBounds.width,
        snapshot.gridBounds.height,
        snapshot.tileSize
      );
    }

    if (typeof this.tileGridRenderer?.onViewportChange === "function") {
      this.tileGridRenderer.onViewportChange(snapshot.viewport);
    }
  }

  #bindViewport() {
    if (this.unsubscribeViewport) {
      return;
    }

    const source = this.renderManager || this.viewportManager;
    if (!source) {
      return;
    }

    this.unsubscribeViewport = source.subscribe((snapshot) => {
      this.#ensureTileGrid();
      if (this.tileGridRenderer && typeof this.tileGridRenderer.onViewportChange === "function") {
        this.tileGridRenderer.onViewportChange(snapshot.viewport);
      }
      this.#renderGrid();
    });
  }

  #renderGrid() {
    this.#ensureTileGrid();
    if (this.tileGridRenderer) {
      this.tileGridRenderer.render(this.currentState, this.currentTick);
    }
  }

  #ensureWorldState() {
    const world = this.currentState?.world;
    if (world && Array.isArray(world.tiles) && world.tiles.length > 0) {
      this.currentState = this.#normalizeWorldState(this.currentState);
      return;
    }

    const payload = {
      seed: typeof world?.seed === "string" && world.seed.trim() ? world.seed.trim() : "seedworld-v1",
      width: Number.isInteger(world?.size?.width) ? world.size.width : DEFAULT_GRID_BOUNDS.width,
      height: Number.isInteger(world?.size?.height) ? world.size.height : DEFAULT_GRID_BOUNDS.height
    };

    try {
      const result = this.gameLogic.applyActionLocally({ type: "generate_world", payload }, this.currentState);
      this.currentState = clone(result.previewState);
    } catch (_) {
      this.currentState = clone({
        ...this.currentState,
        world: generateWorld(payload)
      });
    }
    this.currentState = this.#normalizeWorldState(this.currentState);
  }

  #normalizeWorldState(state) {
    const nextState = isPlainObject(state) ? clone(state) : clone(DEFAULT_STATE);
    const world = isPlainObject(nextState.world) ? nextState.world : {};
    nextState.world = ensureCanonicalWorldModel(world);
    return nextState;
  }

  #startTickScheduler() {
    if (this.tickTimer !== null || typeof window === "undefined" || typeof window.setInterval !== "function") {
      return;
    }

    this.tickTimer = window.setInterval(() => {
      this.pendingTicks += 1;
    }, this.tickRateMs);

    this.tickDrainTimer = window.setInterval(() => {
      if (this.pendingTicks <= 0) {
        return;
      }

      const batch = Math.min(this.pendingTicks, 5);
      this.pendingTicks -= batch;
      this.currentTick += batch;
    }, 4);
  }

  #startRenderLoop() {
    if (
      this.renderFrameHandle !== null ||
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    const frame = () => {
      this.#renderGrid();
      this.renderFrameHandle = window.requestAnimationFrame(frame);
    };

    this.renderFrameHandle = window.requestAnimationFrame(frame);
  }

  #getRenderSnapshot() {
    if (this.renderManager && typeof this.renderManager.getSnapshot === "function") {
      return this.renderManager.getSnapshot();
    }

    const gridSpec = resolveGridSpecFromState(this.currentState, {
      width: DEFAULT_GRID_BOUNDS.width,
      height: DEFAULT_GRID_BOUNDS.height,
      tileSize: DEFAULT_TILE_SIZE
    });

    return {
      viewport: {
        width: 0,
        height: 0,
        devicePixelRatio: 1
      },
      tileSize: gridSpec.tileSize,
      gridBounds: {
        width: gridSpec.width,
        height: gridSpec.height
      }
    };
  }

  #syncRenderGridFromState(state) {
    const snapshot =
      this.renderManager && typeof this.renderManager.getSnapshot === "function"
        ? this.renderManager.getSnapshot()
        : null;

    const gridSpec = resolveGridSpecFromState(state, {
      width: snapshot?.gridBounds?.width ?? DEFAULT_GRID_BOUNDS.width,
      height: snapshot?.gridBounds?.height ?? DEFAULT_GRID_BOUNDS.height,
      tileSize: snapshot?.tileSize ?? DEFAULT_TILE_SIZE
    });

    if (this.renderManager && typeof this.renderManager.setGrid === "function") {
      this.renderManager.setGrid(gridSpec);
    }

    this.#ensureTileGrid();
  }
}
