// Simple server starter
import { MainServer } from './src/mainServer.js';

console.log('[START] Starting SeedWorld Development Server...');

const server = new MainServer();

console.log('[START] Server started successfully!');
console.log('[HTTP] Open browser: http://localhost:3000');
console.log('[WS] WebSocket: ws://localhost:8080');
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
