import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { LOCK_HEARTBEAT_MS, LOCK_TTL_MS } from './constants.mjs';
import { appendAudit, writeJson } from './session-store.mjs';

function nowIso() {
  return new Date().toISOString();
}

function parseLock(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readCurrentLock(lockPath) {
  if (!existsSync(lockPath)) {
    return null;
  }
  return parseLock(await readFile(lockPath, 'utf8'));
}

function ownsLock(currentLock, ownership) {
  return Boolean(
    currentLock
    && ownership
    && currentLock.sessionId === ownership.sessionId
    && currentLock.ownerNonce === ownership.ownerNonce
  );
}

function toPublicLock(lock) {
  if (!lock) {
    return null;
  }
  const { ownerNonce, ...publicLock } = lock;
  return publicLock;
}

export async function acquireLock({ rootDir, lockPath, sessionId, actor }) {
  const now = Date.now();
  const startedAt = nowIso();
  const expiresAt = new Date(now + LOCK_TTL_MS).toISOString();
  let lock = {
    pid: process.pid,
    startedAt,
    heartbeatAt: startedAt,
    expiresAt,
    sessionId,
    actor,
    ownerNonce: randomUUID()
  };
  const ownership = {
    sessionId,
    ownerNonce: lock.ownerNonce
  };

  if (existsSync(lockPath)) {
    const existing = await readCurrentLock(lockPath);
    if (existing) {
      const expiry = Date.parse(existing.expiresAt || '');
      if (Number.isFinite(expiry) && expiry > now) {
        const error = new Error(`Active terminal lock held by ${existing.sessionId}`);
        error.code = 'LOCK_HELD';
        error.details = existing;
        throw error;
      }

      await appendAudit(rootDir, {
        ts: startedAt,
        type: 'lock-takeover',
        sessionId,
        actor,
        previous: existing
      });
    }
  }

  await writeJson(lockPath, lock);
  const interval = setInterval(async () => {
    const current = await readCurrentLock(lockPath);
    if (!ownsLock(current, ownership)) {
      clearInterval(interval);
      return;
    }

    const heartbeatAt = nowIso();
    lock = {
      ...lock,
      heartbeatAt,
      expiresAt: new Date(Date.now() + LOCK_TTL_MS).toISOString()
    };
    await writeJson(lockPath, lock);
  }, LOCK_HEARTBEAT_MS);

  return {
    lock: toPublicLock(lock),
    heartbeat: interval,
    ownership
  };
}

export async function releaseLock({ lockPath, heartbeat, ownership }) {
  if (heartbeat) {
    clearInterval(heartbeat);
  }

  const current = await readCurrentLock(lockPath);
  if (ownsLock(current, ownership)) {
    await rm(lockPath, { force: true });
  }
}
