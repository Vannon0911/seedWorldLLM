const ALLOWED_DOMAINS = Object.freeze(["game", "kernel"]);

export class KernelRouter {
  constructor() {
    this.handlers = new Map();
    this.callHistory = [];
    this.enforceIsolation = true;
    this.currentDomain = null;
  }

  registerHandler(domain, handler) {
    if (!ALLOWED_DOMAINS.includes(domain)) {
      throw new Error(`[KERNEL_ROUTER] Invalid domain: ${domain}`);
    }
    this.handlers.set(domain, handler);
  }

  route(input) {
    const { domain, action, sourceDomain } = input;
    if (!ALLOWED_DOMAINS.includes(domain)) {
      throw new Error(`[KERNEL_ROUTER] Unknown domain: ${domain}`);
    }
    if (this.enforceIsolation && sourceDomain && sourceDomain !== domain) {
      throw new Error(`[KERNEL_ROUTER] Cross-domain call blocked: ${sourceDomain} -> ${domain}`);
    }

    const handler = this.handlers.get(domain);
    if (!handler) {
      throw new Error(`[KERNEL_ROUTER] No handler registered for domain: ${domain}`);
    }

    this.callHistory.push({
      from: sourceDomain || "external",
      to: domain,
      actionType: action?.type || "unknown"
    });

    const previousDomain = this.currentDomain;
    this.currentDomain = domain;
    try {
      const result = handler(action);
      return {
        success: true,
        domain,
        result,
        acknowledgement: {
          domain,
          actionType: action?.type || "unknown",
          status: "processed"
        }
      };
    } finally {
      this.currentDomain = previousDomain;
    }
  }

  validateIsolation() {
    const violations = this.callHistory.filter((call) => call.from !== "external" && call.from !== call.to);
    if (violations.length > 0) {
      throw new Error(
        `[KERNEL_ROUTER] Domain isolation violations detected: ${violations
          .map((entry) => `${entry.from} -> ${entry.to}`)
          .join(", ")}`
      );
    }
    return { valid: true, calls: this.callHistory.length };
  }

  clearHistory() {
    this.callHistory = [];
  }
}

export function createStrictRouter() {
  return new KernelRouter();
}
