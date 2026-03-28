import { spawn } from "node:child_process";
import path from "node:path";

export function runScriptTest({ root, scriptPath, label }) {
  return new Promise((resolve, reject) => {
    const abs = path.join(root, scriptPath);
    const child = spawn(process.execPath, [abs], {
      cwd: root,
      stdio: "inherit"
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`[${label}] ${scriptPath} failed with exit code ${code}`));
    });
  });
}
