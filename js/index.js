document.addEventListener("DOMContentLoaded", () => {
  // --- Приветственный попап ---
  const welcomePopup = document.getElementById("welcome-popup");
  const readyBtn = document.getElementById("welcome-ready-btn");
  let audioInitialized = false;

  function isAudioCached() {
    return (
      pianoSoundService &&
      pianoSoundService.isAnySampleLoaded &&
      pianoSoundService.isAnySampleLoaded()
    );
  }

  function startAudioInitIfNeeded() {
    if (audioInitialized || isAudioCached()) return;
    if (window.loadingIndicator) window.loadingIndicator.style.display = "flex";
    pianoSoundService
      .initialize()
      .then(() => {
        audioInitialized = true;
        if (window.loadingIndicator)
          window.loadingIndicator.style.display = "none";
      })
      .catch((err) => {
        if (window.loadingIndicator)
          window.loadingIndicator.textContent = "Ошибка загрузки звуков";
        alert("Ошибка загрузки аудио");
      });
  }

  // Показываем попап только если не было в этой сессии
  if (welcomePopup && readyBtn) {
    if (!sessionStorage.getItem("welcomePopupShown")) {
      welcomePopup.style.display = "flex";
    } else {
      welcomePopup.style.display = "none";
    }
    readyBtn.addEventListener("click", () => {
      welcomePopup.style.display = "none";
      sessionStorage.setItem("welcomePopupShown", "1");
      startAudioInitIfNeeded();
    });
  }

  // --- Инициализация аудио при переходе на тренажёры ---
  // function handleAudioInitAndNavigate(e) {
  //   if (audioInitialized || isAudioCached()) return;
  //   e.preventDefault();
  //   if (window.loadingIndicator) window.loadingIndicator.style.display = "flex";
  //   pianoSoundService
  //     .initialize()
  //     .then(() => {
  //       audioInitialized = true;
  //       if (window.loadingIndicator)
  //         window.loadingIndicator.style.display = "none";
  //       window.location.href = e.currentTarget.href;
  //     })
  //     .catch((err) => {
  //       if (window.loadingIndicator)
  //         window.loadingIndicator.textContent = "Ошибка загрузки звуков";
  //       alert("Ошибка загрузки аудио");
  //     });
  // }

  // Кнопка 'Проверка на попадание в ноты'
  // const tunerBtn = document.querySelector('a[href="tuner.html"]');
  // if (tunerBtn) {
  //   tunerBtn.addEventListener("click", handleAudioInitAndNavigate);
  // }
  // Кнопка 'Вокальный тренажер'
  // const trainerBtn = document.querySelector('a[href="trainer_menu.html"]');
  // if (trainerBtn) {
  //   trainerBtn.addEventListener("click", handleAudioInitAndNavigate);
  // }

  AchievementsEngine.checkAndUnlock();
});
