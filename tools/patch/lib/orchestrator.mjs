import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants as fsConstants, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PATCH_PHASES } from './constants.mjs';
import { createBackups, applyNormalizedManifest, rollbackBackups } from './backup.mjs';
import { stageInput, unpackIfZip, detectManifest } from './intake.mjs';
import { acquireLock, releaseLock } from './lock.mjs';
import {
  appendAudit,
  appendJsonLine,
  ensureSessionFilesystem,
  getSessionPaths,
  loadLogTail,
  readJson,
  removeCancelFlag,
  writeJson,
  writeSummary
} from './session-store.mjs';
import { classifyRisk, normalizeManifest, resolveRepoPath } from './normalize.mjs';

function isoNow() {
  return new Date().toISOString();
}

function phaseProgress(phase) {
  const index = PATCH_PHASES.indexOf(phase);
  if (index === -1) {
    return 0;
  }
  return Math.round(((index + 1) / PATCH_PHASES.length) * 100);
}

export function createStructuredError({ code, phase, message, file = null, patchId = null, details = null, suggestedFix = null }) {
  return {
    code,
    phase,
    patchId,
    file,
    message,
    details,
    suggestedFix
  };
}

async function updateStatus(statusPath, patch) {
  const current = (await readJson(statusPath, {})) || {};
  const next = {
    ...current,
    ...patch,
    updatedAt: isoNow()
  };
  await writeJson(statusPath, next);
  return next;
}

async function writeLog(logPath, payload) {
  await appendJsonLine(logPath, {
    ts: isoNow(),
    ...payload
  });
}

async function setPhase(paths, phase, extra = {}) {
  await updateStatus(paths.statusPath, {
    phase,
    progress: phaseProgress(phase),
    ...extra
  });
  await writeLog(paths.logPath, {
    type: 'phase',
    phase,
    ...extra
  });
}

async function checkCancelled(paths, phase) {
  if (existsSync(paths.cancelPath)) {
    const error = new Error('Session cancel requested');
    error.code = 'SESSION_CANCELLED';
    error.phase = phase;
    throw error;
  }
}

function buildSummary(status, backupOutcome = null) {
  const lines = [
    `sessionId: ${status.sessionId}`,
    `actor: ${status.actor}`,
    `finalStatus: ${status.finalStatus}`,
    `phase: ${status.phase}`,
    `risk: ${status.risk?.risk || 'unknown'}`,
    `applied: ${status.result?.appliedCount || 0}`,
    `skipped: ${status.result?.skippedCount || 0}`
  ];

  if (status.error) {
    lines.push(`error.code: ${status.error.code}`);
    lines.push(`error.phase: ${status.error.phase}`);
    lines.push(`error.message: ${status.error.message}`);
  }

  if (backupOutcome) {
    lines.push(`rollback.restored: ${backupOutcome.restored.length}`);
    lines.push(`rollback.failed: ${backupOutcome.failed.length}`);
  }

  lines.push(`logPath: ${status.logPath}`);
  lines.push(`summaryPath: ${status.summaryPath}`);
  return lines.join('\n');
}

async function runCommand(command, args, cwd) {
  return new Promise((resolvePromise) => {
    const effectiveCommand = process.platform === 'win32' && command === 'npm' ? `npm ${args.join(' ')}` : command;
    const effectiveArgs = process.platform === 'win32' && command === 'npm' ? [] : args;
    const child = spawn(effectiveCommand, effectiveArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolvePromise({
        success: code === 0,
        code,
        stdout,
        stderr
      });
    });
  });
}

async function verifyOutputs(rootDir, normalizedManifest) {
  for (const patch of normalizedManifest.patches) {
    const target = resolveRepoPath(rootDir, patch.targetFile);
    if (patch.operation === 'delete') {
      continue;
    }
    await access(target, fsConstants.F_OK);
  }
}

export async function runPatchSession({
  rootDir,
  inputPath,
  actor = 'terminal',
  sessionId,
  runTests = true
}) {
  const paths = await ensureSessionFilesystem(rootDir, sessionId);
  await removeCancelFlag(paths.cancelPath);

  const baseStatus = {
    sessionId,
    actor,
    phase: 'intake',
    progress: 0,
    state: 'running',
    finalStatus: null,
    lock: null,
    startedAt: isoNow(),
    updatedAt: isoNow(),
    endedAt: null,
    inputPath,
    logPath: paths.logPath,
    summaryPath: paths.summaryPath,
    result: null,
    error: null,
    currentFile: null,
    currentPatchId: null,
    risk: null
  };

  await writeJson(paths.statusPath, baseStatus);
  await writeLog(paths.logPath, {
    type: 'session-start',
    sessionId,
    actor,
    inputPath
  });

  let lockHandle = null;
  let backupManifest = [];
  let backupOutcome = null;
  let outcomeStatus = null;

  try {
    await setPhase(paths, 'intake');
    const stagedInputPath = await stageInput({ inputPath, sessionDir: paths.sessionDir });
    await checkCancelled(paths, 'intake');

    await setPhase(paths, 'unpack', { currentFile: basename(stagedInputPath) });
    const unpackResult = await unpackIfZip({ stagedInputPath, sessionDir: paths.sessionDir });
    await writeLog(paths.logPath, {
      type: 'intake',
      unpacked: unpackResult.unpacked,
      files: unpackResult.files
    });
    await checkCancelled(paths, 'unpack');

    await setPhase(paths, 'manifest-validate');
    const manifestResult = await detectManifest({
      workingDir: unpackResult.workingDir,
      files: unpackResult.files
    });
    await updateStatus(paths.statusPath, {
      currentFile: manifestResult.manifestFile
    });
    await writeLog(paths.logPath, {
      type: 'manifest',
      file: manifestResult.manifestFile
    });

    await setPhase(paths, 'normalize');
    const normalizedManifest = normalizeManifest(manifestResult.manifest);
    await writeJson(resolve(paths.sessionDir, 'normalized-manifest.json'), normalizedManifest);
    await checkCancelled(paths, 'normalize');

    await setPhase(paths, 'risk-classify');
    const risk = classifyRisk(normalizedManifest);
    await updateStatus(paths.statusPath, { risk });
    await writeLog(paths.logPath, {
      type: 'risk',
      risk
    });

    await setPhase(paths, 'acquire-lock');
    lockHandle = await acquireLock({
      rootDir,
      lockPath: paths.lockPath,
      sessionId,
      actor
    });
    await updateStatus(paths.statusPath, { lock: lockHandle.lock });

    await setPhase(paths, 'llm-gates');
    await writeLog(paths.logPath, {
      type: 'llm-gates',
      decision: 'pass',
      reason: 'terminal-authority-cli'
    });
    await checkCancelled(paths, 'llm-gates');

    await setPhase(paths, 'backup');
    backupManifest = await createBackups({
      rootDir,
      backupManifestPath: paths.backupManifestPath,
      backupsDir: paths.backupsDir,
      sessionId,
      patches: normalizedManifest.patches
    });

    await setPhase(paths, 'apply');
    const applied = await applyNormalizedManifest({
      rootDir,
      patches: normalizedManifest.patches
    });
    await updateStatus(paths.statusPath, {
      result: {
        appliedCount: applied.length,
        skippedCount: 0,
        applied
      }
    });
    await checkCancelled(paths, 'apply');

    await setPhase(paths, 'verify');
    await verifyOutputs(rootDir, normalizedManifest);
    await checkCancelled(paths, 'verify');

    await setPhase(paths, 'test');
    let testResult = {
      success: true,
      code: 0,
      stdout: '',
      stderr: ''
    };
    if (runTests) {
      testResult = await runCommand('npm', ['test'], rootDir);
      await writeLog(paths.logPath, {
        type: 'test',
        success: testResult.success,
        code: testResult.code,
        stdout: testResult.stdout.trim(),
        stderr: testResult.stderr.trim()
      });
      if (!testResult.success) {
        const error = new Error('Regression test failed');
        error.code = 'TEST_FAILED';
        error.phase = 'test';
        error.details = {
          code: testResult.code
        };
        throw error;
      }
    }

    await setPhase(paths, 'finalize');
    outcomeStatus = await updateStatus(paths.statusPath, {
      state: 'finished',
      finalStatus: 'succeeded',
      endedAt: isoNow(),
      progress: 100,
      result: {
        ...(await readJson(paths.statusPath)).result,
        test: testResult
      }
    });
    await writeSummary(paths.summaryPath, buildSummary(outcomeStatus));
    await appendAudit(rootDir, {
      ts: isoNow(),
      type: 'session-finished',
      sessionId,
      actor,
      finalStatus: 'succeeded'
    });
  } catch (error) {
    const phase = error.phase || (await readJson(paths.statusPath, baseStatus)).phase || 'finalize';
    const structuredError = createStructuredError({
      code: error.code || 'PATCH_APPLY_FAILED',
      phase,
      file: error.details?.file || null,
      patchId: error.details?.patchId || null,
      message: error.message,
      details: error.details || null,
      suggestedFix: error.code === 'MANIFEST_NOT_FOUND'
        ? 'Provide a zip or json input containing patches*.json or one unambiguous manifest json.'
        : error.code === 'MANIFEST_AMBIGUOUS'
          ? 'Keep exactly one preferred patches*.json manifest in the input or rename the extras.'
        : error.code === 'LOCK_HELD'
          ? 'Wait for the active session to finish or let the lock expire before retrying.'
          : error.code === 'PATCH_PATH_INVALID'
            ? 'Use only repo-relative target paths without .. segments, absolute roots, or drive prefixes.'
          : error.code === 'SESSION_CANCELLED'
            ? 'Retry with a fresh session if you still want to apply the patch.'
            : 'Inspect the session logs and summary for the failing file or patch.'
    });

    backupOutcome = backupManifest.length > 0
      ? await rollbackBackups({
          rootDir,
          backupManifest
        })
      : { restored: [], failed: [] };

    const finalStatus = backupOutcome.failed.length === 0 ? 'failed_rolled_back' : 'failed_partial';
    outcomeStatus = await updateStatus(paths.statusPath, {
      state: 'finished',
      finalStatus,
      endedAt: isoNow(),
      error: structuredError,
      result: {
        ...(await readJson(paths.statusPath)).result,
        rollback: backupOutcome
      }
    });

    await writeLog(paths.logPath, {
      type: 'error',
      error: structuredError
    });
    await writeSummary(paths.summaryPath, buildSummary(outcomeStatus, backupOutcome));
    await appendAudit(rootDir, {
      ts: isoNow(),
      type: 'session-failed',
      sessionId,
      actor,
      finalStatus,
      error: structuredError
    });

  } finally {
    await setPhase(paths, 'release-lock');
    if (lockHandle) {
      await releaseLock({
        lockPath: paths.lockPath,
        heartbeat: lockHandle.heartbeat
      });
    }
    const current = await readJson(paths.statusPath, baseStatus);
    await updateStatus(paths.statusPath, {
      lock: null,
      phase: 'release-lock'
    });
  }

  return readJson(paths.statusPath, outcomeStatus || baseStatus);
}

export async function readSessionStatus(rootDir, sessionId) {
  const paths = getSessionPaths(rootDir, sessionId);
  return readJson(paths.statusPath, null);
}

export async function readSessionLogs(rootDir, sessionId, limit = 100) {
  const paths = getSessionPaths(rootDir, sessionId);
  return {
    sessionId,
    logPath: paths.logPath,
    summaryPath: paths.summaryPath,
    lines: await loadLogTail(paths.logPath, limit)
  };
}
