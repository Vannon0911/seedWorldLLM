import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { detectManifest } from '../tools/patch/lib/intake.mjs';
import { classifyRisk, normalizeManifest } from '../tools/patch/lib/normalize.mjs';
import { acquireLock, releaseLock } from '../tools/patch/lib/lock.mjs';
import { LOCK_HEARTBEAT_MS } from '../tools/patch/lib/constants.mjs';
import { ensureSessionFilesystem, getSessionPaths, writeJson } from '../tools/patch/lib/session-store.mjs';
import { runPatchSession } from '../tools/patch/lib/orchestrator.mjs';
import { PatchServer } from '../patchServer.mjs';

async function createTempRepo() {
  return mkdtemp(join(tmpdir(), 'seedworld-patch-'));
}

async function ensureGatePolicy(repo) {
  await mkdir(join(repo, 'docs'), { recursive: true });
  await writeJson(join(repo, 'docs', 'llm-gate-policy.json'), {
    policyVersion: '1.0.0-test',
    allowedPatchKinds: ['kernel-patch', 'file'],
    allowedFileWritePrefixes: ['patches/'],
    forbiddenOperations: ['delete'],
    forbiddenKernelSchemaTypes: ['debug'],
    maxRisk: 'medium',
    requiredKernelValidationFlags: ['deterministic']
  });
}

async function testManifestDetectionError() {
  const repo = await createTempRepo();
  const workingDir = join(repo, 'session');
  await mkdir(workingDir, { recursive: true });
  await writeFile(join(workingDir, 'notes.txt'), 'no manifest here', 'utf8');

  let thrown = null;
  try {
    await detectManifest({
      workingDir,
      files: ['notes.txt']
    });
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown?.code, 'MANIFEST_NOT_FOUND');
  assert.deepEqual(thrown?.details?.files, ['notes.txt']);
}

async function testNormalizationDeterminism() {
  const normalized = normalizeManifest({
    patches: [
      { id: 'b', path: 'docs/two.txt', content: '2' },
      { id: 'a', hooks: { advanceTick: { code: 'return state;' } }, version: '1.0.0' }
    ]
  });

  assert.equal(normalized.patches[0].id, 'b');
  assert.equal(normalized.patches[1].id, 'a');
  assert.equal(classifyRisk(normalized).risk, 'medium');
}

async function testLocking() {
  const repo = await createTempRepo();
  const paths = await ensureSessionFilesystem(repo, 'lock-test');
  const first = await acquireLock({
    rootDir: repo,
    lockPath: paths.lockPath,
    sessionId: 'lock-test',
    actor: 'tester'
  });

  let thrown = null;
  try {
    await acquireLock({
      rootDir: repo,
      lockPath: paths.lockPath,
      sessionId: 'lock-test-2',
      actor: 'tester'
    });
  } catch (error) {
    thrown = error;
  }
  assert.equal(thrown?.code, 'LOCK_HELD');

  await releaseLock({
    lockPath: paths.lockPath,
    heartbeat: first.heartbeat,
    ownership: first.ownership
  });

  await writeJson(paths.lockPath, {
    pid: 1,
    startedAt: new Date(0).toISOString(),
    heartbeatAt: new Date(0).toISOString(),
    expiresAt: new Date(0).toISOString(),
    sessionId: 'stale',
    actor: 'old',
    ownerNonce: 'old-owner'
  });

  const second = await acquireLock({
    rootDir: repo,
    lockPath: paths.lockPath,
    sessionId: 'fresh',
    actor: 'tester'
  });
  assert.equal(second.lock.sessionId, 'fresh');

  await releaseLock({
    lockPath: paths.lockPath,
    ownership: {
      sessionId: 'stale',
      ownerNonce: 'old-owner'
    }
  });
  const currentLock = JSON.parse(await readFile(paths.lockPath, 'utf8'));
  assert.equal(currentLock.sessionId, 'fresh');

  await releaseLock({
    lockPath: paths.lockPath,
    heartbeat: second.heartbeat,
    ownership: second.ownership
  });

  const third = await acquireLock({
    rootDir: repo,
    lockPath: paths.lockPath,
    sessionId: 'heartbeat-owner',
    actor: 'tester'
  });
  await writeJson(paths.lockPath, {
    pid: 9,
    sessionId: 'stolen-lock',
    actor: 'other',
    ownerNonce: 'other-owner',
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, LOCK_HEARTBEAT_MS + 300));
  const auditRaw = await readFile(join(repo, '.patch-manager', 'audit.jsonl'), 'utf8');
  assert.ok(auditRaw.includes('"type":"lock-heartbeat-stopped"'));
  await releaseLock({
    rootDir: repo,
    lockPath: paths.lockPath,
    heartbeat: third.heartbeat,
    ownership: third.ownership,
    actor: 'tester'
  });
}

async function testManifestAmbiguityFailsClosed() {
  const repo = await createTempRepo();
  const workingDir = join(repo, 'session');
  await mkdir(workingDir, { recursive: true });
  await writeJson(join(workingDir, 'patches-a.json'), { patches: [] });
  await writeJson(join(workingDir, 'patches-b.json'), { patches: [] });

  let thrown = null;
  try {
    await detectManifest({
      workingDir,
      files: ['patches-a.json', 'patches-b.json']
    });
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown?.code, 'MANIFEST_AMBIGUOUS');
  assert.deepEqual(thrown?.details?.preferredFiles, ['patches-a.json', 'patches-b.json']);
}

async function testZipSessionSuccess() {
  const repo = await createTempRepo();
  await mkdir(join(repo, 'patches'), { recursive: true });
  await ensureGatePolicy(repo);
  await writeJson(join(repo, 'package.json'), {
    name: 'temp-repo',
    private: true,
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  });

  const zip = new JSZip();
  zip.file('patches-bundle.json', JSON.stringify({
    patches: [
      {
        id: 'zip-demo',
        version: '1.0.0',
        schema: { type: 'gameplay' },
        validation: { deterministic: true },
        hooks: {
          advanceTick: {
            code: 'return state;'
          }
        }
      }
    ]
  }, null, 2));

  const inputPath = join(repo, 'bundle.zip');
  await writeFile(inputPath, await zip.generateAsync({ type: 'nodebuffer' }));

  const status = await runPatchSession({
    rootDir: repo,
    inputPath,
    actor: 'test',
    sessionId: 'zip-success',
    runTests: true
  });

  assert.equal(status.finalStatus, 'succeeded');
  const written = JSON.parse(await readFile(join(repo, 'patches', 'zip-demo.json'), 'utf8'));
  assert.equal(written.id, 'zip-demo');
  assert.equal(status.llmGate?.decision, 'pass');
}

async function testRollbackAfterFailingTests() {
  const repo = await createTempRepo();
  await mkdir(join(repo, 'patches'), { recursive: true });
  await ensureGatePolicy(repo);
  await writeJson(join(repo, 'package.json'), {
    name: 'temp-repo',
    private: true,
    scripts: {
      test: 'node -e "process.exit(1)"'
    }
  });

  const inputPath = join(repo, 'patches.json');
  await writeJson(inputPath, {
    patches: [
      {
        id: 'rollback-kernel',
        version: '1.0.0',
        schema: { type: 'gameplay' },
        validation: { deterministic: true },
        hooks: {
          advanceTick: { code: 'return state;' }
        }
      }
    ]
  });

  const status = await runPatchSession({
    rootDir: repo,
    inputPath,
    actor: 'test',
    sessionId: 'rollback-failure',
    runTests: true
  });

  assert.equal(status.finalStatus, 'failed_rolled_back');
  let exists = true;
  try {
    await readFile(join(repo, 'patches', 'rollback-kernel.json'), 'utf8');
  } catch {
    exists = false;
  }
  assert.equal(exists, false);
}

async function testPathTraversalIsRejected() {
  const repo = await createTempRepo();
  await ensureGatePolicy(repo);
  await writeJson(join(repo, 'package.json'), {
    name: 'temp-repo',
    private: true,
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  });

  const escapedPath = join(repo, '..', 'escaped.txt');
  await rm(escapedPath, { force: true });

  const inputPath = join(repo, 'patches.json');
  await writeJson(inputPath, {
    patches: [
      {
        id: 'escape-attempt',
        path: '../escaped.txt',
        operation: 'write',
        content: 'nope'
      }
    ]
  });

  const status = await runPatchSession({
    rootDir: repo,
    inputPath,
    actor: 'test',
    sessionId: 'path-traversal',
    runTests: true
  });

  assert.equal(status.finalStatus, 'failed_rolled_back');
  assert.equal(status.error?.code, 'PATCH_PATH_INVALID');
  let escapedExists = true;
  try {
    await readFile(escapedPath, 'utf8');
  } catch {
    escapedExists = false;
  }
  assert.equal(escapedExists, false);
}

async function testLlmGateDeny() {
  const repo = await createTempRepo();
  await ensureGatePolicy(repo);
  await writeJson(join(repo, 'package.json'), {
    name: 'temp-repo',
    private: true,
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  });
  await writeFile(join(repo, 'notes.txt'), 'orig', 'utf8');

  const inputPath = join(repo, 'patches.json');
  await writeJson(inputPath, {
    patches: [
      {
        id: 'forbidden-file-write',
        kind: 'file',
        path: 'notes.txt',
        operation: 'write',
        content: 'x'
      }
    ]
  });

  const status = await runPatchSession({
    rootDir: repo,
    inputPath,
    actor: 'test',
    sessionId: 'llm-gate-deny',
    runTests: true
  });

  assert.equal(status.finalStatus, 'failed_rolled_back');
  assert.equal(status.error?.code, 'LLM_GATE_DENIED');
  assert.equal(status.llmGate?.decision, 'deny');
}

async function testPatchServerLegacyApisRemoved() {
  const server = new PatchServer(0);
  await server.listen();
  const port = server.server.address().port;

  const removed = await fetch(`http://127.0.0.1:${port}/api/patches`);
  const removedHooks = await fetch(`http://127.0.0.1:${port}/api/hooks`);
  const patchUi = await fetch(`http://127.0.0.1:${port}/patch`);
  const dotGit = await fetch(`http://127.0.0.1:${port}/.git/config`);
  const readme = await fetch(`http://127.0.0.1:${port}/README.md`);
  const styles = await fetch(`http://127.0.0.1:${port}/src/styles.css`);

  assert.equal(removed.status, 404);
  assert.equal(removedHooks.status, 404);
  assert.equal(patchUi.status, 200);
  assert.equal(dotGit.status, 404);
  assert.equal(readme.status, 404);
  assert.equal(styles.status, 200);

  await server.close();
}

async function testPatchServerCancelAuthAndRateLimit() {
  const rootDir = process.cwd();
  const sessionId = `cancel-test-${Date.now().toString(36)}`;
  const token = 'cancel-token-123';
  const paths = getSessionPaths(rootDir, sessionId);
  await ensureSessionFilesystem(rootDir, sessionId);
  await writeJson(paths.statusPath, {
    sessionId,
    phase: 'apply',
    state: 'running',
    finalStatus: null,
    cancelToken: token
  });
  await rm(paths.cancelPath, { force: true });

  const server = new PatchServer(0);
  await server.listen();
  const port = server.server.address().port;

  const missingToken = await fetch(`http://127.0.0.1:${port}/api/patch-sessions/${sessionId}/cancel`, {
    method: 'POST'
  });
  assert.equal(missingToken.status, 403);

  const wrongToken = await fetch(`http://127.0.0.1:${port}/api/patch-sessions/${sessionId}/cancel`, {
    method: 'POST',
    headers: { 'X-Patch-Cancel-Token': 'wrong' }
  });
  assert.equal(wrongToken.status, 403);

  const okBodyToken = await fetch(`http://127.0.0.1:${port}/api/patch-sessions/${sessionId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancelToken: token })
  });
  assert.equal(okBodyToken.status, 202);
  const okBodyPayload = await okBodyToken.json();
  assert.equal(okBodyPayload.alreadyRequested, false);

  const idempotent = await fetch(`http://127.0.0.1:${port}/api/patch-sessions/${sessionId}/cancel`, {
    method: 'POST',
    headers: { 'X-Patch-Cancel-Token': token }
  });
  assert.equal(idempotent.status, 202);
  const idempotentPayload = await idempotent.json();
  assert.equal(idempotentPayload.alreadyRequested, true);
  assert.equal(typeof idempotentPayload.cancelControl?.count, 'number');

  const rateSession = `cancel-rate-${Date.now().toString(36)}`;
  const ratePaths = getSessionPaths(rootDir, rateSession);
  await ensureSessionFilesystem(rootDir, rateSession);
  await writeJson(ratePaths.statusPath, {
    sessionId: rateSession,
    phase: 'apply',
    state: 'running',
    finalStatus: null,
    cancelToken: 'rate-token'
  });
  await rm(ratePaths.cancelPath, { force: true });

  let lastStatus = 0;
  for (let i = 0; i < 2; i += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/api/patch-sessions/${rateSession}/cancel`, {
      method: 'POST',
      headers: { 'X-Patch-Cancel-Token': 'wrong' }
    });
    lastStatus = response.status;
  }
  assert.equal(lastStatus, 403);

  await server.close();
  const restartedServer = new PatchServer(0);
  await restartedServer.listen();
  const restartedPort = restartedServer.server.address().port;

  for (let i = 0; i < 3; i += 1) {
    const response = await fetch(`http://127.0.0.1:${restartedPort}/api/patch-sessions/${rateSession}/cancel`, {
      method: 'POST',
      headers: { 'X-Patch-Cancel-Token': 'wrong' }
    });
    lastStatus = response.status;
  }
  assert.equal(lastStatus, 429);

  await restartedServer.close();
  await rm(paths.statusPath, { force: true });
  await rm(paths.cancelPath, { force: true });
  await rm(paths.logPath, { force: true });
  await rm(paths.summaryPath, { force: true });
  await rm(paths.sessionDir, { recursive: true, force: true });
  await rm(ratePaths.statusPath, { force: true });
  await rm(ratePaths.cancelPath, { force: true });
  await rm(ratePaths.logPath, { force: true });
  await rm(ratePaths.summaryPath, { force: true });
  await rm(ratePaths.sessionDir, { recursive: true, force: true });
}

await testManifestDetectionError();
await testManifestAmbiguityFailsClosed();
await testNormalizationDeterminism();
await testLocking();
await testZipSessionSuccess();
await testRollbackAfterFailingTests();
await testPathTraversalIsRejected();
await testLlmGateDeny();
await testPatchServerLegacyApisRemoved();
await testPatchServerCancelAuthAndRateLimit();

console.log('[patch-flow-test] ok');
