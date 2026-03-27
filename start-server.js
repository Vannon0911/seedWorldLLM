// Simple server starter
import { PatchServer } from './patchServer.mjs';

console.log('[START] Starting SeedWorld Development Server...');

const server = new PatchServer();

await server.listen();

console.log('[START] Server started successfully!');
console.log('[HTTP] Open browser: http://localhost:3000');
console.log('[PATCH] Control Plane: http://localhost:3000/patch');
console.log('[INFO] Press Ctrl+C to stop server');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[STOP] Shutting down server...');
  server.close();
  process.exit(0);
});

// Prevent process from exiting
setInterval(() => {
  // Keep-alive heartbeat
}, 10000);
