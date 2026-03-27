export function installUiEvents(controller) {
  const form = controller?.elements?.form;
  const planButton = controller?.elements?.planButton;
  const applyButton = controller?.elements?.applyButton;
  const refreshButton = controller?.elements?.refreshButton;
  const guardButton = controller?.elements?.guardButton;

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      controller.handlePlan();
    });
  }

  if (applyButton) {
    applyButton.addEventListener("click", (event) => {
      event.preventDefault();
      controller.handleApply();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", (event) => {
      event.preventDefault();
      controller.refresh();
    });
  }

  if (guardButton) {
    guardButton.addEventListener("click", (event) => {
      event.preventDefault();
      controller.handleGuard();
    });
  }
}
