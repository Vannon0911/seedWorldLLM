import { IconAnimations } from "./IconAnimations.js";

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

function normalizeType(value) {
  const type = typeof value === "string" ? value.trim() : "";
  return TILE_TYPES.has(type) ? type : "empty";
}

function normalizeTick(value) {
  return Number.isFinite(value) ? value : 0;
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

    this.root = document.createElement("div");
    this.root.className = "tile-grid";
    this.root.setAttribute("role", "grid");
    this.root.style.gridTemplateColumns = `repeat(${this.width}, ${this.tileSize}px)`;
    this.root.style.gridTemplateRows = `repeat(${this.height}, ${this.tileSize}px)`;
    this.root.style.setProperty("--tile-size", `${this.tileSize}px`);
    this.root.style.setProperty("--grid-width", String(this.width));
    this.root.style.setProperty("--grid-height", String(this.height));

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

    for (const tile of tiles) {
      const key = this.#key(tile.x, tile.y);
      const entry = this.tileEntries.get(key);
      if (!entry) {
        continue;
      }

      entry.data = tile;
      this.#renderTile(entry, tile, this.currentTick);
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

        const output = document.createElement("span");
        output.className = "tile-output";

        tile.append(icon, output);
        fragment.append(tile);

        this.tileEntries.set(this.#key(x, y), {
          element: tile,
          icon,
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
    const tiles = Array.isArray(source.tiles) ? source.tiles : [];
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

  #renderTile(entry, tile, currentTick) {
    const { element, icon, output } = entry;
    element.className = `tile tile--${tile.type}`;
    element.classList.toggle("tile--active", tile.isActive);
    element.classList.toggle("tile--empty", tile.type === "empty");

    icon.textContent = this.#iconForType(tile.type);
    icon.style.opacity = "1";
    icon.style.transform = "translate(-50%, -50%)";

    if (tile.type === "mine") {
      const swing = IconAnimations.mine.swing(currentTick);
      const pickaxe = IconAnimations.mine.pickaxe(currentTick, tile.isActive);
      icon.style.transform = `translate(-50%, -50%) rotate(${swing.toFixed(2)}deg) ${pickaxe}`;
    } else if (tile.type === "factory") {
      const rotation = IconAnimations.factory.rotate(currentTick);
      icon.style.transform = `translate(-50%, -50%) rotate(${rotation.toFixed(2)}deg)`;
      icon.style.opacity = String(IconAnimations.factory.opacity(tile.isActive));
    } else if (tile.type === "connector") {
      const pulse = IconAnimations.connector.pulseFlow(currentTick);
      const blink = IconAnimations.connector.blink(currentTick, tile.isEmpty);
      icon.style.transform = `translate(-50%, -50%) translateX(${(pulse / 20).toFixed(2)}px)`;
      icon.style.opacity = String(blink);
    }

    output.textContent = tile.outputText;
  }

  #iconForType(type) {
    if (type === "mine") {
      return "M";
    }

    if (type === "factory") {
      return "F";
    }

    if (type === "connector") {
      return ">";
    }

    if (type === "storage") {
      return "S";
    }

    return ".";
  }

  #key(x, y) {
    return `${Math.trunc(x)}:${Math.trunc(y)}`;
  }
}
