import { WebSocketPatchServer } from './server/websocketServer.js';
import { executeKernelCommand, initializeKernelInterface } from './kernel/interface.js';
import { KernelController } from './kernel/KernelController.js';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main Server Application
 * Combines HTTP server for static files with WebSocket server for live updates
 */
class MainServer {
  constructor(httpPort = 3000, wsPort = 8080) {
    this.httpPort = httpPort;
    this.wsPort = wsPort;
    // Create kernel instance and initialize interface
    const kernelController = new KernelController();
    this.kernelInterface = executeKernelCommand;
    initializeKernelInterface(kernelController);
    
    this.wsServer = new WebSocketPatchServer(wsPort);
    
    // Connect WebSocket server to kernel interface
    this.wsServer.setKernelInterface(this.kernelInterface);
    
    this.setupHTTPServer();
  }

  setupHTTPServer() {
    const server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(this.httpPort, () => {
      console.log(`[HTTP] Server running on http://localhost:${this.httpPort}`);
    });

    this.server = server;
  }

  handleRequest(req, res) {
    const url = req.url;

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Serve simple patch UI
    if (url === '/simple-patch') {
      this.serveStaticFile(req, res, '/simple-patch-ui.html');
      return;
    }

    // API endpoints
    if (url.startsWith('/api/')) {
      this.handleAPIRequest(req, res);
      return;
    }

    // Static file serving
    this.serveStaticFile(req, res);
  }

  handleAPIRequest(req, res) {
    const url = req.url;
    
    try {
      if (url === '/api/patches' && req.method === 'GET') {
        // Get all patches
        const result = this.kernelInterface('patch.state');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.patches || []));
        return;
      }

      if (url === '/api/patches' && req.method === 'POST') {
        // Create/update patch
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const patch = JSON.parse(body);
            const result = this.kernelInterface('patch.apply', {
              patch
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
        });
        return;
      }

      if (url.startsWith('/api/patches/') && req.method === 'DELETE') {
        // Delete patch
        const patchId = url.split('/').pop();
        const result = this.kernelInterface('patch.apply', {
          patchId
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (url === '/api/hooks' && req.method === 'GET') {
        // Get available hooks
        const result = this.kernelInterface('korner.manifest');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // Unknown API endpoint
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API endpoint not found' }));

    } catch (error) {
      console.error('[API] Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  serveStaticFile(req, res, customPath = null) {
    let filePath = customPath || req.url;
    if (filePath === '/') filePath = '/index.html';
    
    filePath = join(__dirname, '..', filePath);

    try {
      const content = readFileSync(filePath);
      const ext = filePath.split('.').pop();
      
      const contentType = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'svg': 'image/svg+xml'
      }[ext] || 'text/plain';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      // File not found, serve index.html for SPA routing
      if (req.url !== '/' && req.url !== '/index.html' && !customPath) {
        try {
          const indexContent = readFileSync(join(__dirname, '..', 'index.html'));
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(indexContent);
        } catch (indexError) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      }
    }
  }

  close() {
    if (this.wsServer) {
      this.wsServer.close();
    }
    if (this.server) {
      this.server.close();
    }
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MainServer();
  
  console.log('[SERVER] Starting SeedWorld Development Server...');
  console.log('[HTTP] Navigate to: http://localhost:3000');
  console.log('[WS] WebSocket on: ws://localhost:8080');
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[SERVER] Shutting down...');
    server.close();
    process.exit(0);
  });
  
  // Keep server running
  process.on('uncaughtException', (error) => {
    console.error('[SERVER] Uncaught exception:', error);
  });
}

export { MainServer };
