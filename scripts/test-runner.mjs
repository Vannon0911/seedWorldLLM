import { spawn } from 'node:child_process';

function run(scriptPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${scriptPath} failed with exit code ${code}`));
    });
  });
}

await run('scripts/smoke-test.mjs');
await run('scripts/patch-flow-test.mjs');
