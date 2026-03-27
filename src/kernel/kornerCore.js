function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }

  return value;
}

const KORNER_MANIFEST = deepFreeze({
  moduleId: "seedworld.korner.v1",
  ownership: "kernel-only",
  areas: {
    determinism: [
      "seed-guard",
      "runtime-guards",
      "deterministic-kernel",
      "mut-fingerprint"
    ],
    security: [
      "preflight-fail-closed",
      "trace-lock",
      "function-sot",
      "patch-dispatcher-gate"
    ],
    governance: [
      "single-interface-entry",
      "mandatory-maintest",
      "doc-anchor-policy",
      "explicit-confirmation-flow",
      "llm-governance-chain"
    ],
    moneySystem: [
      "resources-ledger-simulation",
      "upkeep-and-production-rules",
      "state-fingerprint-audit"
    ]
  }
});

const STRING_MATRIX = deepFreeze([
  ["domain", "determinism", "security", "governance", "moneySystem"],
  ["seed-guard", "hard-required", "hash-verified", "policy-bound", "run-gate"],
  ["runtime-guards", "api-block", "nondeterminism-stop", "kernel-scope", "run-safety"],
  ["preflight", "sync-check", "fail-closed", "doc-sot", "release-gate"],
  ["dispatcher", "deterministic-flow", "format-block", "confirm-required", "patch-governance"],
  ["llm-governance", "schema-first", "sanitized-input", "pflichtkette", "domain-scoped"],
  ["maintest", "mandatory", "regression-net", "single-runner", "go-no-go"],
  ["simulation", "seed-driven", "guarded", "auditable", "ledger-based"]
]);

function clone(value) {
  return structuredClone(value);
}

export function getKornerManifest() {
  // @doc-anchor KORNER-MODULE
  // @mut-point MUT-KORNER-MODULE
  return clone(KORNER_MANIFEST);
}

export function getKornerStringMatrix() {
  return clone(STRING_MATRIX);
}

export function getKornerModuleSnapshot() {
  return {
    manifest: getKornerManifest(),
    stringMatrix: getKornerStringMatrix()
  };
}
