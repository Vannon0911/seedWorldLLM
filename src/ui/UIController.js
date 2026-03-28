import { MS_PER_TICK } from "./IconAnimations.js";
import { TileGridRenderer } from "./TileGridRenderer.js";
import { generateWorld } from "../game/worldGen.js";

const DEFAULT_ACTION = Object.freeze({
  type: "inspect",
  payload: {}
});

const DEFAULT_STATE = Object.freeze({
  world: {
    seed: "seedworld-v1",
    size: {
      width: 16,
      height: 12
    }
  }
});

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
  constructor({ kernel, gameLogic, kernelCommand, viewportManager = null, elements = {} } = {}) {
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
    this.viewportManager = viewportManager && typeof viewportManager.subscribe === "function" ? viewportManager : null;
    this.unsubscribeViewport = null;
    this.elements = elements;
    this.currentState = clone(DEFAULT_STATE);
    this.displayState = clone(DEFAULT_STATE);
    this.lastPlan = null;
    this.lastApply = null;
    this.lastGuardResult = null;
    this.busy = false;
    this.currentTick = 0;
    this.tickTimer = null;
    this.tickDrainTimer = null;
    this.renderFrameHandle = null;
    this.pendingTicks = 0;
    this.tickRateMs = Number.isFinite(elements.tickRateMs) ? elements.tickRateMs : MS_PER_TICK;
    this.tileGridRenderer = null;
  }

  bootstrap() {
    this.#ensureDefaultInputs();
    this.#ensureTileGrid();
    this.#bindViewport();
    this.#ensureWorldState();
    this.#renderGrid();
    this.#startTickScheduler();
    this.#startRenderLoop();
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
      this.#ensureWorldState();
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
    if (!this.elements.stateInput) {
      return clone(this.currentState);
    }
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

    this.tileGridRenderer = new TileGridRenderer(container, 16, 12, 84);
    this.tileGridRenderer.onTileClick(({ tile, x, y }) => {
      this.#renderStatus(`tile:${x},${y}`);
      this.#renderSummary({
        mode: "tile-click",
        tile
      });
    });
  }

  #bindViewport() {
    if (!this.viewportManager || this.unsubscribeViewport) {
      return;
    }

    this.unsubscribeViewport = this.viewportManager.subscribe((viewport) => {
      if (this.tileGridRenderer && typeof this.tileGridRenderer.onViewportChange === "function") {
        this.tileGridRenderer.onViewportChange(viewport);
      }
      this.#renderGrid();
    });
  }

  #renderGrid() {
    if (this.tileGridRenderer) {
      this.tileGridRenderer.render(this.displayState, this.currentTick);
    }
  }

  #ensureWorldState() {
    const world = this.currentState?.world;
    if (world && Array.isArray(world.tiles) && world.tiles.length > 0) {
      return;
    }

    const payload = {
      seed: typeof world?.seed === "string" && world.seed.trim() ? world.seed.trim() : "seedworld-v1",
      width: Number.isInteger(world?.size?.width) ? world.size.width : 16,
      height: Number.isInteger(world?.size?.height) ? world.size.height : 12
    };

    const applyLocalFallback = () => {
      const generated = generateWorld(payload);
      this.currentState = clone({
        ...this.currentState,
        world: generated
      });
      this.displayState = clone(this.currentState);
      this.#syncStateInput(this.currentState);
      this.#renderGrid();
    };

    try {
      const calculation = this.gameLogic.calculateAction({ type: "generate_world", payload }, this.currentState);
      const result = this.kernel.apply({
        domain: calculation.domain,
        action: calculation.action,
        state: this.currentState,
        patches: calculation.patches,
        actionSchema: this.gameLogic.getActionSchema(),
        mutationMatrix: this.gameLogic.getMutationMatrix()
      });

      if (result && typeof result.then === "function") {
        result
          .then((value) => {
            this.currentState = clone(value.previewState);
            this.displayState = clone(value.previewState);
            this.#syncStateInput(this.currentState);
            this.#renderGrid();
          })
          .catch(() => {
            applyLocalFallback();
          });
        return;
      }

      this.currentState = clone(result.previewState);
      this.displayState = clone(result.previewState);
      this.#syncStateInput(this.currentState);
    } catch (_) {
      applyLocalFallback();
    }
  }

  #startTickScheduler() {
    if (this.tickTimer !== null || typeof window === "undefined" || typeof window.setInterval !== "function") {
      return;
    }

    this.tickTimer = window.setInterval(() => {
      this.pendingTicks += 1;
    }, this.tickRateMs);

    this.tickDrainTimer = window.setInterval(() => {
      if (this.pendingTicks <= 0) {
        return;
      }
      const batch = Math.min(this.pendingTicks, 5);
      this.pendingTicks -= batch;
      this.currentTick += batch;
    }, 4);
  }

  #startRenderLoop() {
    if (
      this.renderFrameHandle !== null ||
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    const frame = () => {
      this.#renderGrid();
      this.renderFrameHandle = window.requestAnimationFrame(frame);
    };

    this.renderFrameHandle = window.requestAnimationFrame(frame);
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
