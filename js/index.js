// --- КОНФИГУРАЦИЯ ---
// Вставь сюда ссылку на свой Google Script (Web App URL)
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzW4boLz6MYzGt9it7rZADb_6nk3wA05K6ya2-oaOr_r3FD62H6s4TnZMbivc3yWPU/exec";

// Глобальный объект для хранения данных о сессии пользователя.
// Другие скрипты смогут получить доступ к уровню пользователя через window.userSession.level
// Это резервный вариант, основной источник теперь sessionStorage.
window.userSession = {
  level: "base", // Уровень доступа по умолчанию
};

document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram.WebApp;
  tg.expand(); // Разворачиваем приложение на весь экран

  const accessScreen = document.getElementById("access-screen");
  const accessLoader = document.getElementById("access-loader");
  const accessDenied = document.getElementById("access-denied");

  // --- Функция проверки доступа ---
  async function checkAccess() {
    // --- НОВОЕ ИЗМЕНЕНИЕ: Проверка DEV-режима ---
    const isDev =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (isDev) {
      console.warn("DEV MODE: доступ разрешён для локальной разработки");
      sessionStorage.setItem("userAccessLevel", "vip"); // Кэшируем VIP-доступ для DEV-режима
      window.userSession.level = "vip"; // Обновляем глобальный объект
      accessScreen.style.display = "none";
      runApp();
      return;
    }

    // --- НОВОЕ ИЗМЕНЕНИЕ: Проверка кэша сессии ---
    const cachedAccessLevel = sessionStorage.getItem("userAccessLevel");
    if (cachedAccessLevel) {
      // Если уровень доступа уже есть в кэше сессии, используем его
      window.userSession.level = cachedAccessLevel; // Обновляем глобальный объект
      console.log(`Доступ из кэша сессии. Уровень: ${cachedAccessLevel}`);

      if (cachedAccessLevel !== "denied") {
        // 'denied' - это специальное значение для отказа
        accessScreen.style.display = "none";
        runApp();
      } else {
        // Если в кэше записан отказ, сразу показываем сообщение об отказе
        accessLoader.style.display = "none";
        accessDenied.style.display = "block";
        accessDenied.querySelector("p").innerHTML =
          "Чтобы получить доступ, отправьте в бота<br>команду /start и попробуйте еще раз.";
      }
      return; // Выходим, так как доступ уже проверен
    }

    // --- Если нет кэша и не DEV-режим, продолжаем обычную проверку ---
    try {
      // Получаем ID пользователя из Telegram
      const user = tg.initDataUnsafe?.user;
      const userId = user?.id;

      // Если открыли не в Телеграме или нет ID
      if (!userId) {
        console.warn("No Telegram User ID found. Are you testing in browser?");
        // --- НОВОЕ ИЗМЕНЕНИЕ: Кэшируем отказ ---
        sessionStorage.setItem("userAccessLevel", "denied");
        window.userSession.level = "denied"; // Обновляем глобальный объект
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
        const userLevel = data.level || "base";
        // --- НОВОЕ ИЗМЕНЕНИЕ: Кэшируем разрешенный уровень ---
        sessionStorage.setItem("userAccessLevel", userLevel);
        window.userSession.level = userLevel; // Обновляем глобальный объект
        console.log(`Доступ разрешен. Уровень пользователя: ${userLevel}`);

        accessScreen.style.display = "none"; // Убираем экран блокировки
        runApp(); // Запускаем основную логику приложения
      } else {
        // ДОСТУП ЗАПРЕЩЕН
        // --- НОВОЕ ИЗМЕНЕНИЕ: Кэшируем отказ ---
        sessionStorage.setItem("userAccessLevel", "denied");
        window.userSession.level = "denied"; // Обновляем глобальный объект
        accessLoader.style.display = "none";
        accessDenied.style.display = "block";
      }
    } catch (error) {
      console.error("Ошибка проверки доступа:", error);
      // --- НОВОЕ ИЗМЕНЕНИЕ: Кэшируем отказ при ошибке ---
      sessionStorage.setItem("userAccessLevel", "denied");
      window.userSession.level = "denied"; // Обновляем глобальный объект
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
