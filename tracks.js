document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("tracks-list-container");

  const totalProgressContainer = document.getElementById(
    "total-progress-container"
  );
  const totalProgressLabel = document.getElementById("total-progress-label");
  const totalProgressBarFill = document.getElementById(
    "total-progress-bar-fill"
  );

  // Функция для получения сегодняшней даты в формате YYYY-MM-DD
  const getTodayDate = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;
  };

  async function main() {
    try {
      const response = await fetch("/mari-vocal-school/data/tracks_data.json");
      if (!response.ok) throw new Error("Не удалось загрузить список треков");
      const data = await response.json();

      // Сначала отображаем карточку ежедневной практики, затем все остальное
      displayDailyPracticeCard();
      displayTrackList(data);
      calculateAndShowTotalProgress(data);
    } catch (error) {
      console.error("Ошибка:", error);
      container.innerHTML = `<div class="error-container"><h2>Ошибка загрузки</h2><p>Не удалось загрузить треки развития.</p></div>`;
    }
  }

  function displayDailyPracticeCard() {
    const lastCompletedDate = localStorage.getItem("lastCompletedDaily");
    const isCompletedToday = lastCompletedDate === getTodayDate();

    const statusText = isCompletedToday
      ? "Выполнено сегодня 🎉"
      : "Чек-лист на сегодня";
    const statusIcon = isCompletedToday ? "✅" : "🗓️";

    // Создаем заголовок для секции
    const partHeader = document.createElement("div");
    partHeader.className = "track-part-header";
    partHeader.innerHTML = `<h2>Ежедневная практика</h2>`;
    container.appendChild(partHeader);

    const dailyCard = document.createElement("a");
    dailyCard.className = "track-card daily-practice-card"; // Добавляем спец. класс для стилизации
    if (isCompletedToday) {
      dailyCard.classList.add("completed");
    }
    dailyCard.href = `daily_practice.html`;

    dailyCard.innerHTML = `
      <div class="track-card-text">
        <h3>${statusText}</h3>
        <p>Быстрый 10-минутный комплекс для поддержания голоса в тонусе.</p>
      </div>
      <span class="arrow-icon">${statusIcon}</span>
    `;

    container.appendChild(dailyCard);
  }

  function displayTrackList(data) {
    for (const partKey in data) {
      const part = data[partKey];

      const partHeader = document.createElement("div");
      partHeader.className = "track-part-header";
      partHeader.innerHTML = `
          <h2>${part.title}</h2>
          <p>${part.description}</p>
      `;
      container.appendChild(partHeader);

      for (const trackId in part.tracks) {
        const track = part.tracks[trackId];
        const trackCard = document.createElement("a");
        trackCard.className = "track-card";
        trackCard.href = `track_detail.html?part=${partKey}&track=${trackId}`;

        trackCard.innerHTML = `
          <div class="track-card-text">
            <h3>${track.title}</h3>
            <p>${track.description}</p>
          </div>
          <span class="arrow-icon">→</span>
        `;
        container.appendChild(trackCard);
      }
    }
  }

  async function calculateAndShowTotalProgress(data) {
    let totalExercises = 0;
    const modulePaths = new Set();

    for (const partKey in data) {
      for (const trackId in data[partKey].tracks) {
        data[partKey].tracks[trackId].modules.forEach((module) => {
          modulePaths.add(module.path);
        });
      }
    }

    const exerciseCountPromises = Array.from(modulePaths).map((path) =>
      fetch(path)
        .then((res) => res.json())
        .then((exercises) => exercises.length)
        .catch(() => 0)
    );

    const counts = await Promise.all(exerciseCountPromises);
    totalExercises = counts.reduce((sum, count) => sum + count, 0);

    let totalCompleted = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith("completed_")) {
        const completedInTrack = JSON.parse(localStorage.getItem(key));
        totalCompleted += completedInTrack.length;
      }
    }

    if (totalExercises > 0) {
      totalProgressContainer.style.display = "block";
      totalProgressLabel.textContent = `${totalCompleted}/${totalExercises}`;
      const percentage = (totalCompleted / totalExercises) * 100;
      totalProgressBarFill.style.width = `${percentage}%`;
    }
  }

  main();
});
