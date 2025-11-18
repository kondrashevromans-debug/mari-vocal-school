// --- START OF FILE daily_practice.js ---

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("daily-practice-container");
  const adviceEl = document.getElementById("main-advice");
  const completeButton = document.getElementById("complete-daily-button");

  const storageKey = "lastCompletedDaily";
  const streakKey = "dailyStreak";
  const perfectWeekKey = "perfectWeekCounter";

  const today = new Date();
  const todayDate = Utils.formatDate(today);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = Utils.formatDate(yesterday);

  const lastCompletedDate = StorageService.get(storageKey);
  let allCheckboxes = [];

  function checkAllCheckboxes() {
    const allChecked = allCheckboxes.every((checkbox) => checkbox.checked);
    if (allChecked) {
      completeButton.disabled = false;
      completeButton.textContent = "Я выполнил(а) комплекс!";
    } else {
      completeButton.disabled = true;
      completeButton.textContent = "Отметьте все упражнения";
    }
  }

  function setButtonCompleted(message = "Отлично, до завтра!") {
    completeButton.classList.add("completed");
    completeButton.textContent = message;
    completeButton.disabled = true;
  }

  completeButton.disabled = true;
  completeButton.textContent = "Отметьте все упражнения";

  if (lastCompletedDate === todayDate) {
    setButtonCompleted();
  }

  completeButton.addEventListener("click", () => {
    // --- ОБНОВЛЕННЫЙ БЛОК: Логика стриков и идеальной недели ---
    const lastCompleted = StorageService.get(storageKey);
    let currentStreak = parseInt(StorageService.get(streakKey)) || 0;
    let perfectWeekCounter = parseInt(StorageService.get(perfectWeekKey)) || 0;

    if (lastCompleted !== todayDate) {
      // Убедимся, что не нажимаем кнопку второй раз за день
      if (lastCompleted === yesterdayDate) {
        currentStreak++;
        perfectWeekCounter++;
      } else {
        // Стрик прерван
        currentStreak = 1;
        perfectWeekCounter = 1;
      }

      // Проверка на воскресенье для сброса счетчика идеальной недели
      // getDay() возвращает 0 для воскресенья
      if (today.getDay() === 0) {
        perfectWeekCounter = 0; // Сбрасываем в конце недели
      }

      StorageService.set(streakKey, currentStreak);
      StorageService.set(perfectWeekKey, perfectWeekCounter);
      StorageService.set(storageKey, todayDate);

      // Проверка ачивки "Идеальная неделя"
      if (perfectWeekCounter >= 7) {
        localStorage.setItem("perfect_week_daily", new Date().toISOString());
      }

      // Проверка секретных ачивок
      const hour = today.getHours();
      if (hour >= 23 || hour < 1) {
        localStorage.setItem("secret_night_owl", new Date().toISOString());
      }
      if (hour >= 4 && hour < 7) {
        // Уточненное время для "ранней пташки"
        localStorage.setItem("secret_early_bird", new Date().toISOString());
      }
      if (Utils.isPublicHoliday(today)) {
        localStorage.setItem(
          "secret_holiday_practice",
          new Date().toISOString()
        );
      }

      // Проверяем все остальные ачивки
      AchievementsEngine.checkAndUnlock();
    }

    setButtonCompleted("Поздравляем! Ваш прогресс сохранен.");
    // --- КОНЕЦ ОБНОВЛЕННОГО БЛОКА ---
  });

  try {
    const response = await fetch("/mari-vocal-school/data/daily_practice.json");
    if (!response.ok) throw new Error("Не удалось загрузить данные");
    const data = await response.json();

    container.innerHTML = `
            <h2>${data.title}</h2>
            <p>${data.description}</p>
        `;

    data.stages.forEach((stage) => {
      const stageEl = document.createElement("div");
      stageEl.className = "daily-stage";

      let exercisesHtml = stage.exercises
        .map((ex, index) => {
          const uniqueId = `ex-${stage.title.replace(/\s+/g, "-")}-${index}`;
          return `
                    <div class="daily-exercise">
                        <input type="checkbox" id="${uniqueId}" class="daily-checkbox" />
                        <label for="${uniqueId}">
                            <strong>${ex.title}</strong>
                            <p class="what-to-do">Что делать: ${ex.what_to_do}</p>
                            <p class="why">Зачем: ${ex.why}</p>
                        </label>
                    </div>
                `;
        })
        .join("");

      stageEl.innerHTML = `
                <h3>${stage.title}</h3>
                ${exercisesHtml}
            `;
      container.appendChild(stageEl);
    });

    adviceEl.textContent = data.main_advice;

    allCheckboxes = Array.from(document.querySelectorAll(".daily-checkbox"));

    allCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", checkAllCheckboxes);
    });

    if (lastCompletedDate === todayDate) {
      allCheckboxes.forEach((checkbox) => {
        checkbox.checked = true;
        checkbox.disabled = true;
      });
    }
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="error-container"><h2>Ошибка</h2><p>Не удалось загрузить ежедневную практику.</p></div>`;
  }
});
