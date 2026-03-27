import { WebSocketServer } from 'ws';
import { readFileSync, readdirSync, watchFile, unwatchFile } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * WebSocket Server for Live Patch Development
 * Handles real-time patch updates and validation
 */
export class WebSocketPatchServer {
  constructor(port = 8080, patchDir = '../patches') {
    this.port = port;
    this.patchDir = join(__dirname, patchDir);
    this.clients = new Set();
    this.patches = new Map();
    this.fileWatchers = new Map();
    this.kernelInterface = null;
    
    this.server = new WebSocketServer({ port });
    this.setupServer();
    this.loadPatches();
  }

  setKernelInterface(kernelInterface) {
    this.kernelInterface = kernelInterface;
  }

  setupServer() {
    this.server.on('connection', (ws) => {
      console.log('[WS] Client connected');
      this.clients.add(ws);

      // Send current patch list
      this.sendToClient(ws, {
        type: 'patchUpdate',
        patches: Array.from(this.patches.values())
      });

      ws.on('message', (data) => {
        this.handleMessage(ws, JSON.parse(data.toString()));
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WS] WebSocket error:', error);
      });
    });

    console.log(`[WS] WebSocket server running on port ${this.port}`);
  }

  handleMessage(ws, message) {
    switch (message.type) {
      case 'validatePatch':
        this.validatePatch(message.patch);
        break;
      case 'applyPatch':
        this.applyPatch(message.patch);
        break;
      case 'removePatch':
        this.removePatch(message.patchId);
        break;
      case 'refreshPatches':
        this.loadPatches();
        break;
      default:
        console.warn('[WS] Unknown message type:', message.type);
    }
  }

  loadPatches() {
    try {
      const patchFiles = readdirSync(this.patchDir)
        .filter(file => extname(file) === '.json');

      this.patches.clear();
      
      for (const file of patchFiles) {
        const filePath = join(this.patchDir, file);
        try {
          const content = readFileSync(filePath, 'utf8');
          const patch = JSON.parse(content);
          
          // Add metadata
          patch.filename = file;
          patch.lastModified = Date.now();
          patch.active = false;
          
          this.patches.set(patch.id, patch);
          
          // Setup file watcher
          this.watchPatchFile(filePath, patch.id);
          
        } catch (error) {
          console.error(`[WS] Failed to load patch ${file}:`, error);
        }
      }

      this.broadcast({
        type: 'patchUpdate',
        patches: Array.from(this.patches.values())
      });

    } catch (error) {
      console.error('[WS] Failed to load patches:', error);
    }
  }

  watchPatchFile(filePath, patchId) {
    // Remove existing watcher if any
    if (this.fileWatchers.has(patchId)) {
      unwatchFile(filePath);
    }

    watchFile(filePath, (curr, prev) => {
      console.log(`[WS] Patch file changed: ${patchId}`);
      this.reloadPatch(patchId);
    });

    this.fileWatchers.set(patchId, filePath);
  }

  reloadPatch(patchId) {
    const patch = this.patches.get(patchId);
    if (!patch) return;

    try {
      const filePath = join(this.patchDir, patch.filename);
      const content = readFileSync(filePath, 'utf8');
      const updatedPatch = JSON.parse(content);
      
      // Preserve metadata
      updatedPatch.filename = patch.filename;
      updatedPatch.lastModified = Date.now();
      updatedPatch.active = patch.active;
      
      this.patches.set(patchId, updatedPatch);
      
      this.broadcast({
        type: 'patchUpdate',
        patches: Array.from(this.patches.values())
      });

    } catch (error) {
      console.error(`[WS] Failed to reload patch ${patchId}:`, error);
    }
  }

  validatePatch(patch) {
    if (!this.kernelInterface) {
      this.broadcast({
        type: 'validationResult',
        result: {
          valid: false,
          errors: ['Kernel interface not available']
        }
      });
      return;
    }

    try {
      const result = this.kernelInterface('patch.apply', {
        patch
      });

      this.broadcast({
        type: 'validationResult',
        result: {
          valid: result.valid,
          errors: result.errors || [],
          warnings: result.warnings || []
        }
      });

    } catch (error) {
      this.broadcast({
        type: 'validationResult',
        result: {
          valid: false,
          errors: [error.message]
        }
      });
    }
  }

  applyPatch(patch) {
    if (!this.kernelInterface) {
      this.broadcast({
        type: 'patchApplyResult',
        result: {
          success: false,
          error: 'Kernel interface not available'
        }
      });
      return;
    }

    try {
      const result = this.kernelInterface('patch.apply', {
        patch
      });

      if (result.success) {
        // Update patch status
        const storedPatch = this.patches.get(patch.id);
        if (storedPatch) {
          storedPatch.active = true;
        }

        this.broadcast({
          type: 'patchApplyResult',
          result: {
            success: true,
            patchId: patch.id,
            registeredHooks: result.registeredHooks
          }
        });

        this.broadcast({
          type: 'patchUpdate',
          patches: Array.from(this.patches.values())
        });
      } else {
        this.broadcast({
          type: 'patchApplyResult',
          result: {
            success: false,
            error: result.error
          }
        });
      }

    } catch (error) {
      this.broadcast({
        type: 'patchApplyResult',
        result: {
          success: false,
          error: error.message
        }
      });
    }
  }

  removePatch(patchId) {
    if (!this.kernelInterface) {
      this.broadcast({
        type: 'patchRemoveResult',
        result: {
          success: false,
          error: 'Kernel interface not available'
        }
      });
      return;
    }

    try {
      const result = this.kernelInterface('patch.apply', {
        patchId
      });

      if (result.success) {
        // Update patch status
        const storedPatch = this.patches.get(patchId);
        if (storedPatch) {
          storedPatch.active = false;
        }

        this.broadcast({
          type: 'patchRemoveResult',
          result: {
            success: true,
            patchId
          }
        });

        this.broadcast({
          type: 'patchUpdate',
          patches: Array.from(this.patches.values())
        });
      } else {
        this.broadcast({
          type: 'patchRemoveResult',
          result: {
            success: false,
            error: result.error
          }
        });
      }

    } catch (error) {
      this.broadcast({
        type: 'patchRemoveResult',
        result: {
          success: false,
          error: error.message
        }
      });
    }
  }

  sendToClient(client, message) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(message));
    }
  }

  broadcast(message) {
    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }

  close() {
    // Clean up file watchers
    for (const filePath of this.fileWatchers.values()) {
      unwatchFile(filePath);
    }
    this.fileWatchers.clear();

    // Close WebSocket server
    this.server.close();
  }
}
