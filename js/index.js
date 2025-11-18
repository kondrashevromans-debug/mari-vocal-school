document.addEventListener("DOMContentLoaded", () => {
  const welcomeGuideShown = StorageService.get("welcomeGuideShown");

  if (!welcomeGuideShown) {
    if (window.openInfoModal) {
      window.openInfoModal("welcome");
    }
    StorageService.set("welcomeGuideShown", "true");
  }
});
