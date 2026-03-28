import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { chromium } from "playwright";

const ROOT = process.cwd();
const HOST = "127.0.0.1";
const PORT = 4173;

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function resolvePath(urlPathname) {
  const normalized = decodeURIComponent(urlPathname || "/");
  const rawRel = normalized === "/" ? "game.html" : normalized.replace(/^\/+/, "");
  const abs = path.resolve(ROOT, rawRel);
  const rootPrefix = `${path.resolve(ROOT)}${path.sep}`;
  if (!(abs === path.resolve(ROOT) || abs.startsWith(rootPrefix))) {
    return null;
  }
  return abs;
}

async function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
      const filePath = resolvePath(url.pathname);
      if (!filePath) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const info = await stat(filePath).catch(() => null);
      if (!info || !info.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, {
        "content-type": contentType(filePath),
        "cache-control": "no-store"
      });
      res.end(body);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.message || error));
    }
  });

  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  return server;
}

async function run() {
  const server = await createServer();
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1720, height: 1080 } });
    await page.goto(`http://${HOST}:${PORT}/game.html?e2e=fulltiles`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tile-grid", { timeout: 15000 });

    const tileCount = await page.$$eval(".tile-grid .tile", (nodes) => nodes.length);
    if (tileCount !== 16 * 12) {
      throw new Error(`[PLAYWRIGHT] Expected 192 tiles, got ${tileCount}`);
    }

    const visibility = await page.$$eval(".tile-grid .tile", (nodes) =>
      nodes.every((node) => {
        const el = node;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      })
    );
    if (!visibility) {
      throw new Error("[PLAYWRIGHT] Not all tiles are visible.");
    }

    const placementResult = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const tiles = Array.from(document.querySelectorAll(".tile-grid .tile"));
      const failures = [];

      for (const tile of tiles) {
        tile.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await sleep(0);

        const mine = document.querySelector('.radial-option[data-type="mine"]');
        if (!mine) {
          failures.push(`mine option missing @ ${tile.getAttribute("data-x")}:${tile.getAttribute("data-y")}`);
          continue;
        }
        mine.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await sleep(0);

        if (!tile.classList.contains("tile--mine")) {
          failures.push(`not placeable @ ${tile.getAttribute("data-x")}:${tile.getAttribute("data-y")}`);
        }
      }

      return {
        total: tiles.length,
        failures
      };
    });

    await page.screenshot({
      path: path.join(ROOT, "output", "playwright", "full-playwright-header.png"),
      fullPage: true
    });

    if (placementResult.failures.length > 0) {
      throw new Error(
        `[PLAYWRIGHT] Placement failed on ${placementResult.failures.length}/${placementResult.total} tiles.`
      );
    }

    console.log(`[PLAYWRIGHT] OK visible+placeable for ${placementResult.total} tiles`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

await run();
