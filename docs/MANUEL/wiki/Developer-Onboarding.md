# Developer Onboarding

Tags: `onboarding` `developer-experience` `checks` `testing`

## Setup

```bash
npm install
npm run check:required
npm run check:required:verify-only
```

## Required quality line

```bash
npm run check:required
npm run check:required:verify-only
```

## Daily commands

- `npm run check:required`
- `npm run check:required:verify-only`
- `npm run docs:v2:sync`
- `node dev/tools/runtime/repo-hygiene-map.mjs --write`
- `node dev/tools/runtime/updateFunctionSot.mjs --write`

## Add a new kernel action

1. Generate a starter:

```bash
node tools/runtime/new-action-template.mjs <domain> <actionType> <requiredGate>
```

2. Register in `ActionRegistry` inside `KernelController`.
3. Add/adjust Doppel-Lauf-Tests.
4. Re-run `check:required`.

## Related Pages

- [Home](Home)
- [Cleanup and Removal Playbook](Cleanup-and-Removal-Playbook)
- [../../V2/HOME.md](../../V2/HOME.md)
