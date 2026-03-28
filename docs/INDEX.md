# SeedWorld Docs Index (Synced: 2026-03-28)

Dieser Ordner enthaelt nur dieses Mapping plus Bereichsordner.

## Bereiche

- `SOT/`: Source of Truth, maschinen-/prozessnahe Referenzen.
- `MANUEL/`: Handbuecher, Bedienung, Deployment, Wiki.
- `LLM/`: LLM-Policies und LLM-spezifische Regeln.
- `IN PLANUNG/`: Geplante Themen und isolierte Vorarbeiten.

## Wichtige Einstiegspunkte

- Root Start: `README.md`
- Runtime Entry: `start-server.js` + `server/patchServer.mjs`
- Test Entry: `tests/MainTest.mjs`

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
  - [Policy Doku](./LLM/)
- Source SoT (Runtime/LLM):
  - [src/sot/repo-boundaries.json](../src/sot/repo-boundaries.json)
  - [src/sot/release-manifest.json](../src/sot/release-manifest.json)
  - [src/sot/patches.schema.json](../src/sot/patches.schema.json)
  - [src/sot/FUNCTION_SOT.json](../src/sot/FUNCTION_SOT.json)
  - [src/sot/REPO_HYGIENE_MAP.json](../src/sot/REPO_HYGIENE_MAP.json)
  - [src/llm/llm-gate-policy.json](../src/llm/llm-gate-policy.json)
- IN PLANUNG:
  - [cleanup-reports](./IN%20PLANUNG/cleanup-reports/REPO_CLEANUP_BASELINE_2026-03-27.md)
  - [UNVERFID candidates](../UNVERFID/CANDIDATES.md)

