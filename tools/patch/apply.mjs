#!/usr/bin/env node
import { resolve } from 'node:path';
import { createSessionId } from './lib/session-store.mjs';
import { runPatchSession } from './lib/orchestrator.mjs';

function parseArgs(argv) {
  const parsed = {
    actor: 'terminal',
    input: null,
    sessionId: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') {
      parsed.input = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === '--actor') {
      parsed.actor = argv[index + 1] || 'terminal';
      index += 1;
      continue;
    }
    if (token === '--session-id') {
      parsed.sessionId = argv[index + 1] || null;
      index += 1;
    }
  }

  return parsed;
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error('Usage: npm run patch:apply -- --input <zip|json> [--actor <name>]');
  process.exit(1);
}

const rootDir = process.cwd();
const sessionId = args.sessionId || createSessionId();
const status = await runPatchSession({
  rootDir,
  inputPath: resolve(rootDir, args.input),
  actor: args.actor,
  sessionId
});

console.log(JSON.stringify({
  sessionId,
  finalStatus: status.finalStatus,
  summaryPath: status.summaryPath,
  logPath: status.logPath
}));

process.exit(status.finalStatus === 'succeeded' ? 0 : 1);
