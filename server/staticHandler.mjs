import { extname, resolve } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = resolve(ROOT_DIR, 'public');
const SRC_DIR = resolve(ROOT_DIR, 'src');

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
});

const PATCH_SCHEMA_PATHS = new Set([
  '/patches/patch-schema.json',
  '/patches/patch-matrix.json'
]);

function hasHiddenSegment(pathname) {
  return pathname.split('/').filter(Boolean).some((s) => s.startsWith('.'));
}

function isPathInside(parentDir, candidate) {
  const parent = resolve(parentDir);
  return candidate.startsWith(`${parent}\\`) || candidate.startsWith(`${parent}/`);
}

export function resolveStaticPath(pathname) {
  if (pathname === '/menu') return resolve(PUBLIC_DIR, 'menu.html');
  if (pathname === '/')     return resolve(PUBLIC_DIR, 'index.html');
  if (pathname === '/patch') return resolve(PUBLIC_DIR, 'patchUI.html');
  if (pathname === '/popup') return resolve(PUBLIC_DIR, 'patch-popup.html');

  if (hasHiddenSegment(pathname)) return null;

  if (pathname.startsWith('/src/')) {
    const candidate = resolve(ROOT_DIR, `.${pathname}`);
    const ext = extname(candidate).toLowerCase();
    if (!isPathInside(SRC_DIR, candidate) || !new Set(['.js', '.css']).has(ext)) return null;
    return candidate;
  }

  if (PATCH_SCHEMA_PATHS.has(pathname)) return resolve(ROOT_DIR, `.${pathname}`);
  return null;
}

export async function serveFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  const body = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
  res.end(body);
}

export async function handleStaticRequest(res, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath) return false;

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    await serveFile(res, filePath);
    return true;
  } catch {
    return false;
  }
}
