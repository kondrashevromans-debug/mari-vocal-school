// --- КОНФИГУРАЦИЯ ---
// Вставь сюда ссылку на свой Google Script (Web App URL)
const GOOGLE_SCRIPT_URL = "ВСТАВЬ_СЮДА_СВОЮ_ССЫЛКУ_ОТ_GOOGLE_SCRIPT";

document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram.WebApp;
  tg.expand(); // Разворачиваем приложение на весь экран

  const accessScreen = document.getElementById("access-screen");
  const accessLoader = document.getElementById("access-loader");
  const accessDenied = document.getElementById("access-denied");

  // --- Функция проверки доступа ---
  async function checkAccess() {
    try {
      // Получаем ID пользователя из Telegram
      const user = tg.initDataUnsafe?.user;
      const userId = user?.id;

      // Если открыли не в Телеграме или нет ID
      if (!userId) {
        console.warn("No Telegram User ID found. Are you testing in browser?");
        // Для тестов в браузере можно раскомментировать строку ниже, чтобы пускало всех:
        // runApp(); return;

        accessLoader.style.display = "none";
        accessDenied.style.display = "block";
        accessDenied.querySelector("p").innerHTML =
          "Чтобы получить доступ, отправьте в бота<br>команду /start и попробуйте еще раз.";
        return;
      }

      // Делаем запрос к Google Таблице
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?user_id=${userId}`);
      const data = await response.json();

      if (data.allowed) {
        // ДОСТУП РАЗРЕШЕН
        accessScreen.style.display = "none"; // Убираем экран блокировки
        runApp(); // Запускаем основную логику приложения
      } else {
        // ДОСТУП ЗАПРЕЩЕН
        accessLoader.style.display = "none";
        accessDenied.style.display = "block";
      }
    } catch (error) {
      console.error("Ошибка проверки доступа:", error);
      accessLoader.innerHTML = "Ошибка соединения.<br>Попробуйте позже.";
    }
  }

  // --- Основная логика приложения (запускается только после проверки) ---
  function runApp() {
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
      if (window.loadingIndicator)
        window.loadingIndicator.style.display = "flex";
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

    AchievementsEngine.checkAndUnlock();
  }

  // Запускаем проверку при загрузке
  checkAccess();
});
