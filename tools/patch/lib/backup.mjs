import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveRepoPath } from './normalize.mjs';
import { writeJson } from './session-store.mjs';

function backupName(index, filePath) {
  return `${String(index).padStart(3, '0')}-${filePath.replaceAll(/[\\/]/g, '__')}`;
}

export async function createBackups({ rootDir, backupManifestPath, backupsDir, sessionId, patches }) {
  const manifest = [];
  const sessionBackupDir = join(backupsDir, sessionId);
  await mkdir(sessionBackupDir, { recursive: true });

  for (const [index, patch] of patches.entries()) {
    const absolutePath = resolveRepoPath(rootDir, patch.targetFile);
    const existed = existsSync(absolutePath);
    const backupPath = join(sessionBackupDir, backupName(index, patch.targetFile));

    if (existed) {
      await mkdir(dirname(backupPath), { recursive: true });
      await copyFile(absolutePath, backupPath);
    }

    manifest.push({
      patchId: patch.id,
      targetFile: patch.targetFile,
      existed,
      backupPath: existed ? backupPath : null
    });
  }

  await writeJson(backupManifestPath, manifest);
  return manifest;
}

export async function applyNormalizedManifest({ rootDir, patches }) {
  const applied = [];

  for (const patch of patches) {
    const absolutePath = resolveRepoPath(rootDir, patch.targetFile);
    if (patch.operation === 'delete') {
      if (existsSync(absolutePath)) {
        await rm(absolutePath, { force: true });
      }
      applied.push({ patchId: patch.id, targetFile: patch.targetFile, operation: 'delete' });
      continue;
    }

    await mkdir(dirname(absolutePath), { recursive: true });
    if (patch.kind === 'kernel-patch') {
      await writeFile(absolutePath, `${JSON.stringify(patch.patch, null, 2)}\n`, 'utf8');
    } else {
      await writeFile(absolutePath, patch.content, 'utf8');
    }

    applied.push({ patchId: patch.id, targetFile: patch.targetFile, operation: patch.operation });
  }

  return applied;
}

export async function rollbackBackups({ rootDir, backupManifest }) {
  const restored = [];
  const failed = [];

  for (const entry of backupManifest) {
    const targetPath = resolveRepoPath(rootDir, entry.targetFile);
    try {
      if (entry.existed && entry.backupPath) {
        const content = await readFile(entry.backupPath);
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, content);
      } else if (existsSync(targetPath)) {
        await rm(targetPath, { force: true });
      }
      restored.push(entry.targetFile);
    } catch (error) {
      failed.push({
        targetFile: entry.targetFile,
        message: error.message
      });
    }
  }

  return {
    restored,
    failed
  };
}
