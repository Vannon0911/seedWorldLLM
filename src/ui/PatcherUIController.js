import { BaseUIController } from './BaseUIController.js';

/**
 * Patcher UI Controller with Plugin Architecture
 * Manages the patch development interface
 */
export class PatcherUIController extends BaseUIController {
  constructor(options = {}) {
    super(options);
    this.patches = [];
    this.activePatch = null;
    this.wsConnection = null;
    this.validationResults = new Map();
  }

  createBaseStructure() {
    // Create main patcher layout
    const layout = this.createElement('div', { className: 'patcher-layout' });
    
    // Sidebar
    const sidebar = this.createElement('aside', { className: 'patcher-sidebar' });
    sidebar.appendChild(this.createPatchManagementPanel());
    sidebar.appendChild(this.createActivePatchesPanel());
    
    // Main content
    const main = this.createElement('main', { className: 'patcher-main' });
    main.appendChild(this.createPatchEditor());
    main.appendChild(this.createValidationOutput());
    
    layout.appendChild(sidebar);
    layout.appendChild(main);
    
    this.elementRoot.appendChild(layout);
    
    // Store element references
    this.elements = {
      layout,
      sidebar,
      main,
      patchList: this.getElement('.patch-list'),
      editorForm: this.getElement('.patch-form'),
      validationOutput: this.getElement('.validation-output'),
      patchId: this.getElement('#patchId'),
      patchVersion: this.getElement('#patchVersion'),
      patchDescription: this.getElement('#patchDescription'),
      patchHook: this.getElement('#patchHook'),
      patchPriority: this.getElement('#patchPriority'),
      patchCode: this.getElement('#patchCode')
    };
  }

  createPatchManagementPanel() {
    const panel = this.createElement('div', { className: 'patcher-panel' });
    panel.appendChild(this.createElement('h3', {}, 'Patch Management'));
    
    const controls = this.createElement('div', { className: 'patch-controls' });
    
    const refreshBtn = this.createElement('button', { className: 'patch-btn' }, 'Refresh Patches');
    const validateBtn = this.createElement('button', { className: 'patch-btn' }, 'Validate All');
    
    controls.appendChild(refreshBtn);
    controls.appendChild(validateBtn);
    panel.appendChild(controls);
    
    // Add event listeners
    this.addEventListener(refreshBtn, 'click', () => this.refreshPatches());
    this.addEventListener(validateBtn, 'click', () => this.validateAllPatches());
    
    return panel;
  }

  createActivePatchesPanel() {
    const panel = this.createElement('div', { className: 'patcher-panel' });
    panel.appendChild(this.createElement('h3', {}, 'Active Patches'));
    
    const patchList = this.createElement('div', { className: 'patch-list' });
    panel.appendChild(patchList);
    
    return panel;
  }

  createPatchEditor() {
    const editor = this.createElement('div', { className: 'patch-editor' });
    
    // Header
    const header = this.createElement('div', { className: 'editor-header' });
    header.appendChild(this.createElement('h3', {}, 'Patch Editor'));
    
    const actions = this.createElement('div', { className: 'editor-actions' });
    const newBtn = this.createElement('button', { className: 'editor-btn' }, 'New Patch');
    const saveBtn = this.createElement('button', { className: 'editor-btn' }, 'Save');
    const applyBtn = this.createElement('button', { className: 'editor-btn' }, 'Apply');
    
    actions.appendChild(newBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(applyBtn);
    header.appendChild(actions);
    
    // Content
    const content = this.createElement('div', { className: 'editor-content' });
    content.appendChild(this.createPatchForm());
    
    editor.appendChild(header);
    editor.appendChild(content);
    
    // Add event listeners
    this.addEventListener(newBtn, 'click', () => this.createNewPatch());
    this.addEventListener(saveBtn, 'click', () => this.saveCurrentPatch());
    this.addEventListener(applyBtn, 'click', () => this.applyCurrentPatch());
    
    return editor;
  }

  createPatchForm() {
    const form = this.createElement('div', { className: 'patch-form' });
    
    const fields = [
      { id: 'patchId', label: 'Patch ID:', type: 'text', placeholder: 'example-patch' },
      { id: 'patchVersion', label: 'Version:', type: 'text', placeholder: '1.0.0' },
      { id: 'patchDescription', label: 'Description:', type: 'textarea', placeholder: 'Patch description...' }
    ];
    
    for (const field of fields) {
      const group = this.createElement('div', { className: 'form-group' });
      group.appendChild(this.createElement('label', { htmlFor: field.id }, field.label));
      
      const element = field.type === 'textarea' 
        ? this.createElement('textarea', { id: field.id, placeholder: field.placeholder })
        : this.createElement('input', { id: field.id, type: field.type, placeholder: field.placeholder });
      
      group.appendChild(element);
      form.appendChild(group);
    }
    
    // Hook selector
    const hookGroup = this.createElement('div', { className: 'form-group' });
    hookGroup.appendChild(this.createElement('label', { htmlFor: 'patchHook' }, 'Hook Point:'));
    
    const hookSelect = this.createElement('select', { id: 'patchHook' });
    const hooks = ['advanceTick', 'placeStructure', 'inspectTile', 'getBuildOptions'];
    for (const hook of hooks) {
      hookSelect.appendChild(this.createElement('option', { value: hook }, hook));
    }
    hookGroup.appendChild(hookSelect);
    form.appendChild(hookGroup);
    
    // Priority
    const priorityGroup = this.createElement('div', { className: 'form-group' });
    priorityGroup.appendChild(this.createElement('label', { htmlFor: 'patchPriority' }, 'Priority:'));
    const priorityInput = this.createElement('input', { id: 'patchPriority', type: 'number', value: '100', min: '1', max: '1000' });
    priorityGroup.appendChild(priorityInput);
    form.appendChild(priorityGroup);
    
    // Code editor
    const codeGroup = this.createElement('div', { className: 'form-group' });
    codeGroup.appendChild(this.createElement('label', { htmlFor: 'patchCode' }, 'Patch Code:'));
    const codeTextarea = this.createElement('textarea', { id: 'patchCode', placeholder: '// Deterministic patch code...' });
    codeGroup.appendChild(codeTextarea);
    form.appendChild(codeGroup);
    
    return form;
  }

  createValidationOutput() {
    const output = this.createElement('div', { className: 'patch-output' });
    output.appendChild(this.createElement('h3', {}, 'Validation Output'));
    
    const console = this.createElement('div', { className: 'validation-output' });
    console.appendChild(this.createElement('div', { className: 'console-line' }, 'Ready for patch validation...'));
    
    output.appendChild(console);
    return output;
  }

  async refreshPatches() {
    try {
      const response = await fetch('/api/patches');
      const patches = await response.json();
      
      this.patches = patches;
      this.renderPatchList();
      
      await this.handleEvent('patchesRefreshed', patches);
    } catch (error) {
      console.error('[PATCHER] Failed to refresh patches:', error);
      this.showValidationResult('Failed to refresh patches: ' + error.message, 'error');
    }
  }

  async validateAllPatches() {
    await this.handleEvent('validateAll', this.patches);
  }

  async createNewPatch() {
    this.activePatch = {
      id: '',
      version: '1.0.0',
      description: '',
      hooks: {},
      enabled: true
    };
    
    this.renderPatchForm();
    await this.handleEvent('newPatchCreated', this.activePatch);
  }

  async saveCurrentPatch() {
    if (!this.activePatch) return;
    
    // Update patch from form
    this.activePatch.id = this.elements.patchId.value;
    this.activePatch.version = this.elements.patchVersion.value;
    this.activePatch.description = this.elements.patchDescription.value;
    
    const hookName = this.elements.patchHook.value;
    const priority = parseInt(this.elements.patchPriority.value);
    const code = this.elements.patchCode.value;
    
    this.activePatch.hooks = {
      [hookName]: {
        id: `${this.activePatch.id}-${hookName}`,
        priority,
        code,
        enabled: true
      }
    };
    
    try {
      const response = await fetch('/api/patches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.activePatch)
      });
      
      if (response.ok) {
        this.showValidationResult('Patch saved successfully!', 'success');
        await this.refreshPatches();
      } else {
        throw new Error('Failed to save patch');
      }
    } catch (error) {
      this.showValidationResult('Save failed: ' + error.message, 'error');
    }
    
    await this.handleEvent('patchSaved', this.activePatch);
  }

  async applyCurrentPatch() {
    if (!this.activePatch) return;
    
    await this.handleEvent('patchApply', this.activePatch);
  }

  renderPatchList() {
    const container = this.elements.patchList;
    if (!container) return;
    
    container.innerHTML = '';
    
    for (const patch of this.patches) {
      const patchElement = this.createElement('div', { className: 'patch-item' });
      
      const info = this.createElement('div', { className: 'patch-info' });
      info.appendChild(this.createElement('span', { className: 'patch-name' }, patch.id));
      info.appendChild(this.createElement('span', { className: 'patch-version' }, `v${patch.version}`));
      
      const actions = this.createElement('div', { className: 'patch-actions' });
      const toggleBtn = this.createElement('button', { 
        className: 'patch-action-btn' 
      }, patch.enabled ? 'Disable' : 'Enable');
      
      this.addEventListener(toggleBtn, 'click', () => this.togglePatch(patch.id));
      actions.appendChild(toggleBtn);
      
      patchElement.appendChild(info);
      patchElement.appendChild(actions);
      container.appendChild(patchElement);
    }
  }

  renderPatchForm() {
    if (!this.activePatch || !this.elements.patchId) return;
    
    this.elements.patchId.value = this.activePatch.id || '';
    this.elements.patchVersion.value = this.activePatch.version || '1.0.0';
    this.elements.patchDescription.value = this.activePatch.description || '';
    this.elements.patchCode.value = '';
  }

  showValidationResult(message, type = 'info') {
    const output = this.getElement('.validation-output');
    if (!output) return;
    
    const line = this.createElement('div', { className: `console-line ${type}` }, message);
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  async togglePatch(patchId) {
    await this.handleEvent('patchToggle', patchId);
  }

  render() {
    // Re-render all components
    this.renderPatchList();
    this.renderPatchForm();
  }
}
