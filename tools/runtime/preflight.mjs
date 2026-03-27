import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildFunctionSot } from "./functionSotShared.mjs";
import { validateBlueprintScopes } from "./validateBlueprintScopes.mjs";

const root = process.cwd();
const traceabilityPath = path.join(root, "docs/TRACEABILITY.json");
const lockPath = path.join(root, "docs/trace-lock.json");
const functionSotPath = path.join(root, "docs/FUNCTION_SOT.json");
const DEFAULT_PREFLIGHT_MAX_MS = 5000;
const APP_BACKGROUND_SCAN_TARGETS = ["src/main.js"];
const APP_BACKGROUND_PATTERNS = [
  { label: "setInterval", regex: /\bsetInterval\s*\(/g },
  { label: "while(true)", regex: /\bwhile\s*\(\s*true\s*\)/g }
];

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function splitLines(content) {
  return content.split("\n");
}

function findLineForIndex(content, index) {
  return splitLines(content.slice(0, index)).length;
}

function findFirstChangedLine(previousLines, currentLines) {
  const max = Math.max(previousLines.length, currentLines.length);
  for (let i = 0; i < max; i += 1) {
    if (previousLines[i] !== currentLines[i]) {
      return i + 1;
    }
  }

  return 1;
}

function parseMutPoints(content) {
  const lines = splitLines(content);
  const mutPoints = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/@mut-point\s+([A-Z0-9-]+)/);
    if (match) {
      mutPoints.push({ id: match[1], line: i + 1 });
    }
  }

  return mutPoints;
}

function nearestMutId(mutPoints, line) {
  if (mutPoints.length === 0) {
    return "MUT-UNKNOWN";
  }

  let best = mutPoints[0];
  for (const mut of mutPoints) {
    if (mut.line <= line) {
      best = mut;
    }
  }

  return best.id;
}

async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function listFilesRecursive(startDir) {
  const entries = await readdir(startDir, { withFileTypes: true });
  const output = [];

  for (const entry of entries) {
    const abs = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await listFilesRecursive(abs)));
    } else {
      output.push(abs);
    }
  }

  return output;
}

function toPosixRelative(absPath) {
  return path.relative(root, absPath).split(path.sep).join("/");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolvePreflightBudgetMs() {
  const raw = process.env.SEEDWORLD_PREFLIGHT_MAX_MS;
  if (raw === undefined) {
    return DEFAULT_PREFLIGHT_MAX_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail("[PREFLIGHT][CONFIG] SEEDWORLD_PREFLIGHT_MAX_MS muss eine positive Zahl sein.");
  }

  return Math.floor(parsed);
}

function findFirstSotDifference(stored, generated) {
  const storedList = Array.isArray(stored.functions) ? stored.functions : [];
  const generatedList = Array.isArray(generated.functions) ? generated.functions : [];
  const max = Math.max(storedList.length, generatedList.length);

  for (let i = 0; i < max; i += 1) {
    const a = storedList[i];
    const b = generatedList[i];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      return { index: i, stored: a || null, generated: b || null };
    }
  }

  return null;
}

async function main() {
  const startedAt = Date.now();
  const preflightBudgetMs = resolvePreflightBudgetMs();
  const fileTextCache = new Map();
  const readTextCached = async (filePath) => {
    if (!fileTextCache.has(filePath)) {
      fileTextCache.set(filePath, await readFile(filePath, "utf8"));
    }
    return fileTextCache.get(filePath);
  };

  try {
    await validateBlueprintScopes(root);
  } catch (error) {
    fail(`[PREFLIGHT][BLUEPRINT_POLICY] ${error.message}`);
  }

  const traceContent = await readFile(traceabilityPath, "utf8");
  const trace = JSON.parse(traceContent);
  const lock = await readJson(lockPath);

  if (
    !lock.traceability ||
    lock.traceability.file !== "docs/TRACEABILITY.json" ||
    lock.traceability.sha256 !== sha256(traceContent)
  ) {
    fail("[PREFLIGHT][TRACEABILITY_UNSYNC] docs/TRACEABILITY.json ist nicht synchron.");
  }

  const storedSot = await readJson(functionSotPath);
  const generatedSot = await buildFunctionSot(root);

  if (JSON.stringify(storedSot) !== JSON.stringify(generatedSot)) {
    const diff = findFirstSotDifference(storedSot, generatedSot);
    if (diff) {
      fail(
        `[PREFLIGHT][FUNCTION_SOT_UNSYNC] INDEX=${diff.index} STORED=${JSON.stringify(diff.stored)} GENERATED=${JSON.stringify(diff.generated)}`
      );
    }

    fail("[PREFLIGHT][FUNCTION_SOT_UNSYNC] docs/FUNCTION_SOT.json ist nicht synchron.");
  }

  const docPath = path.join(root, trace.documentationFile);
  const docContent = await readTextCached(docPath);

  for (const anchor of trace.requiredDocAnchors) {
    const token = `ANCHOR: ${anchor}`;
    if (!docContent.includes(token)) {
      fail(`[PREFLIGHT][DOC_MISSING] Fehlender Doku-Anchor: ${anchor} in ${trace.documentationFile}`);
    }
  }

  for (const entry of trace.trackedFiles) {
    const filePath = path.join(root, entry.file);
    const content = await readTextCached(filePath);

    for (const anchor of entry.requiredCodeAnchors) {
      const token = `@doc-anchor ${anchor}`;
      if (!content.includes(token)) {
        fail(`[PREFLIGHT][CODE_ANCHOR_MISSING] ${entry.file} fehlt ${token}`);
      }
    }

    for (const mut of entry.requiredMutPoints) {
      const token = `@mut-point ${mut}`;
      if (!content.includes(token)) {
        fail(`[PREFLIGHT][MUT_POINT_MISSING] ${entry.file} fehlt ${token}`);
      }
    }
  }

  for (const target of trace.forbiddenPatternTargets) {
    const filePath = path.join(root, target);
    const content = await readTextCached(filePath);

    for (const pattern of trace.forbiddenKernelPatterns) {
      const regex = new RegExp(pattern, "m");
      const match = content.match(regex);
      if (match) {
        const changedLine = findLineForIndex(content, match.index);
        fail(`[PREFLIGHT][NON_DETERMINISTIC_API] ${target}:${changedLine} trifft Pattern ${pattern}`);
      }
    }
  }

  if (trace.interfacePolicy) {
    const scanRoots = trace.interfacePolicy.scanRoots || [];
    const excludePrefixes = trace.interfacePolicy.excludePrefixes || [];
    const importPatterns = (trace.interfacePolicy.forbiddenImportPatterns || []).map((p) => new RegExp(p, "m"));
    const forbiddenKernelBasenames = [
      "deterministicKernel.js",
      "fingerprint.js",
      "runtimeGuards.js",
      "patchDispatcher.js",
      "seedGuard.js",
      "kornerCore.js",
      "createStore.js",
      "applyPatches.js",
      "llmGovernance.js"
    ];

    for (const scanRoot of scanRoots) {
      const absRoot = path.join(root, scanRoot);
      const allFiles = await listFilesRecursive(absRoot);

      for (const absFile of allFiles) {
        const rel = toPosixRelative(absFile);
        if (!rel.endsWith(".js") && !rel.endsWith(".mjs")) {
          continue;
        }

        if (excludePrefixes.some((prefix) => rel.startsWith(prefix))) {
          continue;
        }

        const content = await readTextCached(absFile);

        if (content.includes("kernel/")) {
          for (const basename of forbiddenKernelBasenames) {
            const tokenIndex = content.indexOf(basename);
            if (tokenIndex !== -1) {
              const changedLine = findLineForIndex(content, tokenIndex);
              fail(
                `[PREFLIGHT][KERNEL_INTERFACE_BREACH] FILE=${rel} LINE=${changedLine} Kernel-Import-Fragment ${basename} ist verboten.`
              );
            }
          }
        }

        for (const regex of importPatterns) {
          const match = content.match(regex);
          if (match) {
            const changedLine = findLineForIndex(content, match.index);
            fail(
              `[PREFLIGHT][KERNEL_INTERFACE_BREACH] FILE=${rel} LINE=${changedLine} Nur ${trace.interfacePolicy.entry} darf interne Kernel-Dateien direkt importieren.`
            );
          }
        }
      }
    }
  }

  for (const relTarget of APP_BACKGROUND_SCAN_TARGETS) {
    const absTarget = path.join(root, relTarget);
    const content = await readTextCached(absTarget);

    for (const pattern of APP_BACKGROUND_PATTERNS) {
      const match = content.match(pattern.regex);
      if (!match) {
        continue;
      }

      const changedLine = findLineForIndex(content, match.index);
      fail(`[PREFLIGHT][BACKGROUND_ACTIVITY] FILE=${relTarget} LINE=${changedLine} verbotene Aktivitaet: ${pattern.label}`);
    }
  }

  for (const entry of trace.trackedFiles) {
    const filePath = path.join(root, entry.file);
    const content = await readTextCached(filePath);
    const currentHash = sha256(content);
    const lockRecord = lock.files[entry.file];

    if (!lockRecord) {
      fail(`[PREFLIGHT][LOCK_MISSING] Kein Lock-Eintrag fuer ${entry.file}`);
    }

    if (lockRecord.sha256 !== currentHash) {
      const currentLines = splitLines(content);
      const changedLine = findFirstChangedLine(lockRecord.lines, currentLines);
      const mutId = nearestMutId(parseMutPoints(content), changedLine);
      fail(
        `[PREFLIGHT][UNSYNC] MUT=${mutId} FILE=${entry.file} LINE=${changedLine} LOCK=${lockRecord.sha256} CURRENT=${currentHash}`
      );
    }
  }

  const durationMs = Date.now() - startedAt;
  if (durationMs > preflightBudgetMs) {
    fail(`[PREFLIGHT][PERF_BUDGET] durationMs=${durationMs} limitMs=${preflightBudgetMs}`);
  }

  console.log(`[PREFLIGHT][PERF] durationMs=${durationMs} limitMs=${preflightBudgetMs}`);
  console.log("[PREFLIGHT] OK");
}

main().catch((error) => {
  fail(`[PREFLIGHT][ERROR] ${error.message}`);
});
