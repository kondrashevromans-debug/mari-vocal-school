document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("tracks-list-container");

  // Элементы общего прогресс-бара
  const totalProgressContainer = document.getElementById(
    "total-progress-container"
  );
  const totalProgressLabel = document.getElementById("total-progress-label");
  const totalProgressBarFill = document.getElementById(
    "total-progress-bar-fill"
  );

  async function main() {
    try {
      const response = await fetch("/mari-vocal-school/data/tracks_data.json");
      if (!response.ok) throw new Error("Не удалось загрузить список треков");
      const data = await response.json();

      displayTrackList(data);
      calculateAndShowTotalProgress(data);
    } catch (error) {
      console.error("Ошибка:", error);
      container.innerHTML = `<div class="error-container"><h2>Ошибка загрузки</h2><p>Не удалось загрузить треки развития.</p></div>`;
    }
  }

  function displayTrackList(data) {
    container.innerHTML = "";
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

    // 1. Собираем пути ко всем уникальным модулям
    for (const partKey in data) {
      for (const trackId in data[partKey].tracks) {
        data[partKey].tracks[trackId].modules.forEach((module) => {
          modulePaths.add(module.path);
        });
      }
    }

    // 2. Параллельно загружаем все модули и считаем упражнения
    const exerciseCountPromises = Array.from(modulePaths).map(
      (path) =>
        fetch(path)
          .then((res) => res.json())
          .then((exercises) => exercises.length)
          .catch(() => 0) // Если модуль не загрузился, считаем, что в нем 0 упражнений
    );

    const counts = await Promise.all(exerciseCountPromises);
    totalExercises = counts.reduce((sum, count) => sum + count, 0);

    // 3. Считаем все выполненные упражнения из localStorage
    let totalCompleted = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith("completed_")) {
        const completedInTrack = JSON.parse(localStorage.getItem(key));
        totalCompleted += completedInTrack.length;
      }
    }

    // 4. Отображаем результат
    if (totalExercises > 0) {
      totalProgressContainer.style.display = "block";
      totalProgressLabel.textContent = `${totalCompleted}/${totalExercises}`;
      const percentage = (totalCompleted / totalExercises) * 100;
      totalProgressBarFill.style.width = `${percentage}%`;
    }
  }

  main();
});
