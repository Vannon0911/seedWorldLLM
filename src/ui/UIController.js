import { MS_PER_TICK } from "./IconAnimations.js";
import { TileGridRenderer } from "./TileGridRenderer.js";

const DEFAULT_ACTION = Object.freeze({
  type: "inspect",
  payload: {}
});

const DEFAULT_STATE = Object.freeze({});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function clone(value) {
  return structuredClone(value);
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function parseJson(text, fallback, label) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) {
    return clone(fallback);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      throw new Error(`${label} muss JSON-Objekt sein.`);
    }

    return parsed;
  } catch (error) {
    throw new Error(`[UI_CONTROLLER] ${label}: ${error.message}`);
  }
}

function setTextContent(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function setDisabled(elements, disabled) {
  for (const element of elements) {
    if (element) {
      element.disabled = disabled;
    }
  }
}

export class UIController {
  constructor({ kernel, gameLogic, kernelCommand, elements = {} } = {}) {
    if (!kernel || typeof kernel.plan !== "function" || typeof kernel.apply !== "function") {
      throw new Error("[UI_CONTROLLER] kernel mit plan/apply erforderlich.");
    }

    if (!gameLogic || typeof gameLogic.calculateAction !== "function") {
      throw new Error("[UI_CONTROLLER] gameLogic mit calculateAction erforderlich.");
    }

    if (typeof kernelCommand !== "function") {
      throw new Error("[UI_CONTROLLER] kernelCommand erforderlich.");
    }

    this.kernel = kernel;
    this.gameLogic = gameLogic;
    this.kernelCommand = kernelCommand;
    this.elements = elements;
    this.currentState = clone(DEFAULT_STATE);
    this.displayState = clone(DEFAULT_STATE);
    this.lastPlan = null;
    this.lastApply = null;
    this.lastGuardResult = null;
    this.busy = false;
    this.currentTick = 0;
    this.tickTimer = null;
    this.tickRateMs = Number.isFinite(elements.tickRateMs) ? elements.tickRateMs : MS_PER_TICK;
    this.tileGridRenderer = null;
  }

  bootstrap() {
    this.#ensureDefaultInputs();
    this.#ensureTileGrid();
    this.#renderGrid();
    this.#startTickLoop();
    this.refresh();
  }

  async handlePlan() {
    try {
      this.#setBusy(true);
      const request = this.#readRequest();
      const calculation = this.gameLogic.calculateAction(request.action, request.state);
      const result = await this.kernel.plan({
        domain: calculation.domain,
        action: calculation.action,
        state: request.state,
        patches: calculation.patches,
        actionSchema: this.gameLogic.getActionSchema(),
        mutationMatrix: this.gameLogic.getMutationMatrix()
      });

      this.lastPlan = result;
      this.displayState = clone(result.previewState);
      this.#renderStatus("plan-ok");
      this.#renderSummary({
        mode: "plan",
        kernel: result
      });
      this.#renderState(this.displayState);
      this.#renderGrid();
    } catch (error) {
      this.#renderStatus("plan-blocked");
      this.#renderSummary({ error: String(error.message || error) });
    } finally {
      this.#setBusy(false);
    }
  }

  async handleApply() {
    try {
      this.#setBusy(true);
      const request = this.#readRequest();
      const calculation = this.gameLogic.calculateAction(request.action, request.state);
      const result = await this.kernel.apply({
        domain: calculation.domain,
        action: calculation.action,
        state: request.state,
        patches: calculation.patches,
        actionSchema: this.gameLogic.getActionSchema(),
        mutationMatrix: this.gameLogic.getMutationMatrix()
      });

      this.currentState = clone(result.previewState);
      this.displayState = clone(result.previewState);
      this.lastApply = result;
      this.#syncStateInput(this.currentState);
      this.#renderStatus("apply-ok");
      this.#renderSummary({
        mode: "apply",
        kernel: result
      });
      this.#renderState(this.currentState);
      this.#renderGrid();
    } catch (error) {
      this.#renderStatus("apply-blocked");
      this.#renderSummary({ error: String(error.message || error) });
    } finally {
      this.#setBusy(false);
    }
  }

  refresh() {
    try {
      this.currentState = this.#readStateInput();
      this.displayState = clone(this.currentState);
      this.#renderStatus("refresh");
      this.#renderSummary({
        mode: "refresh",
        kernelState: this.currentState
      });
      this.#renderState(this.currentState);
      this.#renderGrid();
    } catch (error) {
      this.#renderStatus("refresh-blocked");
      this.#renderSummary({ error: String(error.message || error) });
    }
  }

  async handleGuard() {
    this.#setBusy(true);
    try {
      const result = await this.kernelCommand("governance.llm-chain", {
        domain: "kernelMeta",
        state: { kernelMeta: { revision: 1, note: "baseline" } },
        action: { type: "PATCH_REVIEW", payload: { requestedBy: "ui" } },
        actionSchema: {
          PATCH_REVIEW: { required: ["requestedBy"] }
        },
        mutationMatrix: {
          kernelMeta: ["kernelMeta.revision", "kernelMeta.note"]
        },
        patches: [
          { op: "set", path: "kernelMeta.revision", value: 2, domain: "kernelMeta" },
          { op: "set", path: "kernelMeta.note", value: "reviewed", domain: "kernelMeta" }
        ]
      });

      this.lastGuardResult = result;
      this.#renderStatus("guard-ok");
      setTextContent(this.elements.guardValue, pretty(result));
    } catch (error) {
      this.#renderStatus("guard-blocked");
      setTextContent(this.elements.guardValue, String(error.message || error));
    } finally {
      this.#setBusy(false);
    }
  }

  #readRequest() {
    const action = parseJson(this.elements.actionInput?.value, DEFAULT_ACTION, "action");
    const state = parseJson(this.elements.stateInput?.value, DEFAULT_STATE, "state");
    return { action, state };
  }

  #readStateInput() {
    return parseJson(this.elements.stateInput?.value, DEFAULT_STATE, "state");
  }

  #ensureDefaultInputs() {
    if (this.elements.actionInput && !this.elements.actionInput.value.trim()) {
      this.elements.actionInput.value = pretty(DEFAULT_ACTION);
    }

    if (this.elements.stateInput && !this.elements.stateInput.value.trim()) {
      this.elements.stateInput.value = pretty(DEFAULT_STATE);
    }

    this.currentState = clone(DEFAULT_STATE);
    this.displayState = clone(DEFAULT_STATE);
    this.#renderStatus("ready");
    this.#renderSummary({ mode: "boot" });
    this.#renderState(this.currentState);
    setTextContent(this.elements.guardValue, "-");
  }

  #ensureTileGrid() {
    if (this.tileGridRenderer) {
      return;
    }

    const container = this.elements.tileGridContainer || document.getElementById("tile-grid-container");
    if (!container) {
      return;
    }

    this.tileGridRenderer = new TileGridRenderer(container, 8, 6, 80);
    this.tileGridRenderer.onTileClick(({ tile, x, y }) => {
      this.#renderStatus(`tile:${x},${y}`);
      this.#renderSummary({
        mode: "tile-click",
        tile
      });
    });
  }

  #renderGrid() {
    if (this.tileGridRenderer) {
      this.tileGridRenderer.render(this.displayState, this.currentTick);
    }
  }

  #startTickLoop() {
    if (this.tickTimer !== null || typeof window === "undefined" || typeof window.setTimeout !== "function") {
      return;
    }

    const loop = () => {
      this.currentTick += 1;
      this.#renderGrid();
      this.tickTimer = window.setTimeout(loop, this.tickRateMs);
    };

    this.tickTimer = window.setTimeout(loop, this.tickRateMs);
  }

  #renderStatus(value) {
    setTextContent(this.elements.statusValue, value);
  }

  #renderSummary(value) {
    setTextContent(this.elements.summaryValue, pretty(value));
  }

  #renderState(value) {
    setTextContent(this.elements.stateValue, pretty(value));
  }

  #syncStateInput(value) {
    if (this.elements.stateInput) {
      this.elements.stateInput.value = pretty(value);
    }
  }

  #setBusy(isBusy) {
    this.busy = isBusy;
    const controls = [
      this.elements.planButton,
      this.elements.applyButton,
      this.elements.refreshButton,
      this.elements.guardButton
    ];

    if (this.elements.form) {
      this.elements.form.toggleAttribute("aria-busy", isBusy);
    }

    setDisabled(controls.filter(Boolean), isBusy);
  }
}
