import { isAbsolute, posix as pathPosix, resolve, sep } from 'node:path';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function invalidPatchPath(filePath, message) {
  const error = new Error(message);
  error.code = 'PATCH_PATH_INVALID';
  error.details = {
    file: String(filePath || '')
  };
  return error;
}

function normalizeCaseForCompare(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

export function normalizeFilePath(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) {
    throw invalidPatchPath(filePath, 'Patch path must not be empty');
  }

  if (raw.startsWith('/') || raw.startsWith('\\') || isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) {
    throw invalidPatchPath(filePath, 'Patch path must stay inside the repository');
  }

  const normalized = pathPosix.normalize(raw.replaceAll('\\', '/'));
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw invalidPatchPath(filePath, 'Patch path traversal is not allowed');
  }

  return normalized.replace(/^\/+/, '');
}

export function resolveRepoPath(rootDir, filePath) {
  const normalizedPath = normalizeFilePath(filePath);
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(resolvedRoot, normalizedPath);
  const compareRoot = normalizeCaseForCompare(resolvedRoot);
  const compareTarget = normalizeCaseForCompare(resolvedTarget);
  const compareRootPrefix = normalizeCaseForCompare(`${resolvedRoot}${sep}`);

  if (compareTarget === compareRoot || !compareTarget.startsWith(compareRootPrefix)) {
    throw invalidPatchPath(filePath, 'Patch path resolved outside the repository');
  }

  return resolvedTarget;
}

function stablePatchId(patch, index) {
  if (patch.id && typeof patch.id === 'string') {
    return patch.id.trim();
  }
  return `patch-${String(index + 1).padStart(3, '0')}`;
}

function normalizeKernelPatch(patch, index) {
  const normalizedPatch = clone(patch);
  normalizedPatch.id = stablePatchId(normalizedPatch, index);
  normalizedPatch.version = normalizedPatch.version || '1.0.0';
  return {
    id: normalizedPatch.id,
    kind: 'kernel-patch',
    targetFile: `patches/${normalizedPatch.id}.json`,
    patch: normalizedPatch,
    operation: 'write'
  };
}

function normalizeFilePatch(patch, index) {
  const id = stablePatchId(patch, index);
  const operation = patch.operation || patch.op || 'write';
  const file = normalizeFilePath(patch.file || patch.path);

  return {
    id,
    kind: 'file',
    targetFile: file,
    operation,
    content: typeof patch.content === 'string' ? patch.content : '',
    description: patch.description || ''
  };
}

function toNormalizedPatch(patch, index) {
  if (patch && typeof patch === 'object' && patch.hooks) {
    return normalizeKernelPatch(patch, index);
  }

  if (patch && typeof patch === 'object' && (patch.file || patch.path)) {
    return normalizeFilePatch(patch, index);
  }

  const error = new Error(`Unsupported patch entry at index ${index}`);
  error.code = 'PATCH_NORMALIZE_UNSUPPORTED';
  error.details = {
    index
  };
  throw error;
}

function ensureNoConflicts(items) {
  const seen = new Map();

  for (const item of items) {
    const key = `${item.targetFile}:${item.operation}`;
    if (seen.has(key)) {
      const error = new Error(`Conflicting operation for ${item.targetFile}`);
      error.code = 'PATCH_CONFLICT';
      error.details = {
        file: item.targetFile,
        patchId: item.id,
        previousPatchId: seen.get(key)
      };
      throw error;
    }

    if (seen.has(`${item.targetFile}:delete`) || (item.operation === 'delete' && Array.from(seen.keys()).some((candidate) => candidate.startsWith(`${item.targetFile}:`)))) {
      const error = new Error(`Incompatible operations for ${item.targetFile}`);
      error.code = 'PATCH_CONFLICT';
      error.details = {
        file: item.targetFile,
        patchId: item.id
      };
      throw error;
    }

    seen.set(key, item.id);
  }
}

export function normalizeManifest(manifest) {
  const patches = Array.isArray(manifest?.patches) ? manifest.patches : [];
  const normalized = patches
    .map((patch, index) => toNormalizedPatch(patch, index))
    .sort((a, b) => {
      if (a.targetFile !== b.targetFile) {
        return a.targetFile.localeCompare(b.targetFile, 'en', { sensitivity: 'base' });
      }
      return a.id.localeCompare(b.id, 'en', { sensitivity: 'base' });
    });

  ensureNoConflicts(normalized);

  return {
    version: '1',
    source: manifest.source || null,
    patches: normalized
  };
}

export function classifyRisk(normalizedManifest) {
  let risk = 'low';
  const reasons = [];

  for (const patch of normalizedManifest.patches) {
    if (patch.operation === 'delete') {
      risk = 'high';
      reasons.push(`delete:${patch.targetFile}`);
      continue;
    }

    if (!patch.targetFile.startsWith('patches/')) {
      if (patch.targetFile.startsWith('src/') || patch.targetFile.startsWith('package')) {
        risk = 'medium';
      } else {
        risk = risk === 'high' ? 'high' : 'medium';
      }
      reasons.push(`write:${patch.targetFile}`);
    }
  }

  return {
    risk,
    reasons
  };
}
