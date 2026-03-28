function hashString(input) {
  let h = 2166136261 >>> 0;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(seed, x, y) {
  let h = seed ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function unitFromHash(h) {
  return (h >>> 0) / 4294967295;
}

function valueNoise(seed, x, y, scale) {
  const fx = x * scale;
  const fy = y * scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;

  const c00 = unitFromHash(hash2(seed, ix, iy));
  const c10 = unitFromHash(hash2(seed, ix + 1, iy));
  const c01 = unitFromHash(hash2(seed, ix, iy + 1));
  const c11 = unitFromHash(hash2(seed, ix + 1, iy + 1));

  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const nx0 = c00 + (c10 - c00) * sx;
  const nx1 = c01 + (c11 - c01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbm(seed, x, y, options) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let norm = 0;
  const octaves = Math.max(1, options.octaves | 0);
  const persistence = Number.isFinite(options.persistence) ? options.persistence : 0.5;
  const scale = Number.isFinite(options.scale) ? options.scale : 0.1;

  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(seed + i * 911, x * frequency, y * frequency, scale) * amplitude;
    norm += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return norm > 0 ? total / norm : 0;
}

function hsl(h, s, l) {
  return `hsl(${h} ${s}% ${l}%)`;
}

function biomePalette(name) {
  if (name === "desert") {
    return { low: [42, 55, 42], mid: [45, 52, 52], high: [34, 56, 64] };
  }
  if (name === "forest") {
    return { low: [126, 48, 30], mid: [132, 45, 38], high: [140, 42, 49] };
  }
  if (name === "snow") {
    return { low: [210, 16, 42], mid: [205, 20, 58], high: [200, 20, 76] };
  }
  return { low: [28, 20, 26], mid: [95, 40, 42], high: [110, 32, 60] };
}

function isoTransform(x, y, tileW, tileH, originX, originY) {
  return {
    x: (x - y) * (tileW / 2) + originX,
    y: (x + y) * (tileH / 2) + originY
  };
}

function drawIsoGrid(ctx, width, height, tileW, tileH, originX, originY) {
  ctx.save();
  ctx.strokeStyle = "rgb(185 220 205 / 16%)";
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pt = isoTransform(x, y, tileW, tileH, originX, originY);
      const px = pt.x;
      const py = pt.y;
      ctx.beginPath();
      ctx.moveTo(px, py - tileH / 2);
      ctx.lineTo(px + tileW / 2, py);
      ctx.lineTo(px, py + tileH / 2);
      ctx.lineTo(px - tileW / 2, py);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawVoxels(ctx, width, height, tileW, tileH, originX, originY, seedInt, options, palette) {
  const elev = tileH * 0.22;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n = fbm(seedInt, x, y, options);
      const hLevel = Math.max(0, Math.min(1, n));
      const pt = isoTransform(x, y, tileW, tileH, originX, originY);
      const px = pt.x;
      const py = pt.y;
      const lift = Math.round(hLevel * elev);
      let color = palette.low;
      if (hLevel > 0.66) {
        color = palette.high;
      } else if (hLevel > 0.33) {
        color = palette.mid;
      }

      const shade = (hash2(seedInt, x, y) % 7) - 3;
      const lit = Math.max(18, Math.min(82, color[2] + shade));
      ctx.fillStyle = hsl(color[0], color[1], lit);

      ctx.beginPath();
      ctx.moveTo(px, py - lift - tileH / 2);
      ctx.lineTo(px + tileW / 2, py - lift);
      ctx.lineTo(px, py - lift + tileH / 2);
      ctx.lineTo(px - tileW / 2, py - lift);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgb(0 0 0 / 25%)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function renderWorldBitmap({ width, height, tileSize, options }) {
  const spacingMultiplier = 1.0;
  const tileW = tileSize * 2 * spacingMultiplier;
  const tileH = tileSize * 2 * spacingMultiplier;
  const canvasWidth = Math.round((width + height) * (tileW / 2) + tileW);
  const canvasHeight = Math.round((width + height) * (tileH / 2) + tileH);
  const originX = Math.round((height * tileW) / 2 + tileW / 2);
  const originY = Math.round(tileH / 2);
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Offscreen canvas context unavailable.");
  }

  const seedInt = hashString(options.seed);
  const palette = biomePalette(options.biome);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  // Keep deterministic order: grid first, voxel tiles second.
  drawIsoGrid(ctx, width, height, tileW, tileH, originX, originY);
  drawVoxels(ctx, width, height, tileW, tileH, originX, originY, seedInt, options, palette);

  return canvas.transferToImageBitmap();
}

self.onmessage = (event) => {
  const message = event?.data || {};
  if (message.type !== "render-world") {
    return;
  }

  try {
    const width = Math.max(4, Number(message.width) | 0);
    const height = Math.max(4, Number(message.height) | 0);
    const tileSize = Number.isFinite(message.tileSize) ? Math.max(24, Number(message.tileSize)) : 84;
    const options = {
      biome: typeof message.options?.biome === "string" ? message.options.biome : "mountain",
      scale: Number.isFinite(message.options?.scale) ? message.options.scale : 0.1,
      octaves: Number.isFinite(message.options?.octaves) ? message.options.octaves : 5,
      persistence: Number.isFinite(message.options?.persistence) ? message.options.persistence : 0.55,
      seed: message.options?.seed ?? Date.now()
    };

    const bitmap = renderWorldBitmap({ width, height, tileSize, options });
    self.postMessage({ type: "world-ready", bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({
      type: "world-error",
      error: String(error?.message || error)
    });
  }
};
