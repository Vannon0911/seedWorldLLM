import { IconAnimations } from "./IconAnimations.js?rev=20260328";

const TILE_TYPES = new Set(["empty", "mine", "factory", "connector", "storage"]);
const DEFAULT_OUTPUT_TEXT = "-";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeType(value) {
  const type = typeof value === "string" ? value.trim() : "";
  return TILE_TYPES.has(type) ? type : "empty";
}

function normalizeTick(value) {
  return Number.isFinite(value) ? value : 0;
}

function hashTile(x, y, seed = 0) {
  let h = (seed ^ Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export class TileGridRenderer {
  constructor(containerId, width = 8, height = 6, tileSize = 80) {
    const container =
      typeof containerId === "string" ? document.getElementById(containerId) : containerId;

    if (!container) {
      throw new Error("[TILE_GRID] Container not found.");
    }

    this.container = container;
    this.width = Math.max(1, Math.trunc(width) || 8);
    this.height = Math.max(1, Math.trunc(height) || 6);
    this.tileSize = Math.max(1, Math.trunc(tileSize) || 80);
    this.currentTick = 0;
    this.clickCallback = null;
    this.tileEntries = new Map();
    this.visualSeed = 0x5f3759df;

    this.root = document.createElement("div");
    this.root.className = "tile-grid";
    this.root.setAttribute("role", "grid");
    this.#syncLayout();

    this.root.addEventListener("click", (event) => {
      if (typeof this.clickCallback !== "function") {
        return;
      }

      const tile = event.target?.closest?.(".tile");
      if (!tile || !this.root.contains(tile)) {
        return;
      }

      const x = Number(tile.dataset.x);
      const y = Number(tile.dataset.y);
      const entry = this.getTileAt(x, y);
      if (!entry) {
        return;
      }

      this.clickCallback({
        tile: entry,
        x,
        y,
        event
      });
    });

    this.container.replaceChildren(this.root);
    this.#buildGrid();
  }

  render(gameState = {}, currentTick = 0) {
    this.currentTick = normalizeTick(currentTick);
    const tiles = this.#normalizeTiles(gameState);
    const tileLookup = new Map();
    for (const tile of tiles) {
      tileLookup.set(this.#key(tile.x, tile.y), tile);
    }

    // Pass 1: grid/base layer first.
    for (const tile of tiles) {
      const key = this.#key(tile.x, tile.y);
      const entry = this.tileEntries.get(key);
      if (!entry) {
        continue;
      }
      entry.data = tile;
      this.#drawGrid(entry, tile);
    }

    // Pass 2: tile content/effects on top of grid layer.
    for (const tile of tiles) {
      const key = this.#key(tile.x, tile.y);
      const entry = this.tileEntries.get(key);
      if (!entry) {
        continue;
      }

      this.#drawTile(entry, tile, this.currentTick, tileLookup);
    }
  }

  getTileAt(x, y) {
    const key = this.#key(x, y);
    const entry = this.tileEntries.get(key);
    return entry ? entry.data : null;
  }

  onTileClick(callback) {
    this.clickCallback = typeof callback === "function" ? callback : null;
  }

  onViewportChange(viewport) {
    const width = Number(viewport?.width) || 0;
    const height = Number(viewport?.height) || 0;
    this.root.style.setProperty("--viewport-width", `${Math.max(0, Math.round(width))}px`);
    this.root.style.setProperty("--viewport-height", `${Math.max(0, Math.round(height))}px`);
    this.#syncLayout();
  }

  #syncLayout() {
    this.root.style.gridTemplateColumns = `repeat(${this.width}, ${this.tileSize}px)`;
    this.root.style.gridTemplateRows = `repeat(${this.height}, ${this.tileSize}px)`;
    this.root.style.setProperty("--tile-size", `${this.tileSize}px`);
    this.root.style.setProperty("--grid-width", String(this.width));
    this.root.style.setProperty("--grid-height", String(this.height));
  }

  #buildGrid() {
    const fragment = document.createDocumentFragment();

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const tile = document.createElement("div");
        tile.className = "tile tile--empty";
        tile.dataset.x = String(x);
        tile.dataset.y = String(y);
        tile.setAttribute("role", "gridcell");

        const icon = document.createElement("span");
        icon.className = "icon";
        icon.setAttribute("aria-hidden", "true");

        const fx = document.createElement("span");
        fx.className = "tile-fx";
        fx.setAttribute("aria-hidden", "true");

        const output = document.createElement("span");
        output.className = "tile-output";

        tile.append(icon, fx, output);
        fragment.append(tile);

        this.tileEntries.set(this.#key(x, y), {
          element: tile,
          icon,
          fx,
          output,
          data: {
            x,
            y,
            type: "empty",
            outputText: DEFAULT_OUTPUT_TEXT,
            isActive: false,
            isEmpty: true
          }
        });
      }
    }

    this.root.append(fragment);
  }

  #normalizeTiles(gameState) {
    const source = isPlainObject(gameState) ? gameState : {};
    const worldTiles = isPlainObject(source.world) && Array.isArray(source.world.tiles) ? source.world.tiles : null;
    const tiles = Array.isArray(worldTiles) ? worldTiles : Array.isArray(source.tiles) ? source.tiles : [];
    const byCoordinate = new Map();

    for (let index = 0; index < tiles.length; index += 1) {
      const raw = tiles[index];
      if (!isPlainObject(raw)) {
        continue;
      }

      const x = toFiniteNumber(raw.x, null);
      const y = toFiniteNumber(raw.y, null);
      if (x !== null && y !== null) {
        byCoordinate.set(this.#key(x, y), raw);
      } else {
        byCoordinate.set(String(index), raw);
      }
    }

    const normalized = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = y * this.width + x;
        const raw = byCoordinate.get(this.#key(x, y)) || tiles[index] || {};
        normalized.push(this.#normalizeTile(raw, x, y));
      }
    }

    return normalized;
  }

  #normalizeTile(raw, x, y) {
    const tile = isPlainObject(raw) ? raw : {};
    const type = normalizeType(tile.type);
    const isActive = Boolean(tile.isActive || tile.active);
    const isEmpty = Boolean(tile.isEmpty || tile.empty || type === "empty");

    return {
      x,
      y,
      type,
      isActive,
      isEmpty,
      outputText: this.#resolveOutputText(tile),
      raw: tile
    };
  }

  #resolveOutputText(tile) {
    const candidate =
      tile.outputText ??
      tile.output?.text ??
      tile.label ??
      tile.description ??
      tile.text ??
      tile.value;

    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      return trimmed.length > 0 ? trimmed : DEFAULT_OUTPUT_TEXT;
    }

    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }

    if (typeof tile.rate === "number" && Number.isFinite(tile.rate) && typeof tile.unit === "string") {
      return `${tile.rate} ${tile.unit.trim()}`;
    }

    return DEFAULT_OUTPUT_TEXT;
  }

  #drawGrid(entry, tile) {
    const { element } = entry;
    const resourceKind = this.#readResourceKind(tile);
    const biomeKind = this.#readBiomeKind(tile);

    element.className = `tile tile--${tile.type}`;
    element.classList.toggle("tile--active", tile.isActive);
    element.classList.toggle("tile--empty", tile.type === "empty");
    element.dataset.resource = resourceKind;
    element.dataset.biome = biomeKind;
    element.dataset.effect = tile.type;
    element.dataset.wobble = "off";
    element.style.filter = "none";
  }

  #drawTile(entry, tile, currentTick, tileLookup) {
    const { element, icon, fx, output } = entry;
    const biomeKind = this.#readBiomeKind(tile);

    icon.textContent = this.#iconForType(tile.type);
    icon.style.opacity = tile.type === "empty" ? "0" : "1";
    icon.style.transform = "translate(-50%, -50%)";
    fx.textContent = "";
    fx.style.opacity = tile.type === "empty" ? "0" : "1";

    if (tile.type === "mine") {
      const swing = IconAnimations.mine.swing(currentTick);
      const pickaxe = IconAnimations.mine.pickaxe(currentTick, tile.isActive);
      icon.style.transform = `translate(-50%, -50%) rotate(${swing.toFixed(2)}deg) ${pickaxe}`;
      fx.textContent = "⋅⋅⋅";
    } else if (tile.type === "factory") {
      const rotation = IconAnimations.factory.rotate(currentTick);
      icon.style.transform = `translate(-50%, -50%) rotate(${rotation.toFixed(2)}deg)`;
      icon.style.opacity = String(IconAnimations.factory.opacity(tile.isActive));
      fx.textContent = "···";
    } else if (tile.type === "connector") {
      const pulse = IconAnimations.connector.pulseFlow(currentTick);
      icon.style.transform = `translate(-50%, -50%) translateX(${(pulse / 20).toFixed(2)}px)`;
      icon.style.opacity = tile.isActive ? "1" : "0.9";
    } else if (tile.type === "storage") {
      const pulse = 0.95 + Math.sin(currentTick / 6) * 0.08;
      icon.style.transform = `translate(-50%, -50%) scale(${pulse.toFixed(3)})`;
      fx.textContent = "◦◦";
    }

    if (tile.type === "empty") {
      const tileHash = hashTile(tile.x, tile.y, this.visualSeed);
      const microVariance = (((tileHash >>> 4) % 19) - 9) * 0.013;
      const localWave = Math.sin(currentTick / 42 + (tileHash & 0xff) * 0.067) * 0.035;
      const drift = currentTick / 120;
      let clusterShadow = 0;
      const clusterCount = 4;

      for (let i = 0; i < clusterCount; i += 1) {
        const clusterHash = hashTile(i + 17, i * 31 + 23, this.visualSeed ^ 0x9e3779b9);
        const motionHash = hashTile(i + 101, i + 211, this.visualSeed ^ 0x85ebca6b);
        const baseX = clusterHash % this.width;
        const baseY = (clusterHash >>> 8) % this.height;
        const vx = (motionHash & 1) === 0 ? 1 : -1;
        const vy = (motionHash & 2) === 0 ? 1 : -1;
        const speedX = 0.7 + ((motionHash >>> 2) % 7) * 0.1;
        const speedY = 0.6 + ((motionHash >>> 5) % 7) * 0.08;
        const cx = ((baseX + vx * drift * speedX) % this.width + this.width) % this.width;
        const cy = ((baseY + vy * drift * speedY) % this.height + this.height) % this.height;

        const dxRaw = Math.abs(tile.x - cx);
        const dyRaw = Math.abs(tile.y - cy);
        const dx = Math.min(dxRaw, this.width - dxRaw);
        const dy = Math.min(dyRaw, this.height - dyRaw);
        const distance = Math.hypot(dx, dy);
        const radius = 1.9 + ((clusterHash >>> 16) % 4) * 0.8;
        if (distance < radius) {
          clusterShadow += 1 - distance / radius;
        }
      }

      const brightness = Math.max(0.76, Math.min(1.2, 0.98 + microVariance + localWave - clusterShadow * 0.16));
      const biomeBase = this.#biomeBaseHsl(biomeKind);
      const hueJitter = (((tileHash >>> 11) % 9) - 4) * 0.7;
      const satJitter = (((tileHash >>> 15) % 11) - 5) * 0.7;
      const lightJitter = (((tileHash >>> 20) % 13) - 6) * 0.52;
      const detailLight = (((tileHash >>> 24) % 19) - 9) * 0.45;
      const noiseLight = (((tileHash >>> 27) % 11) - 5) * 0.36;

      const baseHue = biomeBase.h + hueJitter;
      const baseSat = clamp(biomeBase.s + satJitter, 14, 62);
      const baseLight = clamp(biomeBase.l + lightJitter, 20, 68);

      const detailColor = this.#hslString(baseHue + 3.5, baseSat + 4.5, baseLight + 5.5 + detailLight);
      const noiseColor = this.#hslString(baseHue - 2.5, baseSat - 5.2, baseLight - 5.7 + noiseLight);
      const stoneColor = this.#hslString(baseHue + 11, baseSat - 12, baseLight - 11);
      const grassColor = this.#hslString(baseHue - 6, baseSat + 8, baseLight + 7);

      const topBiome = this.#neighborBiome(tileLookup, tile.x, tile.y - 1, biomeKind);
      const rightBiome = this.#neighborBiome(tileLookup, tile.x + 1, tile.y, biomeKind);
      const bottomBiome = this.#neighborBiome(tileLookup, tile.x, tile.y + 1, biomeKind);
      const leftBiome = this.#neighborBiome(tileLookup, tile.x - 1, tile.y, biomeKind);

      const topDiff = topBiome !== biomeKind;
      const rightDiff = rightBiome !== biomeKind;
      const bottomDiff = bottomBiome !== biomeKind;
      const leftDiff = leftBiome !== biomeKind;

      const topEdgeColor = this.#hslStringFromBiome(topBiome, 0, 0, 0);
      const rightEdgeColor = this.#hslStringFromBiome(rightBiome, 0, 0, 0);
      const bottomEdgeColor = this.#hslStringFromBiome(bottomBiome, 0, 0, 0);
      const leftEdgeColor = this.#hslStringFromBiome(leftBiome, 0, 0, 0);

      const aoTopLeft = (topDiff ? 0.09 : 0.03) + (leftDiff ? 0.09 : 0.03);
      const aoTopRight = (topDiff ? 0.09 : 0.03) + (rightDiff ? 0.09 : 0.03);
      const aoBottomLeft = (bottomDiff ? 0.09 : 0.03) + (leftDiff ? 0.09 : 0.03);
      const aoBottomRight = (bottomDiff ? 0.09 : 0.03) + (rightDiff ? 0.09 : 0.03);

      const d1x = 8 + ((tileHash >>> 6) % 74);
      const d1y = 10 + ((tileHash >>> 10) % 70);
      const d2x = 6 + ((tileHash >>> 14) % 76);
      const d2y = 8 + ((tileHash >>> 18) % 72);
      const d3x = 12 + ((tileHash >>> 22) % 66);
      const d3y = 12 + ((tileHash >>> 26) % 64);

      element.style.setProperty("--tile-base", this.#hslString(baseHue, baseSat, baseLight));
      element.style.setProperty("--tile-detail", detailColor);
      element.style.setProperty("--tile-noise", noiseColor);
      element.style.setProperty("--tile-stone", stoneColor);
      element.style.setProperty("--tile-grass", grassColor);
      element.style.setProperty("--tile-grain-alpha", (0.085 + ((tileHash >>> 5) % 10) * 0.008).toFixed(3));

      element.style.setProperty("--d1x", `${d1x}%`);
      element.style.setProperty("--d1y", `${d1y}%`);
      element.style.setProperty("--d2x", `${d2x}%`);
      element.style.setProperty("--d2y", `${d2y}%`);
      element.style.setProperty("--d3x", `${d3x}%`);
      element.style.setProperty("--d3y", `${d3y}%`);

      element.style.setProperty("--edge-top-alpha", topDiff ? "0.22" : "0");
      element.style.setProperty("--edge-right-alpha", rightDiff ? "0.22" : "0");
      element.style.setProperty("--edge-bottom-alpha", bottomDiff ? "0.22" : "0");
      element.style.setProperty("--edge-left-alpha", leftDiff ? "0.22" : "0");
      element.style.setProperty("--edge-top-color", topEdgeColor);
      element.style.setProperty("--edge-right-color", rightEdgeColor);
      element.style.setProperty("--edge-bottom-color", bottomEdgeColor);
      element.style.setProperty("--edge-left-color", leftEdgeColor);

      element.style.setProperty("--ao-tl", clamp(aoTopLeft, 0.04, 0.2).toFixed(3));
      element.style.setProperty("--ao-tr", clamp(aoTopRight, 0.04, 0.2).toFixed(3));
      element.style.setProperty("--ao-bl", clamp(aoBottomLeft, 0.04, 0.2).toFixed(3));
      element.style.setProperty("--ao-br", clamp(aoBottomRight, 0.04, 0.2).toFixed(3));

      element.style.filter = `brightness(${brightness.toFixed(3)})`;
    }

    output.textContent = tile.type === "empty" ? "" : tile.outputText;
  }

  #readResourceKind(tile) {
    const resource = isPlainObject(tile?.raw) && typeof tile.raw.resource === "string" ? tile.raw.resource : "none";
    return resource === "coal" || resource === "ore" ? resource : "none";
  }

  #readBiomeKind(tile) {
    const biome = isPlainObject(tile?.raw) && typeof tile.raw.biome === "string" ? tile.raw.biome : "meadow";
    if (biome === "forest" || biome === "scrub" || biome === "steppe" || biome === "water" || biome === "meadow") {
      return biome;
    }
    return "meadow";
  }

  #neighborBiome(tileLookup, x, y, fallback) {
    const key = this.#key(x, y);
    const neighbor = tileLookup.get(key);
    if (!neighbor) {
      return fallback;
    }
    return this.#readBiomeKind(neighbor);
  }

  #biomeBaseHsl(biome) {
    if (biome === "forest") {
      return { h: 118, s: 36, l: 33 };
    }
    if (biome === "scrub") {
      return { h: 34, s: 38, l: 45 };
    }
    if (biome === "steppe") {
      return { h: 50, s: 36, l: 52 };
    }
    if (biome === "water") {
      return { h: 204, s: 44, l: 43 };
    }
    return { h: 106, s: 39, l: 46 };
  }

  #hslString(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const sat = clamp(s, 8, 86);
    const light = clamp(l, 8, 86);
    return `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${light.toFixed(1)}%)`;
  }

  #hslStringFromBiome(biome, hueShift = 0, satShift = 0, lightShift = 0) {
    const base = this.#biomeBaseHsl(biome);
    return this.#hslString(base.h + hueShift, base.s + satShift, base.l + lightShift);
  }

  #iconForType(type) {
    if (type === "mine") {
      return "◆";
    }

    if (type === "factory") {
      return "✷";
    }

    if (type === "connector") {
      return "⇄";
    }

    if (type === "storage") {
      return "▣";
    }

    return "";
  }

  #key(x, y) {
    return `${Math.trunc(x)}:${Math.trunc(y)}`;
  }
}
