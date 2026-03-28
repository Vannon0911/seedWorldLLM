import { runScriptTest } from "../helpers/runScriptTest.mjs";

export const id = "01-runtime-guards-script";

export async function test({ root }) {
  await runScriptTest({ root, scriptPath: "scripts/runtime-guards-test.mjs", label: id });
}

export const run = test;
