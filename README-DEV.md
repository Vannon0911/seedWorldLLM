# SeedWorld - Deterministic Patch Development

## Live Development Setup

SeedWorld now supports live patch development with deterministic kernel plugins.

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run server
   ```

3. **Open browser interface:**
   - Navigate to `http://localhost:3000`
   - Toggle between Game Mode and Patcher Mode

4. **Create/edit patches:**
   - Edit JSON files in `/patches/` directory
   - Changes are automatically detected and applied
   - WebSocket updates provide real-time feedback

## Architecture

### Three-Layer System

1. **Browser GUI** (localhost:3000)
   - Game Mode: Standard gameplay
   - Patcher Mode: Live development interface
   - Seamless toggle between modes

2. **Patcher-Plugin** (The Gate)
   - **Validator**: Schema and deterministic compliance checking
   - **Indexer**: Patch management and rollback capabilities
   - **Dispatcher**: Synchronous hook execution

3. **Deterministic Kernel**
   - Independent core with hot-swap capability
   - Patch hook system for live code injection
   - 100% reproducible execution

### Kernel Hook Points

- `advanceTick`: Executed during each game tick
- `placeStructure`: Building placement validation and logic
- `inspectTile`: Tile information retrieval
- `getBuildOptions`: Build catalog management

## Patch Development

### Patch Structure

Each patch is a JSON manifest with the following structure:

```json
{
  "id": "patch-identifier",
  "version": "1.0.0",
  "description": "Human-readable description",
  "hooks": {
    "hookName": {
      "code": "// Deterministic JavaScript code",
      "priority": 100,
      "phase": "update"
    }
  },
  "schema": {
    "version": "1.0",
    "type": "gameplay"
  }
}
```

### Deterministic Requirements

**FORBIDDEN (immediate validation failure):**
- `Math.random()` - Use kernel-provided RNG only
- `Date.now()`, `performance.now()` - Use kernel ticks only
- `setTimeout`, `setInterval` - No async operations
- API calls, localStorage, DOM manipulation - No side effects

**REQUIRED:**
- All state mutations via kernel methods
- Pure functions with same input → same output
- Schema-defined configuration only

### Example Patches

See `/patches/` directory for examples:
- `example-miner-boost.json` - Productivity enhancement
- `example-structure-cost-modifier.json` - Economy modification

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:8080');
```

### Messages

**Patch Update:**
```json
{
  "type": "patchUpdate",
  "patches": [...]
}
```

**Validation Result:**
```json
{
  "type": "validationResult",
  "result": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

**Apply/Remove Results:**
```json
{
  "type": "patchApplyResult",
  "result": {
    "success": true,
    "patchId": "example-patch"
  }
}
```

## HTTP API Endpoints

- `GET /api/patches` - List all patches
- `POST /api/patches` - Register new patch
- `DELETE /api/patches/:id` - Remove patch
- `GET /api/hooks` - Get available hooks

## Development Workflow

1. **Create patch** in `/patches/` directory
2. **File watcher** detects changes automatically
3. **Validator** checks deterministic compliance
4. **WebSocket** pushes updates to browser
5. **Patcher UI** shows validation results
6. **Apply patch** to test in real-time
7. **Toggle to Game Mode** to see effects

## File Structure

```
seedWorldLLM/
├── index.html              # Main browser interface
├── src/
│   ├── kernel/
│   │   └── KernelController.js    # Extended with patch hooks
│   ├── server/
│   │   └── websocketServer.js     # Live update server
│   └── mainServer.js              # Combined HTTP+WS server
├── patches/
│   ├── patch-schema.json          # Validation schema
│   ├── example-miner-boost.json   # Example patch
│   └── *.json                     # Your patches here
└── package.json
```

## Running the System

**Development Server:**
```bash
npm run server
```
- HTTP server on localhost:3000
- WebSocket server on localhost:8080
- Hot-reload enabled

**Kernel Only:**
```bash
npm run kernel
```

**Tests:**
```bash
npm test
```

## Troubleshooting

**WebSocket not connecting:**
- Check port 8080 is available
- Verify firewall settings
- Restart server

**Patch validation failing:**
- Check for forbidden patterns in code
- Verify JSON syntax
- Review patch schema compliance

**Hot-reload not working:**
- Ensure files are in `/patches/` directory
- Check file permissions
- Verify WebSocket connection
