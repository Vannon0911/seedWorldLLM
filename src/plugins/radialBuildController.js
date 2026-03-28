const RESOURCE_TYPES = ["mine", "storage", "factory", "clear"];
const DRAW_TYPES = new Set(["mine", "storage", "factory"]);

export function getWorldTile(world, x, y) {
  if (!world || typeof world !== "object" || !Array.isArray(world.tiles)) {
    return null;
  }

  const tx = Number(x);
  const ty = Number(y);
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
    return null;
  }

  const width = Number.isInteger(world?.size?.width) ? world.size.width : 0;
  const index = width > 0 ? ty * width + tx : -1;
  const indexed = index >= 0 && index < world.tiles.length ? world.tiles[index] : null;
  if (indexed && Number(indexed.x) === tx && Number(indexed.y) === ty) {
    return indexed;
  }

  return world.tiles.find((tile) => Number(tile?.x) === tx && Number(tile?.y) === ty) || null;
}

function resourceLabel(type) {
  if (type === "mine") return "Erz";
  if (type === "storage") return "Lager";
  if (type === "factory") return "Fabrik";
  return "-";
}

function iconLabel(type) {
  if (type === "mine") return "◆";
  if (type === "storage") return "▣";
  if (type === "factory") return "✷";
  if (type === "connector") return "⇄";
  return "";
}

function keyFor(x, y) {
  return `${x}:${y}`;
}

function waitForGridRoot() {
  return new Promise((resolve) => {
    const tick = () => {
      const root = document.querySelector("#tile-grid-container .tile-grid");
      const ui = window.seedWorldUI;
      if (root && ui) {
        resolve({ root, ui });
        return;
      }
      window.setTimeout(tick, 40);
    };
    tick();
  });
}

function ensureTiles(ui, width, height) {
  if (!ui.displayState || typeof ui.displayState !== "object") {
    ui.displayState = {};
  }
  if (!ui.displayState.world || typeof ui.displayState.world !== "object") {
    ui.displayState.world = {};
  }

  const expected = width * height;
  if (!Array.isArray(ui.displayState.world.tiles) || ui.displayState.world.tiles.length !== expected) {
    ui.displayState.world.tiles = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        ui.displayState.world.tiles.push({
          x,
          y,
          type: "empty",
          outputText: "",
          isActive: false,
          isEmpty: true,
          biome: "meadow",
          terrain: "meadow",
          resource: "none"
        });
      }
    }
  }
}

function getTilesRef(ui) {
  const worldTiles = ui?.displayState?.world?.tiles;
  if (Array.isArray(worldTiles)) {
    return worldTiles;
  }
  return Array.isArray(ui?.displayState?.tiles) ? ui.displayState.tiles : [];
}

function sortByGrid(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

function buildLinks(tiles) {
  const mines = [];
  const storages = [];
  const factories = [];

  for (const tile of tiles) {
    if (tile.type === "mine") mines.push(tile);
    if (tile.type === "storage") storages.push(tile);
    if (tile.type === "factory") factories.push(tile);
  }

  mines.sort(sortByGrid);
  storages.sort(sortByGrid);
  factories.sort(sortByGrid);

  function distanceSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function pairNearest(sources, targets) {
    const out = [];
    const remaining = new Set(targets.map((t) => keyFor(t.x, t.y)));
    const targetMap = new Map(targets.map((t) => [keyFor(t.x, t.y), t]));

    for (const source of sources) {
      let bestKey = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const key of remaining) {
        const target = targetMap.get(key);
        if (!target) continue;
        const dist = distanceSq(source, target);
        if (dist < bestDist) {
          bestDist = dist;
          bestKey = key;
        }
      }

      if (bestKey) {
        const target = targetMap.get(bestKey);
        out.push({ from: source, to: target });
        remaining.delete(bestKey);
      }
    }

    return out;
  }

  return [...pairNearest(mines, storages), ...pairNearest(storages, factories)];
}

function getTileCenter(root, tile) {
  const node = root.querySelector(`.tile[data-x="${tile.x}"][data-y="${tile.y}"]`);
  if (!node) return null;
  const rootRect = root.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  return {
    x: rect.left - rootRect.left + rect.width / 2,
    y: rect.top - rootRect.top + rect.height / 2
  };
}

function drawConnections(svg, root, tiles, dashOffset) {
  svg.replaceChildren();
  const links = buildLinks(tiles.filter((x) => DRAW_TYPES.has(x.type)));
  for (const link of links) {
    const from = getTileCenter(root, link.from);
    const to = getTileCenter(root, link.to);
    if (!from || !to) continue;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "connection-line");
    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
    line.style.strokeDashoffset = String(dashOffset);
    svg.append(line);
  }
}

function installRadialMenu(root) {
  const menu = document.createElement("div");
  menu.className = "radial-menu";
  menu.hidden = true;

  const defs = [
    { type: "mine", short: "◆", angle: -90 },
    { type: "storage", short: "▣", angle: -18 },
    { type: "factory", short: "✷", angle: 54 },
    { type: "clear", short: "✕", angle: 126 }
  ];

  for (const def of defs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "radial-option";
    btn.dataset.type = def.type;
    btn.dataset.angle = String(def.angle);
    btn.style.setProperty("--a", String(def.angle));
    btn.title = def.type;
    btn.textContent = def.short;
    menu.append(btn);
  }

  root.append(menu);
  return menu;
}

function updateDebug(selected, tile, linksCount) {
  const status = document.getElementById("status-value");
  const summary = document.getElementById("summary-value");
  if (status) {
    status.textContent = tile ? `tile:${tile.x},${tile.y}` : "bereit";
  }
  if (summary) {
    summary.textContent = JSON.stringify({ selected, links: linksCount }, null, 2);
  }
}

export function installRadialBuildController({ viewportManager = null } = {}) {
  waitForGridRoot().then(({ root, ui }) => {
    const width = Number(ui?.tileGridRenderer?.width) || Number(root.style.getPropertyValue("--grid-width")) || 8;
    const height =
      Number(ui?.tileGridRenderer?.height) || Number(root.style.getPropertyValue("--grid-height")) || 6;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("connection-layer");
    root.append(svg);

    const resizeSvg = () => {
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    };

    const menu = installRadialMenu(root);
    let selectedType = "mine";
    let targetTile = null;
    let dashOffset = 0;

    const optionNodes = () => Array.from(menu.querySelectorAll(".radial-option"));

    function setActive(type) {
      selectedType = RESOURCE_TYPES.includes(type) ? type : "mine";
      for (const node of optionNodes()) {
        node.classList.toggle("is-active", node.dataset.type === selectedType);
      }
    }

    function openMenuAt(tileEl) {
      const tileRect = tileEl.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const cx = tileRect.left - rootRect.left + tileRect.width / 2;
      const cy = tileRect.top - rootRect.top + tileRect.height / 2;
      menu.style.left = `${cx}px`;
      menu.style.top = `${cy}px`;
      menu.hidden = false;
      setActive(selectedType);
    }

    function closeMenu() {
      menu.hidden = true;
    }

    function redrawConnections() {
      const tiles = getTilesRef(ui).filter((t) => DRAW_TYPES.has(t.type));
      drawConnections(svg, root, tiles, dashOffset);
      return tiles;
    }

    function applyPlacement(type) {
      if (!targetTile) return;
      const tileEl = targetTile.el;
      const { x, y } = targetTile;
      ensureTiles(ui, width, height);
      const tilesRef = getTilesRef(ui);
      const idx = y * width + x;
      const normalized = type === "clear" ? "empty" : type;
      const isClear = type === "clear";
      const previous = tilesRef[idx] || { x, y, biome: "meadow", terrain: "meadow", resource: "none" };

      tilesRef[idx] = {
        x,
        y,
        type: normalized,
        outputText: resourceLabel(normalized),
        isActive: !isClear,
        isEmpty: isClear,
        biome: previous.biome || "meadow",
        terrain: previous.terrain || previous.biome || "meadow",
        resource: previous.resource || "none"
      };

      if (ui.currentState && typeof ui.currentState === "object") {
        ui.currentState = structuredClone(ui.displayState);
      }

      if (ui.tileGridRenderer && typeof ui.tileGridRenderer.render === "function") {
        ui.tileGridRenderer.render(ui.displayState, ui.currentTick || 0);
      } else {
        tileEl.className = `tile tile--${normalized}`;
        if (!isClear) {
          tileEl.classList.add("tile--active");
        }
        const icon = tileEl.querySelector(".icon");
        const out = tileEl.querySelector(".tile-output");
        if (icon) icon.textContent = iconLabel(normalized);
        if (out) out.textContent = resourceLabel(normalized);
      }

      const tiles = redrawConnections();
      const links = buildLinks(tiles);
      updateDebug(type, { x, y }, links.length);
      closeMenu();
    }

    root.addEventListener("click", (event) => {
      const option = event.target?.closest?.(".radial-option");
      if (option && menu.contains(option)) {
        setActive(option.dataset.type || "mine");
        applyPlacement(selectedType);
        return;
      }

      const tileEl = event.target?.closest?.(".tile");
      if (!tileEl || !root.contains(tileEl)) {
        closeMenu();
        return;
      }

      const x = Number(tileEl.dataset.x);
      const y = Number(tileEl.dataset.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      targetTile = { x, y, el: tileEl, key: keyFor(x, y) };
      openMenuAt(tileEl);
      updateDebug(selectedType, { x, y }, 0);
    });

    const viewport = viewportManager || window.seedWorldViewportManager;
    if (viewport && typeof viewport.subscribe === "function") {
      viewport.subscribe(
        () => {
          resizeSvg();
          redrawConnections();
        },
        { immediate: false }
      );
    } else {
      window.addEventListener(
        "resize",
        () => {
          resizeSvg();
          redrawConnections();
        },
        { passive: true }
      );
    }

    setActive("mine");
    resizeSvg();

    const animate = () => {
      dashOffset -= 1.4;
      for (const line of svg.querySelectorAll(".connection-line")) {
        line.style.strokeDashoffset = String(dashOffset);
      }
      window.requestAnimationFrame(animate);
    };
    animate();
  });
}
