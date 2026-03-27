import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getPatchManagerPaths } from './constants.mjs';

export function createSessionId() {
  return `patch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getSessionPaths(rootDir, sessionId) {
  const paths = getPatchManagerPaths(rootDir);
  return {
    ...paths,
    sessionDir: join(paths.intakeDir, sessionId),
    statusPath: join(paths.sessionsDir, `${sessionId}.status.json`),
    cancelPath: join(paths.sessionsDir, `${sessionId}.cancel`),
    logPath: join(paths.logsDir, `${sessionId}.jsonl`),
    summaryPath: join(paths.logsDir, `${sessionId}.summary.txt`),
    backupManifestPath: join(paths.backupsDir, `${sessionId}.json`)
  };
}

export async function ensureSessionFilesystem(rootDir, sessionId) {
  const paths = getSessionPaths(rootDir, sessionId);
  await Promise.all([
    mkdir(paths.managerRoot, { recursive: true }),
    mkdir(paths.intakeDir, { recursive: true }),
    mkdir(paths.sessionsDir, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true }),
    mkdir(paths.backupsDir, { recursive: true }),
    mkdir(paths.uploadsDir, { recursive: true }),
    mkdir(paths.sessionDir, { recursive: true })
  ]);
  return paths;
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson(path, fallback = null) {
  if (!existsSync(path)) {
    return fallback;
  }

  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

export async function appendJsonLine(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, 'utf8');
}

export async function appendAudit(rootDir, value) {
  const { auditLogPath } = getPatchManagerPaths(rootDir);
  await appendJsonLine(auditLogPath, value);
}

export async function writeSummary(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${text.trim()}\n`, 'utf8');
}

export async function removeCancelFlag(path) {
  if (existsSync(path)) {
    await rm(path, { force: true });
  }
}

export async function loadLogTail(path, limit = 100) {
  if (!existsSync(path)) {
    return [];
  }

  const raw = await readFile(path, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: 'raw', line };
      }
    });
}
