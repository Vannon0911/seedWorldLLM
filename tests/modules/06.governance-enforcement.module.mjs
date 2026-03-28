import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "06-governance-enforcement";

export async function test({ assert, root }) {
  const kernelModule = await import(pathToFileURL(path.join(root, "src/kernel/KernelController.js")).href);
  const registryModule = await import(pathToFileURL(path.join(root, "src/kernel/ActionRegistry.js")).href);

  const { KernelController } = kernelModule;
  const { ActionRegistry } = registryModule;

  const registry = new ActionRegistry();
  assert.throws(
    () => {
      registry.register({
        domain: "game",
        actionType: "brokenAction",
        handler: () => ({ ok: true })
      });
    },
    /requiredGate/i,
    "registry must reject actions without requiredGate"
  );

  const sampleRegistry = new ActionRegistry();
  sampleRegistry.register({
    domain: "kernel",
    actionType: "status",
    requiredGate: "kernel.action",
    validator: () => ({ valid: true }),
    handler: () => ({ ok: true })
  });
  assert.throws(
    () => sampleRegistry.verifyAgainstGates(["game.action"]),
    /nicht gefunden/i,
    "verify must fail when requiredGate is missing in gate set"
  );

  const kernel = new KernelController({ seed: "gov-enforce-seed", governanceMode: "enforce" });
  const known = await kernel.execute({
    domain: "game",
    action: { type: "createInitialState" }
  });
  assert.equal(known.success, true, "known mapped action must pass");

  await assert.rejects(
    () =>
      kernel.execute({
        domain: "game",
        action: { type: "activateNewFeature" }
      }),
    (error) => {
      assert.equal(error.code, "ACTION_NOT_REGISTERED");
      assert.equal(typeof error.auditId, "string");
      return true;
    },
    "unknown action must be denied with governance error"
  );
}

export const run = test;
