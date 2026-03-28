# Developer Onboarding

Tags: `onboarding` `developer-experience` `checks` `testing`

## Setup

```bash
npm install
npm run sync:docs
npm run preflight
npm test
```

## Required quality line

```bash
npm run check:required
```

## Daily commands

- `npm run governance:verify`
- `npm run hygiene:map`
- `npm run hygiene:why -- <rel-path>`

## Add a new kernel action

1. Generate a starter:

```bash
node tools/runtime/new-action-template.mjs <domain> <actionType> <requiredGate>
```

2. Register in `ActionRegistry` inside `KernelController`.
3. Ensure gate exists in `KernelGates`.
4. Add/adjust tests.
5. Re-run `check:required`.

## Related Pages

- [Home](Home)
- [Kernel Governance](Kernel-Governance)
- [Cleanup and Removal Playbook](Cleanup-and-Removal-Playbook)
