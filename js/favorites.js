document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("favorites-container");
  const userAccessLevel = localStorage.getItem("userAccessLevel") || "basic";
  const favoriteExercises = new Set(
    JSON.parse(localStorage.getItem("favoriteExercises")) || []
  );

  // Переменная для хранения данных о дикции
  let dictionData = null;

  if (favoriteExercises.size === 0) {
    showEmptyMessage();
    return;
  }

  try {
    // Параллельно загружаем все упражнения и данные для дикции
    const [allExercisesMap, loadedDictionData] = await Promise.all([
      fetchAllExercises(),
      fetchDictionData(),
    ]);

    dictionData = loadedDictionData;

    buildFavoritesAccordion(allExercisesMap);
  } catch (error) {
    console.error("Ошибка при загрузке избранных упражнений:", error);
    showError(
      "Ошибка загрузки",
      "Не удалось загрузить упражнения. Пожалуйста, попробуйте позже."
    );
  }

  // Функция для загрузки и кэширования данных о дикции
  async function fetchDictionData() {
    if (window.dictionDataCache) {
      return window.dictionDataCache;
    }
    try {
      const response = await fetch("/mari-vocal-school/data/diction_data.json");
      if (!response.ok) throw new Error("Diction data not found");
      const data = await response.json();
      window.dictionDataCache = data;
      return data;
    } catch (e) {
      console.warn("Не удалось загрузить данные для тренажера дикции.");
      return null;
    }
  }

  // Функция для загрузки всех упражнений
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
        return exercises.map((ex) => {
          if (!ex.id) {
            console.warn(
              "Exercise is missing an ID in module:",
              moduleInfo.path
            );
          }
          return ex;
        });
      } catch {
        return [];
      }
    });

    const allModulesExercises = await Promise.all(modulePromises);
    const flatExercises = allModulesExercises.flat();
    const exercisesMap = new Map();
    flatExercises.forEach((ex) => exercisesMap.set(ex.id, ex));
    return exercisesMap;
  }

  // Функция для построения аккордеона из избранных упражнений
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

  // Функция для создания HTML-элемента одного упражнения
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
      let videoHtml = "";
      if (exercise.videoId) {
        let videoSrc = `https://rutube.ru/play/embed/${exercise.videoId}`;
        if (exercise.accessKey) {
          videoSrc += `/?p=${exercise.accessKey}`;
        }
        videoHtml = `<div class="video-container"><iframe src="${videoSrc}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe></div>`;
      }

      let dictionTrainerHtml = "";
      if (exercise.hasDictionTrainer && dictionData) {
        const syllableLines = Object.values(dictionData);
        if (syllableLines.length > 0) {
          const firstLineText = syllableLines[0].join(", ");
          dictionTrainerHtml = `
                  <div class="diction-trainer" data-syllables='${JSON.stringify(
                    syllableLines
                  )}' data-current-index="0">
                      <div class="diction-trainer-header">Дикционные слогосочетания</div>
                      <div class="diction-trainer-display">${firstLineText}</div>
                      <div class="diction-trainer-controls">
                          <button class="diction-trainer-button prev" disabled>&larr;</button>
                          <span class="diction-trainer-progress">Строка 1 / ${
                            syllableLines.length
                          }</span>
                          <button class="diction-trainer-button next">${
                            syllableLines.length > 1 ? "&rarr;" : "✓"
                          }</button>
                      </div>
                  </div>
              `;
        }
      }

      let htmlContent = `${videoHtml} ${dictionTrainerHtml} <h4>Цель:</h4><p>${exercise.description.goal}</p>`;
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
      favoriteExercises.delete(exerciseId);
      localStorage.setItem(
        "favoriteExercises",
        JSON.stringify([...favoriteExercises])
      );
      item.remove();
      if (favoriteExercises.size === 0) {
        showEmptyMessage();
      }
    });

    header.addEventListener("click", () => item.classList.toggle("active"));

    return item;
  }

  // Обработчик кликов для кнопок тренажера дикции
  container.addEventListener("click", (event) => {
    const target = event.target;
    if (target.classList.contains("diction-trainer-button")) {
      const trainer = target.closest(".diction-trainer");
      if (!trainer) return;

      const syllableLines = JSON.parse(trainer.dataset.syllables);
      let currentIndex = parseInt(trainer.dataset.currentIndex, 10);
      const total = syllableLines.length;

      if (target.classList.contains("next")) {
        currentIndex++;
      } else if (target.classList.contains("prev")) {
        currentIndex--;
      }

      trainer.dataset.currentIndex = currentIndex;

      const display = trainer.querySelector(".diction-trainer-display");
      const progress = trainer.querySelector(".diction-trainer-progress");
      const prevBtn = trainer.querySelector(".prev");
      const nextBtn = trainer.querySelector(".next");

      display.textContent = syllableLines[currentIndex].join(", ");
      progress.textContent = `Строка ${currentIndex + 1} / ${total}`;

      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === total - 1;
      nextBtn.innerHTML = currentIndex === total - 1 ? "✓" : "&rarr;";
    }
  });

  // Вспомогательные функции для отображения сообщений
  function showEmptyMessage() {
    container.innerHTML = `<div class="empty-favorites-message"><p>Вы еще не добавили упражнения в избранное. <br>Нажмите на звездочку ☆ рядом с названием упражнения, чтобы добавить его сюда.</p></div>`;
  }

  function showError(title, message) {
    container.innerHTML = `<div class="error-container"><h2>${title}</h2><p>${message}</p></div>`;
  }
});
