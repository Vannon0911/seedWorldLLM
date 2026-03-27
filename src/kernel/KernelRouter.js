/**
 * KernelRouter - Enforces strict domain boundary separation
 * Game and Patch domains are isolated - no cross-domain calls allowed
 */

const ALLOWED_DOMAINS = Object.freeze(['game', 'patch', 'ui', 'kernel']);
const DOMAIN_ROUTES = Object.freeze({
  game: 'game',
  patch: 'patch',
  ui: 'ui',
  kernel: 'kernel'
});

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

    // Validate domain
    if (!ALLOWED_DOMAINS.includes(domain)) {
      throw new Error(`[KERNEL_ROUTER] Unknown domain: ${domain}`);
    }

    // Check for cross-domain call
    if (this.enforceIsolation && sourceDomain && sourceDomain !== domain) {
      throw new Error(
        `[KERNEL_ROUTER] Cross-domain call blocked: ${sourceDomain} -> ${domain}. ` +
        `Action: ${action?.type || 'unknown'}`
      );
    }

    // Prevent patch domain from accessing game state directly
    if (domain === 'patch' && action?.requiresGameState) {
      throw new Error(
        `[KERNEL_ROUTER] Patch domain cannot access game state directly. ` +
        `Use kernel acknowledgements only.`
      );
    }

    const handler = this.handlers.get(domain);
    if (!handler) {
      throw new Error(`[KERNEL_ROUTER] No handler registered for domain: ${domain}`);
    }

    // Track call for audit
    this.callHistory.push({
      timestamp: Date.now(),
      from: sourceDomain || 'external',
      to: domain,
      actionType: action?.type
    });

    // Set current domain context
    const previousDomain = this.currentDomain;
    this.currentDomain = domain;

    try {
      const result = handler(action);
      return {
        success: true,
        domain,
        result,
        acknowledgement: this.createAcknowledgement(domain, action, result)
      };
    } finally {
      this.currentDomain = previousDomain;
    }
  }

  createAcknowledgement(domain, action, result) {
    return {
      domain,
      actionType: action?.type,
      timestamp: Date.now(),
      status: 'processed',
      // Patch domain only receives acknowledgement, never raw game state
      data: domain === 'patch' ? { acknowledged: true } : result
    };
  }

  validateIsolation() {
    const violations = this.callHistory.filter(call =>
      call.from !== 'external' && call.from !== call.to
    );

    if (violations.length > 0) {
      throw new Error(
        `[KERNEL_ROUTER] Domain isolation violations detected: ` +
        violations.map(v => `${v.from} -> ${v.to}`).join(', ')
      );
    }

    return { valid: true, calls: this.callHistory.length };
  }

  getStats() {
    const domainCalls = {};
    for (const call of this.callHistory) {
      domainCalls[call.to] = (domainCalls[call.to] || 0) + 1;
    }

    return {
      totalCalls: this.callHistory.length,
      domainCalls,
      isolationEnabled: this.enforceIsolation,
      currentDomain: this.currentDomain
    };
  }

  clearHistory() {
    this.callHistory = [];
  }
}

export function createStrictRouter() {
  return new KernelRouter();
}
