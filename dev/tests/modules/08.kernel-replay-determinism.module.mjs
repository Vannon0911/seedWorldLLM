import path from "node:path";
import { pathToFileURL } from "node:url";

function buildCheckpointHashes(states, createMutFingerprint) {
  return Promise.all(
    states.map((state) =>
      createMutFingerprint({
        tick: state.tick,
        resources: state.resources,
        statistics: state.statistics
      })
    )
  );
}

function findFirstDrift(a, b) {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== b[i]) {
      return i;
    }
  }

  return a.length === b.length ? -1 : limit;
}

export const id = "08-kernel-replay-determinism";

export async function test({ assert, root }) {
  const deterministicKernel = await import(
    pathToFileURL(path.join(root, "app/src/kernel/deterministicKernel.js"))
  );
  const fingerprintModule = await import(pathToFileURL(path.join(root, "app/src/kernel/fingerprint.js")));

  const { runDeterministicKernel } = deterministicKernel;
  const { createMutFingerprint, sha256Hex } = fingerprintModule;

  const sameSeed = "replay-seed-alpha";
  const expectedSeedHash = await sha256Hex(sameSeed);

  const replayA = await runDeterministicKernel(sameSeed, 30, { expectedSeedHash });
  const replayB = await runDeterministicKernel(sameSeed, 30, { expectedSeedHash });
  const replayC = await runDeterministicKernel("replay-seed-beta", 30, {
    expectedSeedHash: await sha256Hex("replay-seed-beta")
  });

  assert.equal(replayA.seedHash, replayB.seedHash, "gleicher Seed muss denselben seedHash liefern");
  assert.equal(
    replayA.mutFingerprint,
    replayB.mutFingerprint,
    "gleicher Seed plus gleiche Tickfolge muss denselben Gesamt-Fingerprint liefern"
  );

  const checkpointHashesA = await buildCheckpointHashes(replayA.states, createMutFingerprint);
  const checkpointHashesB = await buildCheckpointHashes(replayB.states, createMutFingerprint);
  const checkpointHashesC = await buildCheckpointHashes(replayC.states, createMutFingerprint);

  assert.deepEqual(
    checkpointHashesA,
    checkpointHashesB,
    "Replay-Checkpoint-Hashes muessen fuer identische Replays exakt matchen"
  );

  const firstDriftIndex = findFirstDrift(checkpointHashesA, checkpointHashesC);
  assert.notEqual(firstDriftIndex, -1, "anderer Seed muss spaetestens an einem Checkpoint driften");
  assert.equal(replayA.states[firstDriftIndex].tick, firstDriftIndex + 1, "Drift muss auf den korrekten Tick zeigen");
}

export const run = test;
