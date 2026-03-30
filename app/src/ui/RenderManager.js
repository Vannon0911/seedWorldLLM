function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

export class RenderManager {
  constructor({ viewportManager = null } = {}) {
    this.viewportManager = viewportManager && typeof viewportManager.subscribe === "function" ? viewportManager : null;
    this.unsubscribeViewport = null;
    this.listeners = new Map();
    this.nextListenerId = 1;
    this.state = {
      viewport: {
        width: 0,
        height: 0,
        devicePixelRatio: 1
      },
      tileSize: 84,
      gridBounds: {
        width: 16,
        height: 12
      }
    };
  }

  start() {
    if (!this.viewportManager || this.unsubscribeViewport) {
      return this;
    }

    this.unsubscribeViewport = this.viewportManager.subscribe((snapshot) => {
      this.setViewport(snapshot);
    });
    return this;
  }

  stop() {
    if (this.unsubscribeViewport) {
      this.unsubscribeViewport();
      this.unsubscribeViewport = null;
    }
  }

  subscribe(listener, { immediate = true } = {}) {
    if (typeof listener !== "function") {
      return () => {};
    }

    const id = this.nextListenerId;
    this.nextListenerId += 1;
    this.listeners.set(id, listener);

    if (immediate) {
      listener(this.getSnapshot());
    }

    return () => {
      this.listeners.delete(id);
    };
  }

  setViewport(snapshot = {}) {
    this.state.viewport = {
      width: Math.max(0, Math.round(toFiniteNumber(snapshot.width, 0))),
      height: Math.max(0, Math.round(toFiniteNumber(snapshot.height, 0))),
      devicePixelRatio: clamp(toFiniteNumber(snapshot.devicePixelRatio, 1), 0.5, 4)
    };
    this.#emit();
  }

  setGrid({ width, height, tileSize } = {}) {
    this.state.gridBounds = {
      width: Math.max(1, Math.round(toFiniteNumber(width, this.state.gridBounds.width))),
      height: Math.max(1, Math.round(toFiniteNumber(height, this.state.gridBounds.height)))
    };
    this.state.tileSize = Math.max(1, Math.round(toFiniteNumber(tileSize, this.state.tileSize)));
    this.#emit();
  }

  worldToScreen(x, y) {
    const tileX = Math.round(toFiniteNumber(x, 0));
    const tileY = Math.round(toFiniteNumber(y, 0));
    const px = tileX * this.state.tileSize + this.state.tileSize / 2;
    const py = tileY * this.state.tileSize + this.state.tileSize / 2;
    return {
      x: px,
      y: py
    };
  }

  screenToTile(screenX, screenY) {
    const x = Math.floor(toFiniteNumber(screenX, 0) / this.state.tileSize);
    const y = Math.floor(toFiniteNumber(screenY, 0) / this.state.tileSize);
    return {
      x: clamp(x, 0, this.state.gridBounds.width - 1),
      y: clamp(y, 0, this.state.gridBounds.height - 1)
    };
  }

  getSnapshot() {
    return {
      viewport: { ...this.state.viewport },
      tileSize: this.state.tileSize,
      gridBounds: { ...this.state.gridBounds }
    };
  }

  #emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners.values()) {
      listener(snapshot);
    }
  }
}
