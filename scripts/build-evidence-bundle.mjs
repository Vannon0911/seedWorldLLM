import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import JSZip from "jszip";

const root = process.cwd();
const logsDir = path.join(root, ".patch-manager", "logs");
const playwrightDir = path.join(root, "output", "playwright");
const bundlesRoot = path.join(root, "output", "evidence-bundles");

function argNumber(name, fallback) {
  const token = process.argv.find((x) => x.startsWith(`${name}=`));
  if (!token) return fallback;
  const value = Number(token.slice(name.length + 1));
  return Number.isFinite(value) ? value : fallback;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isStrictEvidence(evidence) {
  return (
    evidence &&
    evidence.status === "passed" &&
    evidence.gateDecision === "pass_and_deny_paths_verified" &&
    evidence.determinism?.consistent === true
  );
}

async function runTestRunner() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/test-runner.mjs"], {
      cwd: root,
      stdio: "inherit"
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`test-runner failed with exit code ${code}`));
      }
    });
  });
}

async function collectEvidence() {
  const out = [];
  try {
    const entries = await readdir(logsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/^test-run-.*\.json$/.test(entry.name)) continue;
      const abs = path.join(logsDir, entry.name);
      const raw = await readFile(abs, "utf8");
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      out.push({ abs, rel: path.relative(root, abs), type: "evidence-json", parsed, bytes: Buffer.from(raw, "utf8") });
    }
  } catch {
    // no evidence directory yet
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel, "en"));
}

async function collectPlaywrightArtifacts() {
  const out = [];
  try {
    const entries = await readdir(playwrightDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const abs = path.join(playwrightDir, entry.name);
      const bytes = await readFile(abs);
      out.push({ abs, rel: path.relative(root, abs), type: "playwright-artifact", bytes });
    }
  } catch {
    // optional folder
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel, "en"));
}

async function ensureStrictCount(targetStrict, maxPullRuns) {
  let attempts = 0;
  while (attempts < maxPullRuns) {
    const evidence = await collectEvidence();
    const strict = evidence.filter((x) => isStrictEvidence(x.parsed)).length;
    if (strict >= targetStrict) {
      return { evidence, strict, attempts };
    }
    await runTestRunner();
    attempts += 1;
  }
  const evidence = await collectEvidence();
  const strict = evidence.filter((x) => isStrictEvidence(x.parsed)).length;
  return { evidence, strict, attempts };
}

async function buildBundle(items, strictCount, targetStrict) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const bundleDir = path.join(bundlesRoot, ts);
  await mkdir(bundleDir, { recursive: true });

  const manifestItems = [];
  const zip = new JSZip();

  for (const item of items) {
    const info = await stat(item.abs);
    const digest = sha256(item.bytes);
    let classification = item.type;
    if (item.type === "evidence-json") {
      classification = isStrictEvidence(item.parsed) ? "strict-evidence" : "legacy-evidence";
    }
    manifestItems.push({
      source: item.abs,
      relative: item.rel.replace(/\\/g, "/"),
      classification,
      size: info.size,
      mtime: info.mtime.toISOString(),
      sha256: digest
    });
    zip.file(`artifacts/${item.rel.replace(/\\/g, "/")}`, item.bytes);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    targetStrictEvidence: targetStrict,
    strictEvidenceCount: strictCount,
    totalItems: manifestItems.length,
    items: manifestItems
  };

  const manifestPath = path.join(bundleDir, "manifest.json");
  const zipPath = path.join(bundleDir, `evidence-bundle-${ts}.zip`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const zipped = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await writeFile(zipPath, zipped);

  return { bundleDir, manifestPath, zipPath, manifest };
}

const targetStrict = argNumber("--ensure-strict", 10);
const maxPullRuns = argNumber("--max-pull-runs", 3);

const ensured = await ensureStrictCount(targetStrict, maxPullRuns);
const evidenceItems = ensured.evidence;
const playwrightItems = await collectPlaywrightArtifacts();
const merged = [...evidenceItems, ...playwrightItems];

const bundle = await buildBundle(merged, ensured.strict, targetStrict);
if (ensured.strict < targetStrict) {
  throw new Error(
    `Strict evidence target not met. strict=${ensured.strict}, target=${targetStrict}, bundle=${bundle.zipPath}`
  );
}

console.log(`[EVIDENCE_BUNDLE] strict=${ensured.strict}/${targetStrict} items=${merged.length}`);
console.log(`[EVIDENCE_BUNDLE] manifest=${bundle.manifestPath}`);
console.log(`[EVIDENCE_BUNDLE] zip=${bundle.zipPath}`);
