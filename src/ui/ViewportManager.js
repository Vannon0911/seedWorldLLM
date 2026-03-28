function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export class ViewportManager {
  constructor({ source = typeof window !== "undefined" ? window : null } = {}) {
    this.source = source;
    this.listeners = new Map();
    this.nextListenerId = 1;
    this.started = false;
    this.frameHandle = null;
    this.lastSnapshot = null;
    this.onResizeBound = this.onResize.bind(this);
  }

  start() {
    if (!this.source || this.started) {
      return this;
    }
    this.started = true;
    this.source.addEventListener("resize", this.onResizeBound, { passive: true });
    this.source.addEventListener("orientationchange", this.onResizeBound, { passive: true });
    return this;
  }

  subscribe(listener, { immediate = true } = {}) {
    if (typeof listener !== "function") {
      return () => {};
    }

    const id = this.nextListenerId;
    this.nextListenerId += 1;
    this.listeners.set(id, listener);

    if (immediate) {
      listener(this.createSnapshot("subscribe"));
    }

    return () => {
      this.listeners.delete(id);
    };
  }

  notify(reason = "manual") {
    this.publish(this.createSnapshot(reason));
  }

  destroy() {
    if (this.frameHandle && this.source && typeof this.source.cancelAnimationFrame === "function") {
      this.source.cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = null;

    if (this.source && this.started) {
      this.source.removeEventListener("resize", this.onResizeBound);
      this.source.removeEventListener("orientationchange", this.onResizeBound);
    }

    this.started = false;
    this.listeners.clear();
  }

  onResize() {
    if (!this.source) {
      return;
    }

    if (this.frameHandle) {
      return;
    }

    const raf =
      typeof this.source.requestAnimationFrame === "function"
        ? this.source.requestAnimationFrame.bind(this.source)
        : (callback) => this.source.setTimeout(callback, 16);

    this.frameHandle = raf(() => {
      this.frameHandle = null;
      this.publish(this.createSnapshot("resize"));
    });
  }

  publish(snapshot) {
    this.lastSnapshot = snapshot;
    for (const listener of this.listeners.values()) {
      listener(snapshot);
    }
  }

  createSnapshot(reason = "manual") {
    const width =
      this.source && typeof this.source.innerWidth === "number"
        ? this.source.innerWidth
        : typeof document !== "undefined"
          ? document.documentElement?.clientWidth
          : 0;
    const height =
      this.source && typeof this.source.innerHeight === "number"
        ? this.source.innerHeight
        : typeof document !== "undefined"
          ? document.documentElement?.clientHeight
          : 0;
    const devicePixelRatio =
      this.source && typeof this.source.devicePixelRatio === "number" ? this.source.devicePixelRatio : 1;

    return {
      width: Math.max(0, Math.round(toFiniteNumber(width, 0))),
      height: Math.max(0, Math.round(toFiniteNumber(height, 0))),
      devicePixelRatio: Math.max(0.5, toFiniteNumber(devicePixelRatio, 1)),
      reason,
      timestamp: Date.now()
    };
  }
}
