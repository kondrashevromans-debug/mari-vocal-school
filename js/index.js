document.addEventListener("DOMContentLoaded", () => {
  const welcomeGuideShown = localStorage.getItem("welcomeGuideShown");
  const tunerLink = document.querySelector('a[href="tuner.html"]');
  const trainerLink = document.querySelector('a[href="trainer_menu.html"]');

  if (tunerLink) {
    tunerLink.addEventListener("click", () => {
      console.log(
        "Пользователь нажал на ссылку тюнера. Устанавливаю флаг предзагрузки."
      );

      // Устанавливаем флаг в sessionStorage. Он "живет" только пока открыта вкладка браузера.
      // Это нужно, чтобы следующая страница (tuner.html) знала, что нужно начать загрузку.
      sessionStorage.setItem("startTunerPreload", "true");
    });
  }
  if (trainerLink) {
    trainerLink.addEventListener("click", () => {
      console.log(
        "Пользователь нажал на ссылку Вокального тренажера. Устанавливаю флаг предзагрузки."
      );
      // Используем другой, уникальный ключ для тренажера
      sessionStorage.setItem("startTrainerPreload", "true");
    });
  }
  // Здесь может быть ваш остальной код для главной страницы, если он есть.
  // Например, инициализация модальных окон, проверка достижений и т.д.
  AchievementsEngine.checkAndUnlock(); // Предполагая, что эта функция должна быть здесь
  if (!welcomeGuideShown) {
    if (window.openInfoModal) {
      window.openInfoModal("welcome");
    }
    localStorage.setItem("welcomeGuideShown", "true");
  }
});
