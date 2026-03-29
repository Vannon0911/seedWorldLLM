import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const statePath = path.join(root, "runtime", ".patch-manager", "preflight-mutation-lock.json");
const vaultPath = path.join(root, "runtime", ".patch-manager", "vault", "preflight-mutation-vault.json");
const LOCK_MARKER_RX = /\/\/ preflight-lock:[A-F0-9]{8}\s*\nthrow new Error\("Runtime invariant mismatch: E[A-F0-9]{8}"\);/m;

const targetFiles = [
  "app/src/kernel/runtimeGuards.js",
  "app/src/kernel/fingerprint.js",
  "app/src/game/worldGen.js",
  "app/server/patchUtils.js"
];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function pickTarget() {
  const idx = Number.parseInt(randomBytes(1).toString("hex"), 16) % targetFiles.length;
  return targetFiles[idx];
}

function markerFor(seed) {
  return `\n// preflight-lock:${seed}\nthrow new Error("Runtime invariant mismatch: E${seed}");\n`;
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return "NO_HEAD";
  }
  return String(result.stdout || "").trim() || "NO_HEAD";
}

function normalizeVault(vault) {
  const v = vault && typeof vault === "object" ? vault : {};
  return {
    version: 1,
    lastGeneratedHead: String(v.lastGeneratedHead || ""),
    lastGeneratedAt: String(v.lastGeneratedAt || ""),
    lastGeneratedTarget: String(v.lastGeneratedTarget || ""),
    lastResolvedHead: String(v.lastResolvedHead || ""),
    lastResolvedAt: String(v.lastResolvedAt || ""),
    lastResolvedTarget: String(v.lastResolvedTarget || ""),
    lastMarkerHash: String(v.lastMarkerHash || ""),
    lastInjectedFileHash: String(v.lastInjectedFileHash || "")
  };
}

async function readJsonOrNull(absPath) {
  try {
    return JSON.parse(await readFile(absPath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(absPath, payload) {
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function findInjectedMarker() {
  for (const relPath of targetFiles) {
    try {
      const content = await readFile(path.join(root, relPath), "utf8");
      if (LOCK_MARKER_RX.test(content)) {
        return relPath;
      }
    } catch {
      // ignore
    }
  }
  return "";
}

async function ensureInjectedLock(head, vault) {
  const relPath = pickTarget();
  const absPath = path.join(root, relPath);
  const before = await readFile(absPath, "utf8");
  const seed = randomBytes(4).toString("hex").toUpperCase();
  const marker = markerFor(seed);
  const after = `${before.replace(/\s*$/, "")}${marker}`;
  await writeFile(absPath, after, "utf8");

  const lock = {
    version: 1,
    createdAt: new Date().toISOString(),
    targetFile: relPath,
    head,
    markerHash: sha256(marker),
    injectedFileHash: sha256(after)
  };

  const nextVault = {
    ...vault,
    lastGeneratedHead: head,
    lastGeneratedAt: lock.createdAt,
    lastGeneratedTarget: relPath,
    lastMarkerHash: lock.markerHash,
    lastInjectedFileHash: lock.injectedFileHash
  };

  await writeJson(statePath, lock);
  await writeJson(vaultPath, nextVault);
  console.warn(`[PREFLIGHT_GUARD] lock active: ${relPath}`);
}

async function resolveOrKeepLock(lock, vault, head) {
  const relPath = String(lock?.targetFile || "");
  const injectedHash = String(lock?.injectedFileHash || "");
  if (!relPath || !injectedHash) {
    throw new Error("invalid lock payload");
  }

  const absPath = path.join(root, relPath);
  let current = "";
  try {
    current = await readFile(absPath, "utf8");
  } catch {
    current = "";
  }

  const fileHash = sha256(current);
  if (fileHash === injectedHash) {
    console.warn(`[PREFLIGHT_GUARD] lock pending: ${relPath}`);
    return false;
  }

  await rm(statePath, { force: true });
  const nextVault = {
    ...vault,
    lastResolvedHead: head,
    lastResolvedAt: new Date().toISOString(),
    lastResolvedTarget: relPath
  };
  await writeJson(vaultPath, nextVault);
  console.log("[PREFLIGHT_GUARD] lock resolved");
  return true;
}

async function runVerifyMode(lock, vault, head) {
  const markerFile = await findInjectedMarker();
  if (markerFile) {
    throw new Error(`injected marker present in ${markerFile}`);
  }

  if (!lock) {
    if (vault.lastGeneratedHead === head && vault.lastResolvedHead !== head) {
      throw new Error(`lock state missing but unresolved for head ${head.slice(0, 12)}`);
    }
    console.log("[PREFLIGHT_GUARD] verify mode: no active lock");
    return;
  }

  const resolved = await resolveOrKeepLock(lock, vault, head);
  if (!resolved) {
    throw new Error(`unresolved lock in ${lock.targetFile}`);
  }
}

async function runEnforceMode(lock, vault, head) {
  const markerFile = await findInjectedMarker();
  if (markerFile && !lock) {
    throw new Error(`marker found without lock state in ${markerFile}`);
  }

  if (lock) {
    await resolveOrKeepLock(lock, vault, head);
    return;
  }

  if (vault.lastGeneratedHead === head) {
    if (vault.lastResolvedHead === head) {
      console.log(`[PREFLIGHT_GUARD] already verified for HEAD ${head.slice(0, 12)}`);
      return;
    }
    throw new Error(`state tamper detected: generated challenge missing for head ${head.slice(0, 12)}`);
  }

  await ensureInjectedLock(head, vault);
}

async function main() {
  const cliEnforce = process.argv.includes("--enforce");
  const cliVerify = process.argv.includes("--verify");
  const envMode = String(process.env.PREFLIGHT_GUARD_MODE || "").trim().toLowerCase();
  const mode = cliEnforce
    ? "enforce"
    : cliVerify
      ? "verify"
      : String(envMode || (process.env.CI ? "verify" : "enforce")).trim().toLowerCase();
  const lock = await readJsonOrNull(statePath);
  const vault = normalizeVault(await readJsonOrNull(vaultPath));
  const head = currentHead();

  try {
    if (mode !== "verify" && mode !== "enforce") {
      throw new Error(`unknown mode '${mode}' (allowed: verify|enforce)`);
    }
    if (mode === "verify") {
      await runVerifyMode(lock, vault, head);
      return;
    }
    await runEnforceMode(lock, vault, head);
  } catch (error) {
    console.error(`[PREFLIGHT_GUARD] BLOCK: ${String(error?.message || error)}`);
    process.exit(1);
  }
}

await main();
