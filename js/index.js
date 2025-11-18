document.addEventListener("DOMContentLoaded", () => {
  const welcomeGuideShown = localStorage.getItem("welcomeGuideShown");

  if (!welcomeGuideShown) {
    if (window.openInfoModal) {
      window.openInfoModal("welcome");
    }
    localStorage.setItem("welcomeGuideShown", "true");
  }
});
