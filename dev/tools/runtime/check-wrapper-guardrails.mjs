import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "app", "src", "sot", "wrapper-guardrails.json");
const allowedStates = new Set(["active", "warn", "expired", "removed"]);
const requiredFields = [
  "wrapperId",
  "owner",
  "ticketRef",
  "canonicalTarget",
  "introducedAt",
  "expiresAt",
  "state",
  "reason",
  "lastObservedAt"
];

function parseDateOnly(value, fieldName, wrapperId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    throw new Error(`[WRAPPER_GUARD] ${wrapperId}: ${fieldName} must be YYYY-MM-DD`);
  }
  return value;
}

function resolveTodayUtc() {
  const override = String(process.env.WRAPPER_GUARD_NOW_UTC || "").trim();
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) {
      throw new Error("[WRAPPER_GUARD] WRAPPER_GUARD_NOW_UTC must be YYYY-MM-DD");
    }
    return override;
  }
  return new Date().toISOString().slice(0, 10);
}

function ensureStringField(entry, fieldName) {
  const value = entry?.[fieldName];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[WRAPPER_GUARD] ${entry?.wrapperId || "unknown"}: missing ${fieldName}`);
  }
  return value.trim();
}

async function main() {
  const raw = await readFile(registryPath, "utf8");
  const parsed = JSON.parse(raw);
  const wrappers = Array.isArray(parsed?.wrappers) ? parsed.wrappers : null;
  if (!wrappers) {
    throw new Error("[WRAPPER_GUARD] registry must contain wrappers[]");
  }

  const today = resolveTodayUtc();
  const seenIds = new Set();
  const warns = [];

  for (const entry of wrappers) {
    for (const field of requiredFields) {
      ensureStringField(entry, field);
    }

    const wrapperId = entry.wrapperId.trim();
    if (seenIds.has(wrapperId)) {
      throw new Error(`[WRAPPER_GUARD] duplicate wrapperId: ${wrapperId}`);
    }
    seenIds.add(wrapperId);

    const state = entry.state.trim();
    if (!allowedStates.has(state)) {
      throw new Error(`[WRAPPER_GUARD] ${wrapperId}: invalid state '${state}'`);
    }

    parseDateOnly(entry.introducedAt.trim(), "introducedAt", wrapperId);
    const expiresAt = parseDateOnly(entry.expiresAt.trim(), "expiresAt", wrapperId);
    if (expiresAt < today) {
      throw new Error(`[WRAPPER_GUARD] ${wrapperId}: expired at ${expiresAt} (today=${today})`);
    }

    const daysLeft = Math.floor((Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    if (daysLeft <= 7) {
      warns.push(`[WRAPPER_GUARD] WARN ${wrapperId}: expires in ${daysLeft} day(s) at ${expiresAt}`);
    }
  }

  for (const warning of warns) {
    console.warn(warning);
  }
  console.log(`[WRAPPER_GUARD] OK wrappers=${wrappers.length} today=${today}`);
}

try {
  await main();
} catch (error) {
  console.error(String(error?.message || error));
  process.exit(1);
}
