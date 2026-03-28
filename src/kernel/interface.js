import { KernelController } from "./KernelController.js";

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

// Global kernel instance for routing
let kernelInstance = null;

export function initializeKernelInterface(kernel) {
  kernelInstance = kernel;
}

function getKernel() {
  if (!kernelInstance) {
    throw new Error(`[KERNEL_INTERFACE] Kernel not initialized`);
  }
  return kernelInstance;
}

function toPatchList(kernel) {
  if (!(kernel?.patches instanceof Map)) {
    return [];
  }
  return Array.from(kernel.patches.entries()).map(([id, patch]) => ({
    id,
    version: patch?.version || "unknown",
    description: patch?.description || "",
    active: patch?.enabled !== false
  }));
}

function toGateStatus(kernel) {
  const gates = kernel?.kernelGates;
  if (!gates || typeof gates.getGateNames !== "function" || typeof gates.getGateStatus !== "function") {
    return {};
  }

  const out = {};
  for (const gateName of gates.getGateNames()) {
    const info = gates.getGateStatus(gateName);
    out[gateName] = {
      active: Boolean(info?.enabled),
      priority: Number.isFinite(info?.metrics?.executions) ? info.metrics.executions : 0,
      hooks: []
    };
  }
  return out;
}

function toRecentEvents(kernel) {
  if (!Array.isArray(kernel?.governanceAuditTrail)) {
    return [];
  }
  return kernel.governanceAuditTrail.slice(-100);
}

function checkNamedGate(kernel, command) {
  const gateName = command.slice("gate.check.".length);
  if (!gateName) {
    return false;
  }
  const status = kernel?.kernelGates?.getGateStatus?.(gateName);
  return Boolean(status?.enabled);
}

function executeNamedGate(command, payload = {}) {
  const gateName = command.slice("gate.execute.".length);
  return {
    success: true,
    gate: gateName,
    acknowledged: true,
    payload
  };
}

const COMMAND_HANDLERS = Object.freeze({
  "state.get": (kernel) => kernel.getCurrentState(),
  "patch.list": (kernel) => toPatchList(kernel),
  "patch.state": (kernel) => toPatchList(kernel),
  "gate.status": (kernel) => toGateStatus(kernel),
  "event.recent": (kernel) => toRecentEvents(kernel),
  "kernel.reset": (kernel) => {
    kernel.currentTick = 0;
    if (Array.isArray(kernel.governanceAuditTrail)) {
      kernel.governanceAuditTrail = [];
    }
    return { success: true, tick: kernel.currentTick };
  },
  "korner.manifest": (kernel) =>
    kernel.execute({
      domain: "kernel",
      action: { type: "getHooks" }
    })
});

export function executeKernelCommand(command, payload = {}) {
  // @doc-anchor KERNEL-ENTRYPOINT
  // @mut-point MUT-KERNEL-ENTRY
  assert(typeof command === "string" && command.length > 0, "ungueltiges command");
  assertPlainObject(payload, "ungueltiges payload");

  const kernel = getKernel();

  // Fail-closed: direct patch writes are blocked in browser/server call path.
  if (command === "patch.apply" || command === "patch.plan") {
    throw new Error(
      "[KERNEL_INTERFACE] Direkte patch.plan/patch.apply Aufrufe sind blockiert. Nutze terminalseitig `npm run patch:apply -- --input <zip|json>`."
    );
  }

  if (command.startsWith("gate.check.")) {
    return checkNamedGate(kernel, command);
  }

  if (command.startsWith("gate.execute.")) {
    return executeNamedGate(command, payload);
  }

  const handler = COMMAND_HANDLERS[command];
  if (handler) {
    return handler(kernel, payload);
  }

  throw new Error(`[KERNEL_INTERFACE] Unbekanntes command: ${command}`);
}
