import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const mapPath = path.join(root, "src", "sot", "REPO_HYGIENE_MAP.json");
const boundariesPath = path.join(root, "src", "sot", "repo-boundaries.json");
const targetArg = process.argv[2];

function normalize(relPath) {
  return relPath.replace(/\\/g, "/");
}

function startsWithAny(value, prefixes) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function ownerFor(relPath, owners) {
  for (const owner of owners) {
    if (startsWithAny(relPath, owner.prefixes || [])) {
      return owner.name;
    }
  }
  return "UNOWNED";
}

async function main() {
  if (!targetArg) {
    console.error("Usage: node tools/runtime/repo-hygiene-why.mjs <relative-path>");
    process.exit(1);
  }

  const target = normalize(targetArg);
  const map = JSON.parse(await readFile(mapPath, "utf8"));
  const boundaries = JSON.parse(await readFile(boundariesPath, "utf8"));
  const owners = Array.isArray(boundaries.owners) ? boundaries.owners : [];
  const imports = map.imports || {};
  const inboundCounts = map.inboundCounts || {};

  const knownFiles = new Set([
    ...Object.keys(imports),
    ...Object.keys(inboundCounts),
    ...(Array.isArray(map.entrypoints) ? map.entrypoints : [])
  ]);

  if (!knownFiles.has(target)) {
    console.error(`[HYGIENE_WHY] File not found in map: ${target}`);
    process.exit(2);
  }

  const outbound = Array.isArray(imports[target]) ? imports[target] : [];
  const inbound = Object.entries(imports)
    .filter(([, deps]) => Array.isArray(deps) && deps.includes(target))
    .map(([file]) => file)
    .sort();

  const response = {
    file: target,
    owner: ownerFor(target, owners),
    isEntrypoint: Array.isArray(map.entrypoints) ? map.entrypoints.includes(target) : false,
    unreachableFromEntrypoints: Array.isArray(map.unreachableCode) ? map.unreachableCode.includes(target) : false,
    inboundCount: Number(inboundCounts[target] || 0),
    inboundFrom: inbound,
    outboundTo: outbound
  };

  console.log(JSON.stringify(response, null, 2));
}

await main();
