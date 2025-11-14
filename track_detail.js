document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("exercises-container");
  const trackTitleEl = document.getElementById("track-title");

  // Элементы прогресс-бара
  const progressContainer = document.getElementById("progress-container");
  const progressLabel = document.getElementById("progress-label");
  const progressBarFill = document.getElementById("progress-bar-fill");

  const userAccessLevel = localStorage.getItem("userAccessLevel") || "basic";
  const urlParams = new URLSearchParams(window.location.search);
  const partKey = urlParams.get("part");
  const trackId = urlParams.get("track");
  const progressKey = `completed_${partKey}_${trackId}`;
  const completedExercises = new Set(
    JSON.parse(localStorage.getItem(progressKey)) || []
  );

  let totalExercises = 0;

  if (!partKey || !trackId) {
    showError(
      "Трек не найден",
      "Пожалуйста, вернитесь к списку и выберите трек."
    );
    return;
  }

  try {
    const response = await fetch("/mari-vocal-school/data/tracks_data.json");
    if (!response.ok) throw new Error("Не удалось загрузить структуру треков");
    const allData = await response.json();

    const trackData = allData[partKey]?.tracks[trackId];
    if (!trackData) throw new Error("Данные для этого трека не найдены");

    trackTitleEl.textContent = trackData.title;
    await buildAccordionFromModules(trackData.modules);

    if (totalExercises > 0) {
      progressContainer.style.display = "block";
      updateProgress();
    }
  } catch (error) {
    console.error("Ошибка:", error);
    showError(
      "Ошибка загрузки",
      "Не удалось загрузить упражнения. Пожалуйста, попробуйте позже."
    );
  }

  async function buildAccordionFromModules(modules) {
    container.innerHTML = "";
    if (!modules || modules.length === 0) {
      container.innerHTML = "<p>Модули для этого трека скоро появятся.</p>";
      return;
    }

    for (const module of modules) {
      const moduleHeader = document.createElement("h3");
      moduleHeader.className = "module-title";
      moduleHeader.textContent = module.title;
      container.appendChild(moduleHeader);

      try {
        const moduleResponse = await fetch(module.path);
        if (!moduleResponse.ok)
          throw new Error(`Не удалось загрузить модуль: ${module.title}`);
        const exercises = await moduleResponse.json();

        exercises.forEach((exercise, exerciseIndex) => {
          const exerciseId = `${trackId}_${
            module.path.split("/").pop().split(".")[0]
          }_${exerciseIndex}`;
          totalExercises++; // Считаем все упражнения
          const item = createAccordionItem(exercise, exerciseId);
          container.appendChild(item);
        });
      } catch (moduleError) {
        console.error(moduleError);
        const errorItem = document.createElement("p");
        errorItem.textContent = `Не удалось загрузить упражнения для модуля "${module.title}".`;
        container.appendChild(errorItem);
      }
    }
  }

  function createAccordionItem(exercise, exerciseId) {
    const item = document.createElement("div");
    item.className = "exercise-item-nested";

    const header = document.createElement("div");
    header.className = "exercise-header-nested";
    header.innerHTML = `
            <span>${exercise.title}</span>
            <span class="indicator-nested">+</span>
        `;

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "exercise-content-nested";

    const level =
      exercise.tag && exercise.tag.includes("[VIP]") ? "advanced" : "basic";

    if (level === "advanced" && userAccessLevel !== "vip") {
      // VIP-упражнение заблокировано
      contentWrapper.innerHTML = `<div class="vip-lock-message"><span class="lock-icon">🔒</span><div><h4>Доступно на VIP-тарифе</h4><p>Это продвинутое упражнение для достижения максимальных результатов.</p></div></div>`;
      item.classList.add("locked");
    } else {
      // Обычное или доступное VIP-упражнение
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

      htmlContent += `<div class="complete-button-container">
                                <button class="complete-button" data-exercise-id="${exerciseId}">Отметить как выполненное</button>
                            </div>`;

      contentWrapper.innerHTML = htmlContent;
    }

    item.appendChild(header);
    item.appendChild(contentWrapper);

    header.addEventListener("click", () => item.classList.toggle("active"));

    const completeButton = contentWrapper.querySelector(".complete-button");
    if (completeButton) {
      if (completedExercises.has(exerciseId)) {
        markAsCompleted(completeButton);
      }

      completeButton.addEventListener("click", () => {
        toggleCompleteState(completeButton, exerciseId);
      });
    }

    return item;
  }

  function toggleCompleteState(button, exerciseId) {
    if (completedExercises.has(exerciseId)) {
      completedExercises.delete(exerciseId);
      markAsNotCompleted(button);
    } else {
      completedExercises.add(exerciseId);
      markAsCompleted(button);
    }
    localStorage.setItem(progressKey, JSON.stringify([...completedExercises]));
    updateProgress();
  }

  function markAsCompleted(button) {
    button.classList.add("completed");
    button.textContent = "✓ Выполнено";
  }

  function markAsNotCompleted(button) {
    button.classList.remove("completed");
    button.textContent = "Отметить как выполненное";
  }

  function updateProgress() {
    // Здесь мы считаем только те выполненные ID, которые относятся к текущему треку,
    // но `totalExercises` теперь включает все упражнения трека.
    const completedCount = Array.from(completedExercises).filter((id) =>
      id.startsWith(trackId)
    ).length;
    progressLabel.textContent = `${completedCount}/${totalExercises}`;
    const percentage =
      totalExercises > 0 ? (completedCount / totalExercises) * 100 : 0;
    progressBarFill.style.width = `${percentage}%`;
  }

  function showError(title, message) {
    trackTitleEl.textContent = title;
    container.innerHTML = `<div class="error-container"><h2>${title}</h2><p>${message}</p></div>`;
  }
});
