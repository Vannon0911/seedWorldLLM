import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runDeterministicKernel } from '../src/kernel/deterministicKernel.js';
import { sha256Hex } from '../src/kernel/fingerprint.js';

function run(scriptPath) {
  return new Promise((resolvePromise, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({
          script: scriptPath,
          status: 'passed',
          exitCode: 0,
          durationMs: Date.now() - startedAt
        });
        return;
      }
      reject(Object.assign(new Error(`${scriptPath} failed with exit code ${code}`), {
        script: scriptPath,
        status: 'failed',
        exitCode: code,
        durationMs: Date.now() - startedAt
      }));
    });
  });
}

function getCurrentCommit() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function loadGatePolicyVersion() {
  const policyPath = resolve(process.cwd(), 'src', 'llm', 'llm-gate-policy.json');
  try {
    const raw = await readFile(policyPath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed.policyVersion === 'string' ? parsed.policyVersion : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function buildDeterminismEvidence() {
  const sampleSeed = 'test-runner-seed';
  const expectedSeedHash = await sha256Hex(sampleSeed);
  const iterations = [];
  for (let i = 0; i < 3; i += 1) {
    const snapshot = await runDeterministicKernel(sampleSeed, 12, { expectedSeedHash });
    iterations.push(snapshot.mutFingerprint);
  }
  const allEqual = iterations.every((fingerprint) => fingerprint === iterations[0]);
  return {
    seed: sampleSeed,
    runs: iterations.length,
    fingerprints: iterations,
    consistent: allEqual
  };
}

function validateEvidenceShape(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    throw new Error('evidence must be an object');
  }
  const required = ['artifactSchemaVersion', 'timestamp', 'commit', 'status', 'durationMs', 'tests', 'policyVersion', 'gateDecision'];
  for (const key of required) {
    if (!(key in evidence)) {
      throw new Error(`missing evidence field: ${key}`);
    }
  }
  if (!Array.isArray(evidence.tests) || evidence.tests.length === 0) {
    throw new Error('evidence.tests must be a non-empty array');
  }
}

async function writeEvidenceArtifact(evidence) {
  const logsDir = resolve(process.cwd(), '.patch-manager', 'logs');
  await mkdir(logsDir, { recursive: true });
  const safeTimestamp = evidence.timestamp.replaceAll(':', '-').replaceAll('.', '-');
  const filePath = join(logsDir, `test-run-${safeTimestamp}.json`);
  await writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return filePath;
}

const startedAt = Date.now();
const tests = [];
let status = 'passed';
let failure = null;

for (const scriptPath of ['scripts/smoke-test.mjs', 'scripts/runtime-guards-test.mjs', 'scripts/patch-flow-test.mjs']) {
  try {
    tests.push(await run(scriptPath));
  } catch (error) {
    tests.push({
      script: error.script || scriptPath,
      status: 'failed',
      exitCode: error.exitCode ?? 1,
      durationMs: error.durationMs ?? 0,
      message: error.message
    });
    status = 'failed';
    failure = error;
    break;
  }
}

const evidence = {
  artifactSchemaVersion: '1.0.0',
  timestamp: new Date().toISOString(),
  commit: getCurrentCommit(),
  status,
  durationMs: Date.now() - startedAt,
  tests,
  policyVersion: await loadGatePolicyVersion(),
  gateDecision: tests.some((item) => item.script === 'scripts/patch-flow-test.mjs' && item.status === 'passed')
    ? 'pass_and_deny_paths_verified'
    : 'not_verified',
  determinism: await buildDeterminismEvidence()
};

validateEvidenceShape(evidence);
const artifactPath = await writeEvidenceArtifact(evidence);
if (!existsSync(artifactPath)) {
  throw new Error('test evidence artifact was not written');
}
console.log(`[test-evidence] ${artifactPath}`);

if (failure) {
  throw failure;
}
