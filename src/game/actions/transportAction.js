function readCountAtPath(state, path) {
  const [root, key] = path.split(".");
  const branch = state[root];
  const value = branch && typeof branch === "object" ? branch[key] : undefined;
  return Number.isFinite(value) ? value : 0;
}

function setCountPatch(domain, path, value) {
  return { op: "set", domain, path, value };
}

export function buildTransportPatches({ domain, fromPath, toPath, amount, state }) {
  if (fromPath === toPath) {
    return [];
  }

  const fromCurrent = readCountAtPath(state, fromPath);
  const toCurrent = readCountAtPath(state, toPath);
  const moved = Math.min(fromCurrent, amount);

  const nextFrom = fromCurrent - moved;
  const nextTo = toCurrent + moved;

  return [setCountPatch(domain, fromPath, nextFrom), setCountPatch(domain, toPath, nextTo)];
}
