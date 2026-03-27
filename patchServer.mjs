import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { SESSION_POLL_MS } from './tools/patch/lib/constants.mjs';
import {
  createSessionId,
  ensureSessionFilesystem,
  getSessionPaths,
  writeJson
} from './tools/patch/lib/session-store.mjs';
import { readSessionLogs, readSessionStatus } from './tools/patch/lib/orchestrator.mjs';

const ROOT_DIR = process.cwd();
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SRC_DIR = resolve(ROOT_DIR, 'src');
const PATCH_SCHEMA_PATHS = new Set([
  '/patches/patch-schema.json',
  '/patches/patch-matrix.json'
]);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

const activeProcesses = new Map();

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function text(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function hasHiddenSegment(pathname) {
  return pathname
    .split('/')
    .filter(Boolean)
    .some((segment) => segment.startsWith('.'));
}

function isPathInside(parentDir, candidatePath) {
  const parent = resolve(parentDir);
  return candidatePath.startsWith(`${parent}\\`) || candidatePath.startsWith(`${parent}/`);
}

function resolveStaticPath(pathname) {
  if (pathname === '/') {
    return resolve(ROOT_DIR, 'index.html');
  }
  if (pathname === '/patch') {
    return resolve(ROOT_DIR, 'patchUI.html');
  }
  if (pathname === '/popup') {
    return resolve(ROOT_DIR, 'patch-popup.html');
  }
  if (hasHiddenSegment(pathname)) {
    return null;
  }
  if (pathname.startsWith('/src/')) {
    const candidate = resolve(ROOT_DIR, `.${pathname}`);
    const extension = extname(candidate).toLowerCase();
    if (!isPathInside(SRC_DIR, candidate) || !new Set(['.js', '.css']).has(extension)) {
      return null;
    }
    return candidate;
  }
  if (PATCH_SCHEMA_PATHS.has(pathname)) {
    return resolve(ROOT_DIR, `.${pathname}`);
  }
  return null;
}

async function serveFile(res, filePath) {
  const extension = extname(filePath).toLowerCase();
  const body = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' });
  res.end(body);
}

async function collectBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request too large'), { code: 'REQUEST_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolvePromise(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(marker);

  while (start !== -1) {
    const next = buffer.indexOf(marker, start + marker.length);
    if (next === -1) {
      break;
    }
    const part = buffer.subarray(start + marker.length + 2, next - 2);
    if (part.length > 0) {
      parts.push(part);
    }
    start = next;
  }

  const fields = {};
  const files = {};

  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) {
      continue;
    }
    const headerText = part.subarray(0, headerEnd).toString('utf8');
    const body = part.subarray(headerEnd + 4);
    const disposition = headerText.split('\r\n').find((line) => line.toLowerCase().startsWith('content-disposition'));
    if (!disposition) {
      continue;
    }
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    const fileMatch = disposition.match(/filename="([^"]*)"/i);
    if (!nameMatch) {
      continue;
    }
    const fieldName = nameMatch[1];
    if (fileMatch && fileMatch[1]) {
      files[fieldName] = {
        filename: basename(fileMatch[1]),
        content: body
      };
    } else {
      fields[fieldName] = body.toString('utf8');
    }
  }

  return {
    fields,
    files
  };
}

async function handleCreateSession(req, res) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    json(res, 400, { error: 'multipart/form-data with boundary required' });
    return;
  }

  const rawBody = await collectBody(req);
  const { fields, files } = parseMultipart(rawBody, boundaryMatch[1]);
  const inputFile = files.input;

  if (!inputFile) {
    json(res, 400, { error: 'input file is required' });
    return;
  }

  const sessionId = createSessionId();
  const actor = (fields.actor || 'browser-ui').trim() || 'browser-ui';
  const paths = await ensureSessionFilesystem(ROOT_DIR, sessionId);
  const uploadPath = join(paths.uploadsDir, `${sessionId}-${inputFile.filename}`);
  await writeFile(uploadPath, inputFile.content);
  await writeJson(paths.statusPath, {
    sessionId,
    actor,
    phase: 'intake',
    progress: 0,
    state: 'queued',
    finalStatus: null,
    lock: null,
    startedAt: null,
    updatedAt: new Date().toISOString(),
    endedAt: null,
    inputPath: uploadPath,
    logPath: paths.logPath,
    summaryPath: paths.summaryPath,
    result: null,
    error: null,
    currentFile: inputFile.filename,
    currentPatchId: null,
    risk: null
  });

  const child = spawn(process.execPath, ['tools/patch/apply.mjs', '--input', uploadPath, '--actor', actor, '--session-id', sessionId], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    windowsHide: true
  });
  activeProcesses.set(sessionId, child);
  child.on('close', () => {
    activeProcesses.delete(sessionId);
  });

  json(res, 202, {
    sessionId,
    statusPath: paths.statusPath
  });
}

async function handleStatus(res, sessionId) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) {
    json(res, 404, { error: 'session not found' });
    return;
  }
  json(res, 200, status);
}

async function handleLogs(res, sessionId) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) {
    json(res, 404, { error: 'session not found' });
    return;
  }
  const logs = await readSessionLogs(ROOT_DIR, sessionId, 200);
  const summary = existsSync(status.summaryPath) ? await readFile(status.summaryPath, 'utf8') : '';
  json(res, 200, {
    ...logs,
    summary
  });
}

async function handleResult(res, sessionId) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) {
    json(res, 404, { error: 'session not found' });
    return;
  }
  if (!status.finalStatus) {
    json(res, 409, { error: 'session not finished', sessionId });
    return;
  }
  const summary = existsSync(status.summaryPath) ? await readFile(status.summaryPath, 'utf8') : '';
  json(res, 200, {
    sessionId,
    finalStatus: status.finalStatus,
    result: status.result,
    error: status.error,
    summary,
    logPath: status.logPath,
    summaryPath: status.summaryPath
  });
}

async function handleCancel(res, sessionId) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) {
    json(res, 404, { error: 'session not found' });
    return;
  }

  const paths = getSessionPaths(ROOT_DIR, sessionId);
  await mkdir(resolve(join(paths.cancelPath, '..')), { recursive: true });
  await writeFile(paths.cancelPath, `${new Date().toISOString()}\n`, 'utf8');
  json(res, 202, {
    sessionId,
    cancelRequested: true
  });
}

async function handleEvents(req, res, sessionId) {
  const status = await readSessionStatus(ROOT_DIR, sessionId);
  if (!status) {
    json(res, 404, { error: 'session not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  let lastStatus = '';

  const sendSnapshot = async () => {
    const nextStatus = await readSessionStatus(ROOT_DIR, sessionId);
    if (!nextStatus) {
      return;
    }
    const serialized = JSON.stringify(nextStatus);
    if (serialized !== lastStatus) {
      lastStatus = serialized;
      res.write(`event: status\n`);
      res.write(`data: ${serialized}\n\n`);
    }

    if (nextStatus.finalStatus) {
      const summary = existsSync(nextStatus.summaryPath) ? await readFile(nextStatus.summaryPath, 'utf8') : '';
      res.write(`event: result\n`);
      res.write(`data: ${JSON.stringify({ sessionId, finalStatus: nextStatus.finalStatus, summary })}\n\n`);
    }
  };

  const interval = setInterval(sendSnapshot, SESSION_POLL_MS);
  await sendSnapshot();

  req.on('close', () => {
    clearInterval(interval);
  });
}

async function routeRequest(req, res) {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  const pathname = requestUrl.pathname;

  if (pathname === '/api/patches' || pathname.startsWith('/api/patches/') || pathname === '/api/hooks') {
    json(res, 404, { error: 'legacy patch api removed' });
    return;
  }

  if (pathname === '/api/patch-sessions' && req.method === 'POST') {
    await handleCreateSession(req, res);
    return;
  }

  const sessionMatch = pathname.match(/^\/api\/patch-sessions\/([^/]+)(?:\/(events|logs|result|cancel))?$/);
  if (sessionMatch) {
    const sessionId = sessionMatch[1];
    const action = sessionMatch[2] || 'status';

    if (action === 'status' && req.method === 'GET') {
      await handleStatus(res, sessionId);
      return;
    }
    if (action === 'events' && req.method === 'GET') {
      await handleEvents(req, res, sessionId);
      return;
    }
    if (action === 'logs' && req.method === 'GET') {
      await handleLogs(res, sessionId);
      return;
    }
    if (action === 'result' && req.method === 'GET') {
      await handleResult(res, sessionId);
      return;
    }
    if (action === 'cancel' && req.method === 'POST') {
      await handleCancel(res, sessionId);
      return;
    }

    json(res, 405, { error: 'method not allowed' });
    return;
  }

  const routeFile = resolveStaticPath(pathname);
  if (!routeFile) {
    text(res, 404, 'Not found');
    return;
  }

  try {
    const fileInfo = await stat(routeFile);
    if (!fileInfo.isFile()) {
      throw new Error('not a file');
    }
    await serveFile(res, routeFile);
  } catch {
    text(res, 404, 'Not found');
  }
}

export class PatchServer {
  constructor(port = 3000) {
    this.port = port;
    this.server = createServer((req, res) => {
      routeRequest(req, res).catch((error) => {
        console.error('[PATCH_SERVER] request failed:', error);
        json(res, 500, { error: 'internal server error' });
      });
    });
  }

  listen() {
    return new Promise((resolvePromise) => {
      this.server.listen(this.port, () => {
        const address = this.server.address();
        const port = typeof address === 'object' && address ? address.port : this.port;
        console.log(`[PATCH_SERVER] running on http://127.0.0.1:${port}`);
        resolvePromise();
      });
    });
  }

  close() {
    for (const child of activeProcesses.values()) {
      child.kill();
    }
    activeProcesses.clear();
    return new Promise((resolvePromise) => this.server.close(resolvePromise));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new PatchServer(Number(process.env.PORT || 3000));
  await server.listen();

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}
