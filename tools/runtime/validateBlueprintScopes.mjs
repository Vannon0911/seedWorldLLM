import { readFile } from "node:fs/promises";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeScope(scope) {
  return String(scope || "").trim().toLowerCase();
}

async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

function ensureStringArray(value, contextLabel) {
  assert(Array.isArray(value), `[BLUEPRINT_POLICY] ${contextLabel} muss Array sein.`);

  const out = [];
  for (const item of value) {
    const token = String(item || "").trim();
    assert(token.length > 0, `[BLUEPRINT_POLICY] ${contextLabel} enthaelt leeren Eintrag.`);
    out.push(token);
  }
  return out;
}

export async function validateBlueprintScopes(root) {
  // @doc-anchor BLUEPRINT-SCOPE-GATE
  // @mut-point MUT-BLUEPRINT-SCOPE-VALIDATION
  const policyPath = path.join(root, "docs/BLUEPRINT_SCOPES.json");
  const policy = await readJson(policyPath);

  assert(policy && typeof policy === "object" && !Array.isArray(policy), "[BLUEPRINT_POLICY] Policy muss Object sein.");
  const expectedCount = Number(policy.requiredBlueprintCount);
  assert(Number.isInteger(expectedCount) && expectedCount > 0, "[BLUEPRINT_POLICY] requiredBlueprintCount ist ungueltig.");

  const blueprints = Array.isArray(policy.blueprints) ? policy.blueprints : [];
  assert(
    blueprints.length === expectedCount,
    `[BLUEPRINT_POLICY] Erwartet ${expectedCount} Blueprints, gefunden ${blueprints.length}.`
  );

  const seenIds = new Set();
  const seenFiles = new Set();
  const scopeOwner = new Map();

  for (const blueprint of blueprints) {
    assert(blueprint && typeof blueprint === "object" && !Array.isArray(blueprint), "[BLUEPRINT_POLICY] Blueprint-Eintrag muss Object sein.");

    const id = String(blueprint.id || "").trim();
    const relFile = String(blueprint.file || "").trim();
    assert(id.length > 0, "[BLUEPRINT_POLICY] Blueprint id fehlt.");
    assert(relFile.length > 0, `[BLUEPRINT_POLICY] Blueprint ${id} hat keine Datei.`);
    assert(!seenIds.has(id), `[BLUEPRINT_POLICY] Doppelte Blueprint id: ${id}`);
    assert(!seenFiles.has(relFile), `[BLUEPRINT_POLICY] Doppelte Blueprint-Datei: ${relFile}`);
    seenIds.add(id);
    seenFiles.add(relFile);

    const scopes = ensureStringArray(blueprint.scopes, `Blueprint ${id} scopes`);
    const requiredPhrases = ensureStringArray(blueprint.requiredPhrases, `Blueprint ${id} requiredPhrases`);
    const feasibilityCriteria = ensureStringArray(blueprint.feasibilityCriteria, `Blueprint ${id} feasibilityCriteria`);
    const docPath = path.join(root, relFile);
    const doc = await readText(docPath);

    for (const phrase of requiredPhrases) {
      if (!doc.includes(phrase)) {
        throw new Error(`[BLUEPRINT_POLICY] Blueprint ${id} fehlt Pflicht-Textbaustein: ${phrase} (${relFile})`);
      }
    }

    for (const criterion of feasibilityCriteria) {
      if (!doc.includes(criterion)) {
        throw new Error(`[BLUEPRINT_FEASIBILITY] Blueprint ${id} verletzt Machbarkeitskriterium: ${criterion} (${relFile})`);
      }
    }

    for (const rawScope of scopes) {
      const scope = normalizeScope(rawScope);
      assert(scope.length > 0, `[BLUEPRINT_POLICY] Blueprint ${id} enthaelt leeren Scope.`);
      const existingOwner = scopeOwner.get(scope);
      if (existingOwner) {
        throw new Error(`[BLUEPRINT_SCOPE_OVERLAP] Scope ${scope} ist doppelt vergeben: ${existingOwner} und ${id}`);
      }
      scopeOwner.set(scope, id);
    }
  }

  assert(scopeOwner.size > 0, "[BLUEPRINT_POLICY] Keine Blueprint-Scopes gefunden.");
  return {
    status: "ok",
    blueprintCount: blueprints.length,
    uniqueScopes: scopeOwner.size
  };
}
