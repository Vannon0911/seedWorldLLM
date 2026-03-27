import { executeKernelCommand } from "./kernel/interface.js";
import { KernelController } from "./kernel/KernelController.js";
import { GameLogicController } from "./game/GameLogicController.js";
import { UIController } from "./ui/UIController.js";
import { installUiEvents } from "./ui/events.js";

const kernel = new KernelController();
const gameLogic = new GameLogicController(kernel, { domain: "game" });

const ui = new UIController({
  kernel,
  gameLogic,
  kernelCommand: executeKernelCommand,
  elements: {
    form: document.querySelector("#ui-form"),
    actionInput: document.querySelector("#action-input"),
    stateInput: document.querySelector("#state-input"),
    tileGridContainer: document.querySelector("#tile-grid-container"),
    statusValue: document.querySelector("#status-value"),
    summaryValue: document.querySelector("#summary-value"),
    stateValue: document.querySelector("#state-value"),
    guardValue: document.querySelector("#guard-value"),
    planButton: document.querySelector("#plan-button"),
    applyButton: document.querySelector("#apply-button"),
    refreshButton: document.querySelector("#refresh-button"),
    guardButton: document.querySelector("#guard-button")
  }
});

if (typeof window !== "undefined") {
  window.seedWorldUI = ui;
}

installUiEvents(ui);
ui.bootstrap();
