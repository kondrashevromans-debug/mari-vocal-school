document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("exercises-container");
  const trackTitleEl = document.getElementById("track-title");

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
  const favoriteExercises = new Set(
    JSON.parse(localStorage.getItem("favoriteExercises")) || []
  );

  const sessionExerciseCount = {};
  let totalExercises = 0;

  if (!partKey || !trackId) {
    showError(
      "Трек не найден",
      "Пожалуйста, вернитесь к списку и выберите трек."
    );
    return;
  }

  try {
    const allData = await window.DataService.getData();
    const trackData = allData[partKey]?.tracks[trackId];
    if (!trackData) throw new Error("Данные для этого трека не найдены");

    trackTitleEl.textContent = trackData.title;
    buildAccordionFromModules(trackData.modules);

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

  function buildAccordionFromModules(modules) {
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

      const exercises = module.exercises || [];
      if (exercises.length === 0) {
        const noExercisesItem = document.createElement("p");
        noExercisesItem.textContent = `Упражнения для модуля "${module.title}" скоро появятся.`;
        container.appendChild(noExercisesItem);
        continue;
      }

      exercises.forEach((exercise) => {
        if (!exercise.id) {
          console.warn("Exercise is missing an ID:", exercise.title);
          return;
        }
        totalExercises++;
        const item = createAccordionItem(exercise, exercise.id);
        container.appendChild(item);
      });
    }
  }

  function createAccordionItem(exercise, exerciseId) {
    const item = document.createElement("div");
    item.className = "exercise-item-nested";
    if (completedExercises.has(exerciseId)) {
      item.classList.add("completed");
    }

    const header = document.createElement("div");
    header.className = "exercise-header-nested";

    const isFavorite = favoriteExercises.has(exerciseId);
    header.innerHTML = `
      <span class="exercise-title-nested">${exercise.title}</span>
      <div class="exercise-controls-nested">
        <span class="favorite-toggle ${
          isFavorite ? "active" : ""
        }" data-exercise-id="${exerciseId}"></span>
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

      const noteKey = `note_${exerciseId}`;
      const savedNote = localStorage.getItem(noteKey) || "";
      let noteBlock = "";
      if (savedNote) {
        noteBlock += `<div class="exercise-note-block"><div class="exercise-note-label">Ваша заметка:</div><div class="exercise-note-text">${savedNote
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(
            /\n/g,
            "<br>"
          )}</div><button class="edit-note-button" data-exercise-id="${exerciseId}"><span class="note-icon">📝</span> Редактировать заметку</button></div>`;
      } else {
        noteBlock += `<div class="exercise-note-block"><button class="add-note-button" data-exercise-id="${exerciseId}"><span class="note-icon">📝</span> Добавить заметку</button></div>`;
      }
      htmlContent += noteBlock;

      htmlContent += `<div class="complete-button-container">
                        <button class="complete-button" data-exercise-id="${exerciseId}">Отметить как выполненное</button>
                      </div>`;
      contentWrapper.innerHTML = htmlContent;
    }

    item.appendChild(header);
    item.appendChild(contentWrapper);

    const favoriteToggle = header.querySelector(".favorite-toggle");
    favoriteToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavoriteState(favoriteToggle, exerciseId);
    });

    header.addEventListener("click", () => item.classList.toggle("active"));

    const noteKey = `note_${exerciseId}`;
    const addNoteBtn = contentWrapper.querySelector(".add-note-button");
    const editNoteBtn = contentWrapper.querySelector(".edit-note-button");

    function showNoteEditor(initialText = "") {
      const noteBlock = contentWrapper.querySelector(".exercise-note-block");
      if (noteBlock) noteBlock.innerHTML = "";
      const textarea = document.createElement("textarea");
      textarea.className = "exercise-note-textarea";
      textarea.value = initialText;
      textarea.rows = 4;
      textarea.placeholder = "Введите ваши мысли, ощущения, комментарии...";
      const saveBtn = document.createElement("button");
      saveBtn.className = "save-note-button";
      saveBtn.innerHTML = '<span class="note-icon">💾</span> Сохранить';
      noteBlock.appendChild(textarea);
      noteBlock.appendChild(saveBtn);
      saveBtn.addEventListener("click", () => {
        localStorage.setItem(noteKey, textarea.value);
        renderNoteBlock();
      });
    }

    function renderNoteBlock() {
      const noteBlock = contentWrapper.querySelector(".exercise-note-block");
      if (!noteBlock) return;
      const savedNote = localStorage.getItem(noteKey) || "";
      if (savedNote) {
        noteBlock.innerHTML = `<div class="exercise-note-label">Ваша заметка:</div><div class="exercise-note-text">${savedNote
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(
            /\n/g,
            "<br>"
          )}</div><button class="edit-note-button" data-exercise-id="${exerciseId}"><span class="note-icon">📝</span> Редактировать заметку</button>`;
        const editBtn = noteBlock.querySelector(".edit-note-button");
        editBtn.addEventListener("click", () => showNoteEditor(savedNote));
      } else {
        noteBlock.innerHTML = `<button class="add-note-button" data-exercise-id="${exerciseId}"><span class="note-icon">📝</span> Добавить заметку</button>`;
        const addBtn = noteBlock.querySelector(".add-note-button");
        addBtn.addEventListener("click", () => showNoteEditor(""));
      }
    }

    if (addNoteBtn) {
      addNoteBtn.addEventListener("click", () => showNoteEditor(""));
    }
    if (editNoteBtn) {
      editNoteBtn.addEventListener("click", () => {
        const savedNote = localStorage.getItem(noteKey) || "";
        showNoteEditor(savedNote);
      });
    }

    renderNoteBlock();

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

  function toggleFavoriteState(starElement, exerciseId) {
    if (favoriteExercises.has(exerciseId)) {
      favoriteExercises.delete(exerciseId);
      starElement.classList.remove("active");
    } else {
      favoriteExercises.add(exerciseId);
      starElement.classList.add("active");
    }
    localStorage.setItem(
      "favoriteExercises",
      JSON.stringify([...favoriteExercises])
    );
  }

  function trackSession() {
    const today = new Date().toISOString().split("T")[0];
    const lastSessionDate = localStorage.getItem("lastSessionDate");
    if (lastSessionDate !== today) {
      const totalSessions =
        (parseInt(localStorage.getItem("totalSessions")) || 0) + 1;
      localStorage.setItem("totalSessions", totalSessions);
      localStorage.setItem("lastSessionDate", today);
      console.log(`New session tracked for ${today}. Total: ${totalSessions}`);
    }
  }

  function toggleCompleteState(button, exerciseId) {
    const exerciseItem = button.closest(".exercise-item-nested");
    if (!exerciseItem) return;

    if (completedExercises.has(exerciseId)) {
      completedExercises.delete(exerciseId);
      markAsNotCompleted(button);
      exerciseItem.classList.remove("completed");
    } else {
      completedExercises.add(exerciseId);
      markAsCompleted(button);
      exerciseItem.classList.add("completed");

      trackSession();

      // Отслеживание для ачивки "Перфекционист"
      sessionExerciseCount[exerciseId] =
        (sessionExerciseCount[exerciseId] || 0) + 1;
      if (sessionExerciseCount[exerciseId] >= 3) {
        localStorage.setItem("secret_perfectionist", new Date().toISOString());
      }

      window.AchievementsEngine.checkAndUnlock();
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
    const completedCount = completedExercises.size;
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
