document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("favorites-container");
  const userAccessLevel = localStorage.getItem("userAccessLevel") || "basic";
  const favoriteExercises = new Set(
    JSON.parse(localStorage.getItem("favoriteExercises")) || []
  );

  if (favoriteExercises.size === 0) {
    showEmptyMessage();
    return;
  }

  try {
    // 1. Получаем все упражнения из всех модулей
    const allExercisesMap = await fetchAllExercises();

    // 2. Отображаем только те, что в избранном
    buildFavoritesAccordion(allExercisesMap);
  } catch (error) {
    console.error("Ошибка при загрузке избранных упражнений:", error);
    showError(
      "Ошибка загрузки",
      "Не удалось загрузить упражнения. Пожалуйста, попробуйте позже."
    );
  }

  async function fetchAllExercises() {
    const response = await fetch("/mari-vocal-school/data/tracks_data.json");
    if (!response.ok) throw new Error("Не удалось загрузить структуру треков");
    const tracksData = await response.json();

    const modulePaths = new Set();
    for (const partKey in tracksData) {
      for (const trackId in tracksData[partKey].tracks) {
        tracksData[partKey].tracks[trackId].modules.forEach((module) => {
          modulePaths.add({ path: module.path, trackId: trackId });
        });
      }
    }

    const modulePromises = Array.from(modulePaths).map(async (moduleInfo) => {
      try {
        const res = await fetch(moduleInfo.path);
        if (!res.ok) return [];
        const exercises = await res.json();
        // Добавляем к каждому упражнению сгенерированный ID для консистентности
        return exercises.map((ex, index) => {
          if (!ex.id) {
            ex.id = `${moduleInfo.trackId}_${
              moduleInfo.path.split("/").pop().split(".")[0]
            }_${index}`;
          }
          return ex;
        });
      } catch {
        return [];
      }
    });

    const allModulesExercises = await Promise.all(modulePromises);
    const flatExercises = allModulesExercises.flat();

    // Создаем Map для быстрого доступа: { exerciseId -> exerciseObject }
    const exercisesMap = new Map();
    flatExercises.forEach((ex) => exercisesMap.set(ex.id, ex));
    return exercisesMap;
  }

  function buildFavoritesAccordion(allExercisesMap) {
    container.innerHTML = "";
    let displayedCount = 0;

    favoriteExercises.forEach((exerciseId) => {
      const exercise = allExercisesMap.get(exerciseId);
      if (exercise) {
        const item = createAccordionItem(exercise, exerciseId);
        container.appendChild(item);
        displayedCount++;
      }
    });

    if (displayedCount === 0) {
      showEmptyMessage();
    }
  }

  function createAccordionItem(exercise, exerciseId) {
    const item = document.createElement("div");
    item.className = "exercise-item-nested";

    const header = document.createElement("div");
    header.className = "exercise-header-nested";
    header.innerHTML = `
      <span class="exercise-title-nested">${exercise.title}</span>
      <div class="exercise-controls-nested">
        <span class="favorite-toggle active" data-exercise-id="${exerciseId}"></span>
        <span class="indicator-nested">+</span>
      </div>
    `;

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "exercise-content-nested";

    const level =
      exercise.tag && exercise.tag.includes("[VIP]") ? "advanced" : "basic";

    if (level === "advanced" && userAccessLevel !== "vip") {
      contentWrapper.innerHTML = `<div class="vip-lock-message"><span class="lock-icon">🔒</span><div><h4>Доступно на VIP-тарифе</h4><p>Это продвинутое упражнение для достижения максимальных результатов.</p></div></div>`;
      item.classList.add("locked");
    } else {
      let htmlContent = `<h4>Цель:</h4><p>${exercise.description.goal}</p>`;
      if (
        exercise.description.technique &&
        exercise.description.technique.length > 0
      ) {
        htmlContent += `<h4>Техника выполнения:</h4><ol>${exercise.description.technique
          .map((li) => `<li>${li}</li>`)
          .join("")}</ol>`;
      }
      if (exercise.description.sensation) {
        htmlContent += `<h4>Что вы почувствуете:</h4><p>${exercise.description.sensation}</p>`;
      }
      contentWrapper.innerHTML = htmlContent;
    }

    item.appendChild(header);
    item.appendChild(contentWrapper);

    const favoriteToggle = header.querySelector(".favorite-toggle");
    favoriteToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      // При клике на звезду на этой странице, упражнение удаляется из избранного и из DOM
      favoriteExercises.delete(exerciseId);
      localStorage.setItem(
        "favoriteExercises",
        JSON.stringify([...favoriteExercises])
      );
      item.remove(); // Удаляем элемент со страницы
      if (favoriteExercises.size === 0) {
        showEmptyMessage();
      }
    });

    header.addEventListener("click", () => item.classList.toggle("active"));

    return item;
  }

  function showEmptyMessage() {
    container.innerHTML = `<div class="empty-favorites-message"><p>Вы еще не добавили упражнения в избранное. <br>Нажмите на звездочку ☆ рядом с названием упражнения, чтобы добавить его сюда.</p></div>`;
  }

  function showError(title, message) {
    container.innerHTML = `<div class="error-container"><h2>${title}</h2><p>${message}</p></div>`;
  }
});
