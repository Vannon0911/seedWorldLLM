import { join } from 'node:path';

export const PATCH_PHASES = [
  'intake',
  'unpack',
  'manifest-validate',
  'normalize',
  'risk-classify',
  'acquire-lock',
  'llm-gates',
  'backup',
  'apply',
  'verify',
  'test',
  'finalize',
  'release-lock'
];

export const FINAL_STATUSES = [
  'succeeded',
  'failed_rolled_back',
  'failed_partial'
];

export const LOCK_TTL_MS = 30_000;
export const LOCK_HEARTBEAT_MS = 5_000;
export const SESSION_POLL_MS = 500;

export function getPatchManagerPaths(rootDir) {
  const managerRoot = join(rootDir, '.patch-manager');
  return {
    managerRoot,
    intakeDir: join(managerRoot, 'intake'),
    sessionsDir: join(managerRoot, 'sessions'),
    logsDir: join(managerRoot, 'logs'),
    backupsDir: join(managerRoot, 'backups'),
    uploadsDir: join(managerRoot, 'uploads'),
    auditLogPath: join(managerRoot, 'audit.jsonl'),
    lockPath: join(managerRoot, 'terminal-session.lock')
  };
}
