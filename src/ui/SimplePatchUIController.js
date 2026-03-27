import { BaseUIController } from './BaseUIController.js';

/**
 * Simple Patch Upload UI Controller
 * Stupidly simple interface for uploading, validating and organizing patches
 */
export class SimplePatchUIController extends BaseUIController {
  constructor(options = {}) {
    super(options);
    this.patches = new Map();
    this.modules = new Map();
    this.uploadQueue = [];
    this.validationResults = new Map();
  }

  createBaseStructure() {
    // Create super simple layout
    const layout = this.createElement('div', { className: 'simple-patch-layout' });
    
    // Header
    const header = this.createElement('header', { className: 'simple-header' });
    header.innerHTML = `
      <h1>🔧 Simple Patch Manager</h1>
      <p>Upload • Validate • Organize</p>
    `;
    
    // Upload Area
    const uploadArea = this.createUploadArea();
    
    // Validation Results
    const validationArea = this.createValidationArea();
    
    // Module Organization
    const moduleArea = this.createModuleArea();
    
    layout.appendChild(header);
    layout.appendChild(uploadArea);
    layout.appendChild(validationArea);
    layout.appendChild(moduleArea);
    
    this.elementRoot.appendChild(layout);
    
    // Store elements
    this.elements = {
      layout,
      uploadArea,
      validationArea,
      moduleArea,
      fileInput: this.getElement('#patchFileInput'),
      dropZone: this.getElement('.drop-zone'),
      validationList: this.getElement('.validation-list'),
      moduleList: this.getElement('.module-list')
    };
  }

  createUploadArea() {
    const uploadArea = this.createElement('section', { className: 'upload-area' });
    
    uploadArea.innerHTML = `
      <h2>📤 Patch Upload</h2>
      <div class="drop-zone" id="dropZone">
        <div class="drop-content">
          <div class="drop-icon">📁</div>
          <p><strong>Drag & Drop Patch Files Here</strong></p>
          <p>or</p>
          <button class="browse-btn" onclick="document.getElementById('patchFileInput').click()">
            Browse Files
          </button>
          <input type="file" id="patchFileInput" accept=".json" multiple style="display: none;">
        </div>
      </div>
      <div class="upload-info">
        <p>Supported: .json patch files • Max 5MB per file</p>
      </div>
    `;
    
    // Setup drag & drop
    this.setupDragAndDrop();
    
    // Setup file input
    const fileInput = uploadArea.querySelector('#patchFileInput');
    this.addEventListener(fileInput, 'change', (e) => this.handleFileSelect(e.target.files));
    
    return uploadArea;
  }

  createValidationArea() {
    const validationArea = this.createElement('section', { className: 'validation-area' });
    
    validationArea.innerHTML = `
      <h2>✅ Validation Results</h2>
      <div class="validation-controls">
        <button class="validate-all-btn" onclick="simplePatchUI.validateAllPatches()">
          Validate All
        </button>
        <button class="clear-btn" onclick="simplePatchUI.clearValidation()">
          Clear Results
        </button>
      </div>
      <div class="validation-list" id="validationList">
        <div class="empty-state">
          <p>No patches uploaded yet</p>
        </div>
      </div>
    `;
    
    return validationArea;
  }

  createModuleArea() {
    const moduleArea = this.createElement('section', { className: 'module-area' });
    
    moduleArea.innerHTML = `
      <h2>📦 Module Organization</h2>
      <div class="module-controls">
        <select class="module-filter" id="moduleFilter">
          <option value="all">All Modules</option>
          <option value="gameplay">Gameplay</option>
          <option value="ui">UI</option>
          <option value="system">System</option>
          <option value="economy">Economy</option>
        </select>
        <button class="organize-btn" onclick="simplePatchUI.organizeModules()">
          Auto-Organize
        </button>
      </div>
      <div class="module-list" id="moduleList">
        <div class="empty-state">
          <p>No modules created yet</p>
        </div>
      </div>
    `;
    
    return moduleArea;
  }

  setupDragAndDrop() {
    const dropZone = this.getElement('.drop-zone');
    
    if (!dropZone) return;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.addEventListener(dropZone, eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      this.addEventListener(dropZone, eventName, () => {
        dropZone.classList.add('drag-over');
      });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      this.addEventListener(dropZone, eventName, () => {
        dropZone.classList.remove('drag-over');
      });
    });
    
    // Handle dropped files
    this.addEventListener(dropZone, 'drop', (e) => {
      const files = e.dataTransfer.files;
      this.handleFileSelect(files);
    });
  }

  async handleFileSelect(files) {
    if (!files || files.length === 0) return;
    
    console.log(`[SIMPLE_PATCH] Processing ${files.length} file(s)`);
    
    for (const file of files) {
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        this.showValidationResult(file.name, false, 'File must be JSON');
        continue;
      }
      
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        this.showValidationResult(file.name, false, 'File too large (max 5MB)');
        continue;
      }
      
      try {
        const content = await this.readFile(file);
        const patchData = JSON.parse(content);
        
        // Add patch to queue
        this.uploadQueue.push({
          file: file.name,
          data: patchData,
          uploadedAt: Date.now()
        });
        
        // Validate immediately
        await this.validatePatch(file.name, patchData);
        
      } catch (error) {
        this.showValidationResult(file.name, false, `Invalid JSON: ${error.message}`);
      }
    }
    
    // Update UI
    this.updateValidationList();
    this.organizeModules();
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  async validatePatch(fileName, patchData) {
    try {
      // Use server API to validate patch (v2 compliant)
      const response = await fetch('/api/patches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patchData)
      });
      
      const result = await response.json();
      
      // Store validation result
      this.validationResults.set(fileName, {
        valid: result.valid,
        errors: result.errors || [],
        warnings: result.warnings || [],
        validatedAt: Date.now(),
        patchData: patchData
      });
      
      // Store patch if valid
      if (result.valid) {
        this.patches.set(fileName, {
          ...patchData,
          fileName,
          validatedAt: Date.now()
        });
      }
      
      this.showValidationResult(fileName, result.valid, 
        result.valid ? 'Valid patch' : result.errors?.join(', ') || 'Unknown error'
      );
      
    } catch (error) {
      this.showValidationResult(fileName, false, `Validation error: ${error.message}`);
    }
  }

  async validateAllPatches() {
    console.log('[SIMPLE_PATCH] Validating all patches...');
    
    for (const [fileName, patchData] of this.patches) {
      await this.validatePatch(fileName, patchData);
    }
    
    this.updateValidationList();
  }

  organizeModules() {
    console.log('[SIMPLE_PATCH] Organizing modules...');
    
    // Clear modules
    this.modules.clear();
    
    // Group patches by type
    for (const [fileName, patch] of this.patches) {
      const moduleType = patch.schema?.type || 'unknown';
      
      if (!this.modules.has(moduleType)) {
        this.modules.set(moduleType, {
          name: this.getModuleName(moduleType),
          type: moduleType,
          patches: [],
          icon: this.getModuleIcon(moduleType)
        });
      }
      
      this.modules.get(moduleType).patches.push({
        fileName,
        id: patch.id,
        version: patch.version,
        description: patch.description,
        validatedAt: patch.validatedAt
      });
    }
    
    this.updateModuleList();
  }

  getModuleName(type) {
    const names = {
      'gameplay': 'Gameplay Modules',
      'ui': 'UI Modules',
      'system': 'System Modules',
      'economy': 'Economy Modules',
      'unknown': 'Unknown Modules'
    };
    return names[type] || 'Unknown Modules';
  }

  getModuleIcon(type) {
    const icons = {
      'gameplay': '🎮',
      'ui': '🖥️',
      'system': '⚙️',
      'economy': '💰',
      'unknown': '❓'
    };
    return icons[type] || '❓';
  }

  showValidationResult(fileName, valid, message) {
    const validationList = this.getElement('.validation-list');
    if (!validationList) return;
    
    // Remove empty state if exists
    const emptyState = validationList.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }
    
    // Create result item
    const resultItem = this.createElement('div', {
      className: `validation-item ${valid ? 'valid' : 'invalid'}`
    });
    
    resultItem.innerHTML = `
      <div class="validation-status">
        <span class="status-icon">${valid ? '✅' : '❌'}</span>
        <span class="file-name">${fileName}</span>
      </div>
      <div class="validation-message">${message}</div>
      <div class="validation-time">${new Date().toLocaleTimeString()}</div>
    `;
    
    // Add to top of list
    validationList.insertBefore(resultItem, validationList.firstChild);
    
    // Limit to 20 items
    const items = validationList.querySelectorAll('.validation-item');
    if (items.length > 20) {
      items[items.length - 1].remove();
    }
  }

  updateValidationList() {
    const validationList = this.getElement('.validation-list');
    if (!validationList) return;
    
    if (this.validationResults.size === 0) {
      validationList.innerHTML = `
        <div class="empty-state">
          <p>No patches uploaded yet</p>
        </div>
      `;
      return;
    }
    
    // Clear and rebuild
    validationList.innerHTML = '';
    
    for (const [fileName, result] of this.validationResults) {
      this.showValidationResult(fileName, result.valid, 
        result.valid ? 'Valid patch' : result.errors?.join(', ') || 'Unknown error'
      );
    }
  }

  updateModuleList() {
    const moduleList = this.getElement('.module-list');
    const filter = this.getElement('#moduleFilter');
    
    if (!moduleList) return;
    
    const filterValue = filter ? filter.value : 'all';
    let modulesToShow = Array.from(this.modules.values());
    
    if (filterValue !== 'all') {
      modulesToShow = modulesToShow.filter(module => module.type === filterValue);
    }
    
    if (modulesToShow.length === 0) {
      moduleList.innerHTML = `
        <div class="empty-state">
          <p>No modules found</p>
        </div>
      `;
      return;
    }
    
    moduleList.innerHTML = '';
    
    for (const module of modulesToShow) {
      const moduleElement = this.createElement('div', { className: 'module-item' });
      
      moduleElement.innerHTML = `
        <div class="module-header">
          <span class="module-icon">${module.icon}</span>
          <div class="module-info">
            <h3>${module.name}</h3>
            <p>${module.patches.length} patch(es)</p>
          </div>
        </div>
        <div class="module-patches">
          ${module.patches.map(patch => `
            <div class="patch-item">
              <div class="patch-info">
                <span class="patch-id">${patch.id}</span>
                <span class="patch-version">v${patch.version}</span>
              </div>
              <div class="patch-description">${patch.description}</div>
            </div>
          `).join('')}
        </div>
      `;
      
      moduleList.appendChild(moduleElement);
    }
  }

  clearValidation() {
    this.validationResults.clear();
    this.updateValidationList();
  }

  // Public methods for global access
  validateAllPatches() {
    for (const [fileName, patchData] of this.patches) {
      this.validatePatch(fileName, patchData);
    }
    this.updateValidationList();
  }

  clearValidationResults() {
    return this.clearValidation();
  }

  organizeModules() {
    this.modules.clear();
    for (const [fileName, patchData] of this.patches) {
      const moduleType = patchData.schema || 'unknown';
      if (!this.modules.has(moduleType)) {
        this.modules.set(moduleType, []);
      }
      this.modules.get(moduleType).push({ fileName, patchData });
    }
    this.updateModuleList();
  }
}
