import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const ALLOW_UNUSED_GATES = new Set([
  "system.reset",
  "system.shutdown",
  "patch.apply",
  "kernel.tick",
  "state.modify",
  "game.access",
  "dev.access",
  "patcher.access"
]);

async function listFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(abs)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!/\.(js|mjs)$/.test(entry.name)) {
      continue;
    }
    out.push(abs);
  }
  return out;
}

function parseStaticKernelExecuteCalls(code) {
  const calls = [];
  const executePattern = /kernel\.execute\s*\(\s*\{([\s\S]{0,500}?)\}\s*\)/g;
  let match = null;
  while ((match = executePattern.exec(code)) !== null) {
    const block = match[1];
    const domain = block.match(/domain\s*:\s*['"]([^'"]+)['"]/)?.[1] || null;
    const type = block.match(/type\s*:\s*['"]([^'"]+)['"]/)?.[1] || null;
    if (domain && type) {
      calls.push({ domain, type });
    }
  }
  return calls;
}

async function main() {
  const kernelModuleUrl = pathToFileURL(path.join(root, "src/kernel/KernelController.js")).href;
  const { KernelController } = await import(kernelModuleUrl);
  const kernel = new KernelController({ governanceMode: "shadow" });

  const actions = kernel.actionRegistry.list();
  const gates = kernel.kernelGates.getGateNames();

  const issues = [];
  const actionKeys = new Set();
  const referencedGates = new Set();

  for (const action of actions) {
    const key = `${action.domain}.${action.actionType}`;
    actionKeys.add(key);

    if (!action.requiredGate || typeof action.requiredGate !== "string") {
      issues.push(`Action ohne requiredGate: ${key}`);
      continue;
    }

    referencedGates.add(action.requiredGate);
    if (!gates.includes(action.requiredGate)) {
      issues.push(`Action referenziert unbekanntes Gate: ${key} -> ${action.requiredGate}`);
    }
  }

  for (const gateName of gates) {
    if (!referencedGates.has(gateName) && !ALLOW_UNUSED_GATES.has(gateName)) {
      issues.push(`Unreferenziertes Gate ohne Allowlist: ${gateName}`);
    }
  }

  const scannedPaths = ["src", "server", "scripts", "tools"]
    .map((rel) => path.join(root, rel))
    .filter((abs) => abs !== null);
  const scanFiles = [];
  for (const baseDir of scannedPaths) {
    try {
      scanFiles.push(...(await listFiles(baseDir)));
    } catch {
      // ignore absent directories
    }
  }

  for (const filePath of scanFiles) {
    const rel = path.relative(root, filePath);
    const code = await readFile(filePath, "utf8");

    if (
      rel !== path.join("src", "kernel", "KernelController.js") &&
      rel !== path.join("tools", "runtime", "governance-verify.mjs") &&
      code.includes("patchOrchestrator.")
    ) {
      issues.push(`Direkter patchOrchestrator-Zugriff verboten ausserhalb KernelController: ${rel}`);
    }

    for (const call of parseStaticKernelExecuteCalls(code)) {
      const key = `${call.domain}.${call.type}`;
      if (!actionKeys.has(key)) {
        issues.push(`kernel.execute Action nicht in Registry: ${key} (gefunden in ${rel})`);
      }
    }
  }

  if (issues.length > 0) {
    console.error("[GOVERNANCE_VERIFY] FAIL");
    for (const issue of issues) {
      console.error(` - ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`[GOVERNANCE_VERIFY] OK (${actions.length} actions, ${gates.length} gates)`);
}

await main();
