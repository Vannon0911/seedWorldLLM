function readCountAtPath(state, path) {
  const [root, key] = path.split(".");
  const branch = state[root];
  const value = branch && typeof branch === "object" ? branch[key] : undefined;
  return Number.isFinite(value) ? value : 0;
}

function setCountPatch(domain, path, value) {
  return { op: "set", domain, path, value };
}

export function buildBuildPatches({ domain, machinePath, orePath, costPerUnit, count, state }) {
  const requiredOre = costPerUnit * count;
  const oreCurrent = readCountAtPath(state, orePath);
  if (oreCurrent < requiredOre) {
    throw new Error(`[GAME_LOGIC] Nicht genug ore fuer build: benoetigt ${requiredOre}, vorhanden ${oreCurrent}`);
  }

  const machineCurrent = readCountAtPath(state, machinePath);
  const nextMachines = machineCurrent + count;
  const nextOre = oreCurrent - requiredOre;

  return [setCountPatch(domain, machinePath, nextMachines), setCountPatch(domain, orePath, nextOre)];
}
