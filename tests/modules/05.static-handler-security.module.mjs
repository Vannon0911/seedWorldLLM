import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "05-static-handler-security";

export async function test({ assert, root }) {
  const mod = await import(pathToFileURL(path.join(root, "server/staticHandler.mjs")).href);
  const { resolveStaticPath } = mod;

  const patchUi = resolveStaticPath("/patch");
  assert.equal(typeof patchUi, "string");
  assert.equal(path.basename(patchUi), "patchUI.html");

  const stylePath = resolveStaticPath("/src/styles.css");
  assert.equal(typeof stylePath, "string");
  assert.equal(path.basename(stylePath), "styles.css");

  const hiddenDotGit = resolveStaticPath("/.git/config");
  assert.equal(hiddenDotGit, null);

  const hiddenSegment = resolveStaticPath("/src/.secrets/keys.js");
  assert.equal(hiddenSegment, null);

  const disallowedExt = resolveStaticPath("/src/app.json");
  assert.equal(disallowedExt, null);

  const traversalAttempt = resolveStaticPath("/src/../package.json");
  assert.equal(traversalAttempt, null);
}

export const run = test;
