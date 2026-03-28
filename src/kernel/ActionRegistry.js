function assertString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[ACTION_REGISTRY] ${label} muss ein nicht-leerer String sein.`);
  }
  return value.trim();
}

function assertFunction(value, label) {
  if (typeof value !== "function") {
    throw new Error(`[ACTION_REGISTRY] ${label} muss eine Funktion sein.`);
  }
  return value;
}

export class ActionRegistry {
  constructor() {
    this.entries = new Map();
  }

  register(definition = {}) {
    const domain = assertString(definition.domain, "domain");
    const actionType = assertString(definition.actionType, "actionType");
    const requiredGate = assertString(definition.requiredGate, "requiredGate");
    const handler = assertFunction(definition.handler, "handler");
    const validator =
      typeof definition.validator === "function"
        ? definition.validator
        : () => ({ valid: true });

    const key = this.#key(domain, actionType);
    if (this.entries.has(key)) {
      throw new Error(`[ACTION_REGISTRY] Doppelte Registrierung: ${domain}.${actionType}`);
    }

    this.entries.set(key, {
      domain,
      actionType,
      requiredGate,
      handler,
      validator
    });
    return this;
  }

  resolve(domain, actionType) {
    const key = this.#key(domain, actionType);
    return this.entries.get(key) || null;
  }

  list() {
    return Array.from(this.entries.values()).map((entry) => ({ ...entry }));
  }

  verifyAgainstGates(gateNames = []) {
    const allowed = new Set(gateNames);
    const issues = [];

    for (const entry of this.entries.values()) {
      if (!allowed.has(entry.requiredGate)) {
        issues.push(
          `[ACTION_REGISTRY] Gate '${entry.requiredGate}' fuer ${entry.domain}.${entry.actionType} nicht gefunden.`
        );
      }
    }

    if (issues.length > 0) {
      throw new Error(issues.join("\n"));
    }
  }

  #key(domain, actionType) {
    return `${String(domain)}::${String(actionType)}`;
  }
}
