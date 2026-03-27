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

export function executeKernelCommand(command, payload = {}) {
  // @doc-anchor KERNEL-ENTRYPOINT
  // @mut-point MUT-KERNEL-ENTRY
  assert(typeof command === "string" && command.length > 0, "ungueltiges command");
  assertPlainObject(payload, "ungueltiges payload");

  if (!kernelInstance) {
    throw new Error(`[KERNEL_INTERFACE] Kernel not initialized`);
  }

  // Route commands to K1 (State-Owner)
  if (command === "patch.apply") {
    if (payload.patch) {
      // Register patch
      return kernelInstance.execute({
        domain: 'kernel',
        action: {
          type: 'registerPatch',
          patch: payload.patch
        }
      });
    } else if (payload.patchId) {
      // Unregister patch
      return kernelInstance.execute({
        domain: 'kernel',
        action: {
          type: 'unregisterPatch',
          patchId: payload.patchId
        }
      });
    }
  }

  if (command === "patch.state") {
    return kernelInstance.execute({
      domain: 'kernel',
      action: { type: 'listPatches' }
    });
  }

  if (command === "korner.manifest") {
    return kernelInstance.execute({
      domain: 'kernel',
      action: { type: 'getHooks' }
    });
  }

  throw new Error(`[KERNEL_INTERFACE] Unbekanntes command: ${command}`);
}
