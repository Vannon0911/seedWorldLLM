import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "03-kernel-same-action-same-tick";

export async function test({ assert, root }) {
  const kernelModule = await import(pathToFileURL(path.join(root, "src/kernel/KernelController.js")));
  const { KernelController } = kernelModule;

  const kernel = new KernelController({ seed: "same-action-seed" });
  const init = await kernel.execute({ domain: "game", action: { type: "createInitialState" } });

  const baseState = {
    ...init.result,
    clock: { ...init.result.clock, tick: 11 },
    resources: { ...init.result.resources, ore: 700 },
    structures: new Map(init.result.structures || [])
  };

  const action = {
    domain: "game",
    action: {
      type: "placeStructure",
      x: 5,
      y: 2,
      structureId: "mine",
      state: baseState
    }
  };

  const r1 = await kernel.execute(action);
  const r2 = await kernel.execute(action);

  const a = {
    tick: r1.result.clock.tick,
    ore: r1.result.resources.ore,
    structure: r1.result.structures.get("5,2")
  };
  const b = {
    tick: r2.result.clock.tick,
    ore: r2.result.resources.ore,
    structure: r2.result.structures.get("5,2")
  };

  assert.deepEqual(a, b, "same action on same tick must produce identical result");
}

export const run = test;
