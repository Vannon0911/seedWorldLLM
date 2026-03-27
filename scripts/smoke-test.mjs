import { strict as assert } from 'node:assert';
import { UIPluginController } from '../src/kernel/UIPluginController.js';

class KernelStub {
  getCurrentTick() {
    return 0;
  }
}

function verifyDeterministicRng() {
  const controller = new UIPluginController(new KernelStub());
  controller.deterministicSeed = 'smoke-seed';

  const rng = controller.createDeterministicRNG();
  const value = rng.randint(1, 3);
  assert.equal(Number.isInteger(value), true, 'randint() must return an integer');
  assert.equal(value >= 1 && value <= 3, true, 'randint() must stay in range');

  const choice = rng.choice(['a', 'b', 'c']);
  assert.equal(['a', 'b', 'c'].includes(choice), true, 'choice() must pick from array');
}

async function verifyServerModulesLoad() {
  await import('../patchServer.mjs');
}

verifyDeterministicRng();
await verifyServerModulesLoad();
console.log('[smoke-test] ok');
