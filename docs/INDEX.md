# SeedWorld Docs Index (Synced: 2026-03-28)

Dieser Ordner enthaelt nur dieses Mapping plus Bereichsordner.

## Bereiche

- `SOT/`: Source of Truth, maschinen-/prozessnahe Referenzen.
- `MANUEL/`: Handbuecher, Bedienung, Deployment, Wiki.
- `LLM/`: LLM-Policies und LLM-spezifische Regeln.
- `IN PLANUNG/`: Geplante Themen und isolierte Vorarbeiten.

## Wichtige Einstiegspunkte

- Root Start: `README.md`
- Runtime Entry: `start-server.js` + `app/server/patchServer.mjs`
- Test Entry: `dev/tests/MainTest.mjs`

## Mapping

- SOT:
  - [ORIENTATION](./SOT/ORIENTATION.md)
  - [DETERMINISM_INVENTORY](./SOT/DETERMINISM_INVENTORY.md)
  - [REPO_HYGIENE_MAP](./SOT/REPO_HYGIENE_MAP.md)
- MANUEL:
  - [WORKFLOW](./MANUEL/WORKFLOW.md)
  - [Deployment](./MANUEL/deployment/DEPLOYMENT.md)
  - [Wiki Home](./MANUEL/wiki/Home.md)
- LLM:
  - [LLM Index](./LLM/INDEX.md)
  - [LLM Entry](./LLM/ENTRY.md)
  - [LLM Policy](./LLM/POLICY.md)
- Source SoT (Runtime/LLM):
  - [app/src/sot/repo-boundaries.json](../app/src/sot/repo-boundaries.json)
  - [app/src/sot/release-manifest.json](../app/src/sot/release-manifest.json)
  - [app/src/sot/patches.schema.json](../app/src/sot/patches.schema.json)
  - [app/src/sot/FUNCTION_SOT.json](../app/src/sot/FUNCTION_SOT.json)
  - [app/src/sot/REPO_HYGIENE_MAP.json](../app/src/sot/REPO_HYGIENE_MAP.json)
  - [app/src/llm/llm-gate-policy.json](../app/src/llm/llm-gate-policy.json)
- IN PLANUNG:
  - [cleanup-reports](./IN%20PLANUNG/cleanup-reports/REPO_CLEANUP_BASELINE_2026-03-27.md)
  - [UNVERFID candidates](../legacy/UNVERFID/CANDIDATES.md)

