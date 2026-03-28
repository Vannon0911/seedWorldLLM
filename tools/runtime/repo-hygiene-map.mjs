import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const boundaryConfigPath = path.join(root, "src", "sot", "repo-boundaries.json");
const reportPath = path.join(root, "docs", "SOT", "REPO_HYGIENE_MAP.md");
const reportJsonPath = path.join(root, "src", "sot", "REPO_HYGIENE_MAP.json");

function normalize(relPath) {
  return relPath.replace(/\\/g, "/");
}

function isCodeFile(relPath) {
  return /\.(js|mjs|cjs)$/.test(relPath);
}

async function exists(absPath) {
  try {
    await readFile(absPath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(absDir) {
  const out = [];
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(abs)));
      continue;
    }
    if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

function parseImports(code) {
  const imports = new Set();
  const staticImport = /import\s+[^'"]*?from\s*["']([^"']+)["']/g;
  const sideEffectImport = /import\s*["']([^"']+)["']/g;
  const dynamicImport = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  const requireImport = /require\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const rx of [staticImport, sideEffectImport, dynamicImport, requireImport]) {
    let m = null;
    while ((m = rx.exec(code)) !== null) {
      imports.add(m[1]);
    }
  }
  return Array.from(imports);
}

function resolveRelativeImport(fromRel, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const fromDir = path.dirname(fromRel);
  const candidates = [];
  const raw = normalize(path.join(fromDir, specifier));
  candidates.push(raw);
  candidates.push(`${raw}.js`);
  candidates.push(`${raw}.mjs`);
  candidates.push(`${raw}.cjs`);
  candidates.push(normalize(path.join(raw, "index.js")));
  candidates.push(normalize(path.join(raw, "index.mjs")));
  return candidates;
}

function startsWithAny(value, prefixes) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function ownerFor(relPath, owners) {
  for (const owner of owners) {
    if (startsWithAny(relPath, owner.prefixes)) {
      return owner.name;
    }
  }
  return "UNOWNED";
}

function walkReachable(startNodes, graph) {
  const stack = [...startNodes];
  const seen = new Set();
  while (stack.length > 0) {
    const node = stack.pop();
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    const next = graph.get(node) || [];
    for (const target of next) {
      if (!seen.has(target)) {
        stack.push(target);
      }
    }
  }
  return seen;
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Repo Hygiene Map");
  lines.push("");
  lines.push("## Ownership");
  for (const owner of report.owners) {
    lines.push(`- **${owner.name}**: ${owner.purpose}`);
    lines.push(`  prefixes: ${owner.prefixes.join(", ")}`);
  }
  lines.push("");
  lines.push("## Entry Points");
  for (const ep of report.entrypoints) {
    lines.push(`- ${ep}`);
  }
  lines.push("");
  lines.push("## Unowned Files");
  if (report.unownedFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const f of report.unownedFiles) {
      lines.push(`- ${f}`);
    }
  }
  lines.push("");
  lines.push("## Unreachable Code Files (from configured entrypoints)");
  if (report.unreachableCode.length === 0) {
    lines.push("- none");
  } else {
    for (const f of report.unreachableCode) {
      lines.push(`- ${f}`);
    }
  }
  lines.push("");
  lines.push("## Zero Inbound Code Files (excluding entrypoints)");
  if (report.zeroInboundNonEntrypoints.length === 0) {
    lines.push("- none");
  } else {
    for (const f of report.zeroInboundNonEntrypoints) {
      lines.push(`- ${f}`);
    }
  }
  lines.push("");
  lines.push("## Cross-Owner Imports");
  if (report.crossOwnerImports.length === 0) {
    lines.push("- none");
  } else {
    for (const row of report.crossOwnerImports) {
      lines.push(`- ${row.from} (${row.fromOwner}) -> ${row.to} (${row.toOwner})`);
    }
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("- Unreachable/zero-inbound are candidates, not auto-delete orders.");
  lines.push("- Dynamic imports built from runtime strings are not fully discoverable.");
  lines.push("- Ownership comes from src/sot/repo-boundaries.json.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const config = JSON.parse(await readFile(boundaryConfigPath, "utf8"));
  const owners = Array.isArray(config.owners) ? config.owners : [];
  const entrypoints = Array.isArray(config.entrypoints) ? config.entrypoints.map(normalize) : [];
  const scanRoots = Array.isArray(config.scanRoots) ? config.scanRoots : [];

  const allFiles = [];
  const seenFiles = new Set();
  for (const relRoot of scanRoots) {
    const absRoot = path.join(root, relRoot);
    try {
      const files = await listFilesRecursive(absRoot);
      for (const abs of files) {
        const rel = normalize(path.relative(root, abs));
        if (!seenFiles.has(rel)) {
          allFiles.push(rel);
          seenFiles.add(rel);
        }
      }
    } catch {
      // missing root is okay
    }
  }

  for (const entrypoint of entrypoints) {
    const abs = path.join(root, entrypoint);
    if (await exists(abs) && !seenFiles.has(entrypoint)) {
      allFiles.push(entrypoint);
      seenFiles.add(entrypoint);
    }
  }

  const codeFiles = allFiles.filter(isCodeFile);
  const codeSet = new Set(codeFiles);
  const graph = new Map();
  const inbound = new Map();
  const crossOwnerImports = [];

  for (const file of codeFiles) {
    graph.set(file, []);
    inbound.set(file, 0);
  }

  for (const file of codeFiles) {
    const abs = path.join(root, file);
    const code = await readFile(abs, "utf8");
    const imports = parseImports(code);
    for (const spec of imports) {
      const candidates = resolveRelativeImport(file, spec);
      if (!candidates) {
        continue;
      }
      const resolved = candidates.find((candidate) => codeSet.has(candidate));
      if (!resolved) {
        continue;
      }
      graph.get(file).push(resolved);
      inbound.set(resolved, (inbound.get(resolved) || 0) + 1);

      const fromOwner = ownerFor(file, owners);
      const toOwner = ownerFor(resolved, owners);
      if (fromOwner !== toOwner) {
        crossOwnerImports.push({ from: file, to: resolved, fromOwner, toOwner });
      }
    }
  }

  const reachable = walkReachable(entrypoints.filter((ep) => codeSet.has(ep)), graph);
  const unreachableCode = codeFiles.filter((f) => !reachable.has(f)).sort();
  const zeroInboundNonEntrypoints = codeFiles
    .filter((f) => !entrypoints.includes(f) && (inbound.get(f) || 0) === 0)
    .sort();
  const unownedFiles = allFiles.filter((f) => ownerFor(f, owners) === "UNOWNED").sort();

  crossOwnerImports.sort((a, b) => {
    const ka = `${a.from}->${a.to}`;
    const kb = `${b.from}->${b.to}`;
    return ka.localeCompare(kb);
  });

  const report = {
    generatedAt: new Date().toISOString(),
    entrypoints,
    owners,
    fileCounts: {
      allFiles: allFiles.length,
      codeFiles: codeFiles.length
    },
    unownedFiles,
    unreachableCode,
    zeroInboundNonEntrypoints,
    crossOwnerImports,
    inboundCounts: Object.fromEntries(Array.from(inbound.entries()).sort((a, b) => a[0].localeCompare(b[0]))),
    imports: Object.fromEntries(
      Array.from(graph.entries())
        .map(([k, v]) => [k, [...v].sort()])
        .sort((a, b) => a[0].localeCompare(b[0]))
    )
  };

  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(reportPath, `${toMarkdown(report)}\n`, "utf8");
  console.log(`[HYGIENE_MAP] OK (${codeFiles.length} code files, ${unreachableCode.length} unreachable)`);
}

await main();
