import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const id = "04-patch-utils";

export async function test({ assert, root }) {
  const patchUtils = await import(pathToFileURL(path.join(root, "server", "patchUtils.js")).href);
  const {
    parseUniversalPatch,
    snapshotFiles,
    validateAgainstLocks,
    classifyPatchRisk
  } = patchUtils;

  const single = parseUniversalPatch({
    patch: { id: "p1", type: "string-replace", file: "docs/a.md" }
  });
  assert.equal(single.kind, "browser-patch");
  assert.deepEqual(single.affectedFiles, ["docs/a.md"]);

  const manifest = parseUniversalPatch({
    meta: { id: "bundle-1" },
    patches: [
      { id: "a", file: "src/a.js" },
      { id: "b", file: "src/b.js" },
      { id: "c", file: "src/a.js" }
    ]
  });
  assert.equal(manifest.kind, "browser-manifest");
  assert.deepEqual(manifest.affectedFiles, ["src/a.js", "src/b.js"]);

  const tempRoot = await mkdtemp(path.join(tmpdir(), "seedworld-patchutils-"));
  const existingRel = "docs/probe.txt";
  const existingAbs = path.join(tempRoot, existingRel);
  await mkdir(path.dirname(existingAbs), { recursive: true });
  await writeFile(existingAbs, "probe", "utf8");

  const snapshots = await snapshotFiles(tempRoot, [existingRel, "docs/missing.txt"]);
  const hit = snapshots.find((x) => x.file === existingRel);
  const miss = snapshots.find((x) => x.file === "docs/missing.txt");
  assert.equal(hit?.exists, true);
  assert.equal(typeof hit?.sha256, "string");
  assert.equal(miss?.exists, false);

  const lowValidation = await validateAgainstLocks(
    { kind: "browser-patch", patch: { file: "docs/a.md" } },
    { root }
  );
  assert.equal(lowValidation.ok, true);
  assert.equal(lowValidation.riskLevel, "low");
  const lowRisk = classifyPatchRisk(lowValidation);
  assert.equal(lowRisk.shouldAutoExecute, true);
  assert.equal(lowRisk.shouldNotifyLlm, false);

  const highValidation = await validateAgainstLocks(
    { kind: "browser-patch", patch: { file: "../../escape.txt" } },
    { root }
  );
  assert.equal(highValidation.ok, false);
  assert.equal(highValidation.riskLevel, "high");
  const highRisk = classifyPatchRisk(highValidation);
  assert.equal(highRisk.shouldAutoExecute, false);
  assert.equal(highRisk.shouldNotifyLlm, true);
}

export const run = test;
