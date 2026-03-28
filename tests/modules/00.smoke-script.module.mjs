import { runScriptTest } from "../helpers/runScriptTest.mjs";

export const id = "00-smoke-script";

export async function test({ root }) {
  await runScriptTest({ root, scriptPath: "scripts/smoke-test.mjs", label: id });
}

export const run = test;
