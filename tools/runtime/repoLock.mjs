import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

const LOCK_FILENAME = ".seedworld-repo.lock";
const LOCK_ENV_PATH = "SEEDWORLD_REPO_LOCK_PATH";
const LOCK_ENV_TOKEN = "SEEDWORLD_REPO_LOCK_TOKEN";

function lockPathForRoot(root) {
  return path.join(root, LOCK_FILENAME);
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code !== "ESRCH";
  }
}

async function readLockState(lockPath) {
  try {
    const raw = await readFile(lockPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function canReuseActiveLock(lockPath, activeToken) {
  if (!activeToken) {
    return false;
  }

  const owner = await readLockState(lockPath);
  if (!owner || owner.token !== activeToken) {
    return false;
  }

  return isPidAlive(owner.pid);
}

async function acquireRepoLock(lockPath, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (true) {
    try {
      const token = `${process.pid}-${startedAt}-${randomUUID()}`;
      const payload = {
        pid: process.pid,
        token,
        acquiredAt: new Date().toISOString()
      };

      await writeFile(lockPath, `${JSON.stringify(payload)}\n`, {
        flag: "wx",
        encoding: "utf8"
      });

      return {
        token,
        release: async () => {
          const owner = await readLockState(lockPath);
          if (owner && owner.token !== token) {
            return;
          }

          try {
            await unlink(lockPath);
          } catch (error) {
            if (!error || error.code !== "ENOENT") {
              throw error;
            }
          }
        }
      };
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw error;
      }

      const owner = await readLockState(lockPath);
      if (owner && !isPidAlive(owner.pid)) {
        await unlink(lockPath).catch(() => {});
        continue;
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`[REPO_LOCK] Timeout beim Sperren von ${lockPath}`);
      }

      await delay(50);
    }
  }
}

export async function withRepoLock(root, run) {
  const lockPath = lockPathForRoot(root);
  const activePath = process.env[LOCK_ENV_PATH];
  const activeToken = process.env[LOCK_ENV_TOKEN];

  if (activePath === lockPath && (await canReuseActiveLock(lockPath, activeToken))) {
    return await run();
  }

  const { token, release } = await acquireRepoLock(lockPath);
  const previousPath = activePath;
  const previousToken = activeToken;

  process.env[LOCK_ENV_PATH] = lockPath;
  process.env[LOCK_ENV_TOKEN] = token;

  try {
    return await run();
  } finally {
    if (previousPath === undefined) {
      delete process.env[LOCK_ENV_PATH];
    } else {
      process.env[LOCK_ENV_PATH] = previousPath;
    }

    if (previousToken === undefined) {
      delete process.env[LOCK_ENV_TOKEN];
    } else {
      process.env[LOCK_ENV_TOKEN] = previousToken;
    }

    await release();
  }
}
