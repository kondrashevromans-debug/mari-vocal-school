document.addEventListener("DOMContentLoaded", () => {
  const welcomeGuideShown = localStorage.getItem("welcomeGuideShown");

  if (!welcomeGuideShown) {
    if (window.openInfoModal) {
      window.openInfoModal("welcome");
    }
    localStorage.setItem("welcomeGuideShown", "true");
  }
  // --- ДОБАВЛЕНО: Инициализация аудио при переходе на тренажёры ---
  let audioInitialized = false;
  function handleAudioInitAndNavigate(e) {
    if (audioInitialized) return;
    e.preventDefault();
    if (window.loadingIndicator) window.loadingIndicator.style.display = "flex";
    pianoSoundService
      .initialize()
      .then(() => {
        audioInitialized = true;
        if (window.loadingIndicator)
          window.loadingIndicator.style.display = "none";
        window.location.href = e.currentTarget.href;
      })
      .catch((err) => {
        if (window.loadingIndicator)
          window.loadingIndicator.textContent = "Ошибка загрузки звуков";
        alert("Ошибка загрузки аудио");
      });
  }

  // Кнопка 'Проверка на попадание в ноты'
  const tunerBtn = document.querySelector('a[href="tuner.html"]');
  if (tunerBtn) {
    tunerBtn.addEventListener("click", handleAudioInitAndNavigate);
  }
  // Кнопка 'Вокальный тренажер'
  const trainerBtn = document.querySelector('a[href="trainer_menu.html"]');
  if (trainerBtn) {
    trainerBtn.addEventListener("click", handleAudioInitAndNavigate);
  }
});
