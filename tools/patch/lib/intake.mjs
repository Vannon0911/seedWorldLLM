import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import JSZip from 'jszip';

function compareNames(a, b) {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

async function collectFiles(dir) {
  const names = await readdir(dir, { recursive: true });
  return names.filter((name) => !name.endsWith('/')).sort(compareNames);
}

function asManifest(fileName, data) {
  if (Array.isArray(data)) {
    return { source: fileName, patches: data };
  }

  if (data && Array.isArray(data.patches)) {
    return { ...data, source: fileName };
  }

  if (data && typeof data === 'object' && data.id) {
    return { source: fileName, patches: [data] };
  }

  return null;
}

export async function stageInput({ inputPath, sessionDir }) {
  const stagedInputPath = join(sessionDir, basename(inputPath));
  await copyFile(inputPath, stagedInputPath);
  return stagedInputPath;
}

export async function unpackIfZip({ stagedInputPath, sessionDir }) {
  const extension = extname(stagedInputPath).toLowerCase();
  if (extension !== '.zip') {
    return { workingDir: sessionDir, unpacked: false, files: await collectFiles(sessionDir) };
  }

  const zipBytes = await readFile(stagedInputPath);
  const zip = await JSZip.loadAsync(zipBytes);
  const pending = [];

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      continue;
    }
    const targetPath = join(sessionDir, name);
    pending.push(
      entry.async('nodebuffer').then(async (buffer) => {
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, buffer);
      })
    );
  }

  await Promise.all(pending);
  return { workingDir: sessionDir, unpacked: true, files: await collectFiles(sessionDir) };
}

export async function detectManifest({ workingDir, files }) {
  const jsonFiles = files.filter((file) => extname(file).toLowerCase() === '.json');
  const preferred = jsonFiles.filter((file) => /^patches.*\.json$/i.test(basename(file)));

  let manifestFile = null;
  if (preferred.length === 1) {
    manifestFile = preferred[0];
  } else if (preferred.length > 1) {
    const error = new Error('Manifest auto-detect found multiple preferred manifests');
    error.code = 'MANIFEST_AMBIGUOUS';
    error.details = {
      files,
      preferredFiles: preferred.sort(compareNames)
    };
    throw error;
  } else if (jsonFiles.length === 1) {
    manifestFile = jsonFiles[0];
  }

  if (!manifestFile) {
    const error = new Error('Manifest auto-detect failed');
    error.code = 'MANIFEST_NOT_FOUND';
    error.details = {
      files
    };
    throw error;
  }

  const manifestPath = join(workingDir, manifestFile);
  const raw = await readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  const manifest = asManifest(manifestFile, parsed);

  if (!manifest) {
    const error = new Error(`Unsupported manifest shape in ${manifestFile}`);
    error.code = 'MANIFEST_INVALID';
    error.details = {
      file: manifestFile
    };
    throw error;
  }

  return {
    manifestFile,
    manifestPath,
    manifest
  };
}
