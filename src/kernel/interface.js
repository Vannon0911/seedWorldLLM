import { getKornerManifest, getKornerModuleSnapshot, getKornerStringMatrix } from "./kornerCore.js";
import { enforceLlmGovernanceChain } from "./llmGovernance.js";
import { applyPatchDispatch, getPatchStateSnapshot, planPatchDispatch } from "./patchDispatcher.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[KERNEL_INTERFACE] ${message}`);
  }
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[KERNEL_INTERFACE] ${message}`);
  }

  const proto = Object.getPrototypeOf(value);
  assert(proto === Object.prototype || proto === null, message);
}

export async function executeKernelCommand(command, payload = {}) {
  // @doc-anchor KERNEL-ENTRYPOINT
  // @mut-point MUT-KERNEL-ENTRY
  assert(typeof command === "string" && command.length > 0, "ungueltiges command");
  assertPlainObject(payload, "ungueltiges payload");

  if (command === "patch.plan") {
    return planPatchDispatch(payload);
  }

  if (command === "patch.apply") {
    return applyPatchDispatch(payload, payload.confirmation || {});
  }

  if (command === "patch.state") {
    return getPatchStateSnapshot();
  }

  if (command === "korner.manifest") {
    return getKornerManifest();
  }

  if (command === "korner.string-matrix") {
    return { matrix: getKornerStringMatrix() };
  }

  if (command === "korner.snapshot") {
    return getKornerModuleSnapshot();
  }

  if (command === "governance.llm-chain") {
    return enforceLlmGovernanceChain(payload);
  }

  throw new Error(`[KERNEL_INTERFACE] Unbekanntes command: ${command}`);
}
