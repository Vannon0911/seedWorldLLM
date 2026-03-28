import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  appendJsonLine, createSessionId, ensureSessionFilesystem,
  getSessionPaths, readJson, writeJson
} from '../tools/patch/lib/session-store.mjs';
import { readSessionLogs, readSessionStatus } from '../tools/patch/lib/orchestrator.mjs';
import { SESSION_POLL_MS } from '../tools/patch/lib/constants.mjs';

const ROOT_DIR = process.cwd();
const MAX_CANCEL_BODY_BYTES = 32 * 1024;
const CANCEL_RATE_WINDOW_MS = 5000;
const CANCEL_RATE_MAX = 4;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const activeProcesses = new Map();

function sanitizeStatus(status) {
  if (!status || typeof status !== 'object') return status;
  const next = { ...status };
  delete next.cancelToken;
  return next;
}

async function collectBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { code: 'REQUEST_TOO_LARGE' })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const parts = []; let start = buffer.indexOf(marker);
  while (start !== -1) { const next = buffer.indexOf(marker, start + marker.length); if (next === -1) break; const part = buffer.subarray(start + marker.length + 2, next - 2); if (part.length > 0) parts.push(part); start = next; }
  const fields = {}, files = {};
  for (const part of parts) {
    const he = part.indexOf(Buffer.from('\r\n\r\n')); if (he === -1) continue;
    const ht = part.subarray(0, he).toString('utf8'); const body = part.subarray(he + 4);
    const d = ht.split('\r\n').find((l) => l.toLowerCase().startsWith('content-disposition')); if (!d) continue;
    const nm = d.match(/name="([^"]+)"/i); const fm = d.match(/filename="([^"]*)"/i); if (!nm) continue;
    if (fm?.[1]) files[nm[1]] = { filename: fm[1], content: body }; else fields[nm[1]] = body.toString('utf8');
  }
  return { fields, files };
}

export async function handleCreateSession(req, res, json) {
  const ct = req.headers['content-type'] || '';
  const bm = ct.match(/boundary=([^;]+)/i);
  if (!bm) { json(res, 400, { error: 'multipart/form-data with boundary required' }); return; }
  const rawBody = await collectBody(req);
  const { fields, files } = parseMultipart(rawBody, bm[1]);
  const inputFile = files.input;
  if (!inputFile) { json(res, 400, { error: 'input file is required' }); return; }

  const sessionId = createSessionId();
  const actor = (fields.actor || 'browser-ui').trim() || 'browser-ui';
  const cancelToken = randomUUID();
  const paths = await ensureSessionFilesystem(ROOT_DIR, sessionId);
  const uploadPath = join(paths.uploadsDir, `${sessionId}-${inputFile.filename}`);
  await writeFile(uploadPath, inputFile.content);
  await writeJson(paths.statusPath, { sessionId, actor, phase: 'intake', progress: 0, state: 'queued', finalStatus: null, lock: null, startedAt: null, updatedAt: new Date().toISOString(), endedAt: null, inputPath: uploadPath, logPath: paths.logPath, summaryPath: paths.summaryPath, result: null, error: null, currentFile: inputFile.filename, currentPatchId: null, risk: null, llmGate: null, cancelToken, cancelControl: { windowStartedAt: null, count: 0, lastRequestedAt: null } });

  const child = spawn(process.execPath, ['tools/patch/apply.mjs', '--input', uploadPath, '--actor', actor, '--session-id', sessionId], { cwd: ROOT_DIR, stdio: 'ignore', windowsHide: true });
  activeProcesses.set(sessionId, child);
  child.on('close', () => activeProcesses.delete(sessionId));

  json(res, 202, { sessionId, statusPath: paths.statusPath, cancelToken });
}

export async function handleStatus(res, sessionId, json) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) { json(res, 404, { error: 'session not found' }); return; }
  json(res, 200, sanitizeStatus(status));
}

export async function handleLogs(res, sessionId, json) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) { json(res, 404, { error: 'session not found' }); return; }
  const logs = await readSessionLogs(ROOT_DIR, sessionId, 200);
  const summary = existsSync(status.summaryPath) ? await readFile(status.summaryPath, 'utf8') : '';
  json(res, 200, { ...logs, llmGate: status.llmGate || null, summary });
}

export async function handleResult(res, sessionId, json) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) { json(res, 404, { error: 'session not found' }); return; }
  if (!status.finalStatus) { json(res, 409, { error: 'session not finished', sessionId }); return; }
  const summary = existsSync(status.summaryPath) ? await readFile(status.summaryPath, 'utf8') : '';
  json(res, 200, { sessionId, finalStatus: status.finalStatus, result: status.result, llmGate: status.llmGate || null, error: status.error, summary, logPath: status.logPath, summaryPath: status.summaryPath });
}

async function consumeCancelBudget(statusPath) {
  const nowIso = new Date().toISOString();
  const now = Date.parse(nowIso);
  const status = await readJson(statusPath, {});
  const current = status.cancelControl || { windowStartedAt: nowIso, count: 0, lastRequestedAt: null };
  const windowStartMs = Date.parse(current.windowStartedAt || '');
  const resetWindow = !Number.isFinite(windowStartMs) || (now - windowStartMs > CANCEL_RATE_WINDOW_MS);
  const next = resetWindow ? { windowStartedAt: nowIso, count: 1, lastRequestedAt: nowIso } : { windowStartedAt: current.windowStartedAt, count: (current.count || 0) + 1, lastRequestedAt: nowIso };
  await writeJson(statusPath, { ...status, cancelControl: next });
  return { allowed: next.count <= CANCEL_RATE_MAX, cancelControl: next };
}

async function parseCancelToken(req) {
  const h = req.headers['x-patch-cancel-token'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  const ct = req.headers['content-type'] || '';
  if (!ct.toLowerCase().includes('application/json')) return null;
  const raw = await collectBody(req, MAX_CANCEL_BODY_BYTES);
  if (!raw.length) return null;
  try { const p = JSON.parse(raw.toString('utf8')); return typeof p.cancelToken === 'string' && p.cancelToken.trim() ? p.cancelToken.trim() : null; } catch { return null; }
}

export async function handleCancel(req, res, sessionId, json) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) { json(res, 404, { error: 'session not found' }); return; }
  const paths = getSessionPaths(ROOT_DIR, sessionId);
  const budget = await consumeCancelBudget(paths.statusPath);
  if (!budget.allowed) {
    await appendJsonLine(paths.logPath, {
      ts: new Date().toISOString(),
      type: 'cancel-denied',
      reason: 'rate-limit',
      sessionId,
      cancelControl: budget.cancelControl
    });
    json(res, 429, { error: 'cancel rate limit exceeded' });
    return;
  }
  const cancelToken = await parseCancelToken(req);
  if (status.cancelToken && status.cancelToken !== cancelToken) {
    await appendJsonLine(paths.logPath, {
      ts: new Date().toISOString(),
      type: 'cancel-denied',
      reason: 'invalid-token',
      sessionId,
      cancelControl: budget.cancelControl
    });
    json(res, 403, { error: 'invalid cancel token', sessionId });
    return;
  }
  if (existsSync(paths.cancelPath)) {
    await appendJsonLine(paths.logPath, {
      ts: new Date().toISOString(),
      type: 'cancel-requested',
      sessionId,
      alreadyRequested: true,
      cancelControl: budget.cancelControl
    });
    json(res, 202, { sessionId, cancelRequested: true, alreadyRequested: true, cancelControl: budget.cancelControl });
    return;
  }
  await mkdir(resolve(join(paths.cancelPath, '..')), { recursive: true });
  await writeFile(paths.cancelPath, `${new Date().toISOString()}\n`, 'utf8');
  await appendJsonLine(paths.logPath, {
    ts: new Date().toISOString(),
    type: 'cancel-requested',
    sessionId,
    alreadyRequested: false,
    cancelControl: budget.cancelControl
  });
  json(res, 202, { sessionId, cancelRequested: true, alreadyRequested: false, cancelControl: budget.cancelControl });
}

export async function handleEvents(req, res, sessionId, json) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) { json(res, 404, { error: 'session not found' }); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  let lastStatus = '';
  const sendSnapshot = async () => {
    const next = await readSessionStatus(ROOT_DIR, sessionId);
    if (!next) return;
    const serialized = JSON.stringify(sanitizeStatus(next));
    if (serialized !== lastStatus) { lastStatus = serialized; res.write(`event: status\n`); res.write(`data: ${serialized}\n\n`); }
    if (next.finalStatus) {
      const summary = existsSync(next.summaryPath) ? await readFile(next.summaryPath, 'utf8') : '';
      res.write(`event: result\n`); res.write(`data: ${JSON.stringify({ sessionId, finalStatus: next.finalStatus, summary })}\n\n`);
    }
  };
  const interval = setInterval(sendSnapshot, SESSION_POLL_MS);
  await sendSnapshot();
  req.on('close', () => clearInterval(interval));
}
