window.Utils = (() => {
  const publicHolidays = new Set([
    "01-01",
    "01-02",
    "01-03",
    "01-04",
    "01-05",
    "01-06",
    "01-07",
    "01-08",
    "02-23",
    "03-08",
    "05-01",
    "05-09",
    "06-12",
    "11-04",
    "12-31",
    "01-25",
    "02-14",
    "04-01",
    "09-01",
    "10-05",
    "10-31",
  ]);

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const isPublicHoliday = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return publicHolidays.has(`${month}-${day}`);
  };

  return {
    formatDate,
    isPublicHoliday,
  };
})();

// --- НОВЫЙ ГЛОБАЛЬНЫЙ МОДУЛЬ ДЛЯ ОТСЛЕЖИВАНИЯ ВРЕМЕНИ ---
window.TimeTracker = (() => {
  let timeInterval = null;
  const INTERVAL_MS = 5000; // Обновляем каждые 5 секунд

  const updateTime = () => {
    const currentMs = parseInt(StorageService.get("totalTimeSpent")) || 0;
    StorageService.set("totalTimeSpent", currentMs + INTERVAL_MS);
    // console.log(`Time tracked. Total: ${currentMs + INTERVAL_MS} ms`); // Раскомментируй для отладки
  };

  const start = () => {
    if (timeInterval) return; // Уже запущен
    timeInterval = setInterval(updateTime, INTERVAL_MS);
  };

  const stop = () => {
    clearInterval(timeInterval);
    timeInterval = null;
  };

  const init = () => {
    // Запускаем трекер, если вкладка видима
    if (document.visibilityState === "visible") {
      start();
    }

    // Ставим на паузу, когда пользователь уходит с вкладки, и возобновляем, когда возвращается
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        start();
      }
    });
  };

  return {
    init,
  };
})();
