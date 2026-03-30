import { KernelController } from "./kernel/KernelController.js";
import { initializeKernelInterface, executeKernelCommand } from "./kernel/interface.js";
import { GameLogicController } from "./game/GameLogicController.js";
import { UIController } from "./ui/UIController.js";
import { ViewportManager } from "./ui/ViewportManager.js";
import { RenderManager } from "./ui/RenderManager.js";

const kernel = new KernelController({ seed: "seedworld-v1" });
initializeKernelInterface(kernel);

const gameLogic = new GameLogicController(kernel, { domain: "game" });
const viewportManager = new ViewportManager().start();
const renderManager = new RenderManager({ viewportManager }).start();

const ui = new UIController({
  kernel,
  gameLogic,
  viewportManager,
  renderManager,
  kernelCommand: executeKernelCommand,
  elements: {
    tileGridContainer: document.querySelector("#tile-grid-container"),
    statusValue: document.querySelector("#status-value"),
    summaryValue: document.querySelector("#summary-value"),
    stateValue: document.querySelector("#state-value"),
    actionInput: document.querySelector("#action-input"),
    stateInput: document.querySelector("#state-input"),
    planButton: document.querySelector("#btn-plan"),
    applyButton: document.querySelector("#btn-apply"),
    refreshButton: document.querySelector("#btn-refresh"),
    guardButton: document.querySelector("#btn-guard"),
    guardValue: document.querySelector("#guard-value"),
    form: document.querySelector("#runtime-form")
  }
});

if (typeof window !== "undefined") {
  window.seedWorldUI = ui;
  window.seedWorldViewportManager = viewportManager;
  window.seedWorldRenderManager = renderManager;
}

ui.bootstrap();
