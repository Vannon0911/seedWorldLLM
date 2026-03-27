export async function sha256Hex(input) {
  // @doc-anchor FINGERPRINT-MUT
  // @mut-point MUT-SHA256-CALC
  if (typeof input !== "string") {
    throw new TypeError("sha256Hex erwartet eine Zeichenkette.");
  }

  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createMutFingerprint(mutPayload) {
  const canonical = stableStringify(mutPayload);
  return sha256Hex(canonical);
}

function stableStringify(value) {
  return stableStringifyInternal(value, new WeakSet());
}

function stableStringifyInternal(value, seen) {
  if (value === null) {
    return "null";
  }

  const type = typeof value;
  if (type === "string") {
    return `str:${JSON.stringify(value)}`;
  }

  if (type === "number") {
    if (Number.isNaN(value)) {
      return "num:NaN";
    }

    if (!Number.isFinite(value)) {
      return value > 0 ? "num:+Infinity" : "num:-Infinity";
    }

    return Object.is(value, -0) ? "num:-0" : `num:${String(value)}`;
  }

  if (type === "boolean") {
    return `bool:${value ? "true" : "false"}`;
  }

  if (type === "undefined") {
    return "undef";
  }

  if (type === "bigint") {
    return `bigint:${value.toString()}`;
  }

  if (type === "symbol" || type === "function") {
    throw new TypeError(`stableStringify kann ${type} nicht serialisieren.`);
  }

  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) {
      throw new TypeError("stableStringify kann ungueltige Date-Werte nicht serialisieren.");
    }

    return `date:${value.toISOString()}`;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError("stableStringify unterstuetzt keine zyklischen Strukturen.");
    }

    seen.add(value);
    const items = value.map((item) => stableStringifyInternal(item, seen));
    seen.delete(value);
    return `arr:[${items.join(",")}]`;
  }

  if (seen.has(value)) {
    throw new TypeError("stableStringify unterstuetzt keine zyklischen Strukturen.");
  }

  seen.add(value);

  if (!isPlainObject(value)) {
    seen.delete(value);
    throw new TypeError(
      `stableStringify unterstuetzt nur Arrays, Dates und Plain-Objects; gesehen: ${Object.prototype.toString.call(value)}`
    );
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringifyInternal(value[key], seen)}`);
  seen.delete(value);
  return `obj:{${entries.join(",")}}`;
}

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
