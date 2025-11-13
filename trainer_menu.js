document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("trainer-menu-container");
  if (!container) return;

  // --- НАСТРОЙКИ ---
  const difficultySettings = [
    { label: "легко", value: "easy" },
    { label: "норма", value: "normal" },
    { label: "сложно", value: "hard" },
  ];
  const durationSettings = [
    { label: "0.7 сек", value: 0.7 },
    { label: "1.0 сек", value: 1.0 },
    { label: "1.5 сек", value: 1.5 },
  ];
  const octaveTargets = [
    { label: "C2", targetNum: 24 },
    { label: "C3", targetNum: 36 },
    { label: "C4", targetNum: 48 },
  ];

  // Вспомогательная функция для получения номера ноты
  function noteToNoteNum(note) {
    const noteNameOnly = note.replace(/[0-9]/g, "");
    const octave = parseInt(note.slice(-1));
    const noteIndex = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ].indexOf(noteNameOnly);
    if (noteIndex === -1) return null;
    return 12 * octave + noteIndex;
  }

  // --- ОСНОВНАЯ ЛОГИКА ---
  // Асинхронная функция для загрузки и построения меню
  async function buildTrainerMenu() {
    try {
      const response = await fetch("data/trainers/trainers_index.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const trainersList = await response.json();

      // Очищаем контейнер на случай повторного вызова
      container.innerHTML = "";

      // Создаем карточки для каждого тренажера из списка
      trainersList.forEach((trainer) => {
        createTrainerCard(trainer);
      });
    } catch (error) {
      console.error("Could not load trainer menu:", error);
      container.innerHTML =
        '<p class="error-message">Не удалось загрузить список упражнений. Пожалуйста, попробуйте обновить страницу.</p>';
    }
  }

  // Функция создания одной карточки
  function createTrainerCard(trainer) {
    // Начальные индексы для настроек
    let difficultyIndex = 1; // "норма"
    let durationIndex = 1; // "1.0 сек"
    let octaveIndex = 1; // "C3"

    // Рассчитываем возможные сдвиги по высоте
    const baseNoteNum = noteToNoteNum(trainer.baseNote);
    const octaveSettings = octaveTargets.map((target) => ({
      label: target.label,
      value: target.targetNum - baseNoteNum, // сдвиг в полутонах
    }));

    const card = document.createElement("div");
    card.className = "trainer-card";

    const title = document.createElement("h3");
    title.className = "trainer-card-title";
    title.textContent = trainer.title;

    const startLink = document.createElement("a");
    startLink.className = "start-trainer-button";
    startLink.textContent = "Начать";

    // Функция для обновления URL в кнопке "Начать"
    function updateLink() {
      const difficultyValue = difficultySettings[difficultyIndex].value;
      const shiftValue = octaveSettings[octaveIndex].value;
      const holdValue = durationSettings[durationIndex].value;
      // Используем ID из объекта trainer для формирования ссылки
      startLink.href = `trainer.html?exercise=${trainer.id}&difficulty=${difficultyValue}&shift=${shiftValue}&hold=${holdValue}`;
    }

    // Создаем элементы управления
    const difficultyControl = createControl(
      "Точность",
      difficultySettings,
      difficultyIndex,
      (newIndex) => {
        difficultyIndex = newIndex;
        updateLink();
      }
    );
    const octaveControl = createControl(
      "Высота",
      octaveSettings,
      octaveIndex,
      (newIndex) => {
        octaveIndex = newIndex;
        updateLink();
      }
    );
    const durationControl = createControl(
      "Длительность",
      durationSettings,
      durationIndex,
      (newIndex) => {
        durationIndex = newIndex;
        updateLink();
      }
    );

    card.appendChild(title);
    card.appendChild(difficultyControl);
    card.appendChild(octaveControl);
    card.appendChild(durationControl);
    card.appendChild(startLink);

    container.appendChild(card);
    updateLink(); // Первичная установка ссылки
  }

  // Универсальная функция для создания переключателей << спан >>
  function createControl(labelText, settings, initialIndex, callback) {
    let currentIndex = initialIndex;
    const controlWrapper = document.createElement("div");
    controlWrapper.className = "trainer-card-controls";
    const label = document.createElement("span");
    label.className = "control-group-label";
    label.textContent = labelText;
    const selector = document.createElement("div");
    selector.className = "control-selector";
    const downBtn = document.createElement("button");
    downBtn.textContent = "◄";
    const display = document.createElement("span");
    display.className = "control-display";
    const upBtn = document.createElement("button");
    upBtn.textContent = "►";

    function updateDisplay() {
      display.textContent = settings[currentIndex].label;
      // Блокируем кнопки, если достигнут край
      downBtn.disabled = currentIndex === 0;
      upBtn.disabled = currentIndex === settings.length - 1;
      callback(currentIndex);
    }

    downBtn.addEventListener("click", () => {
      if (currentIndex > 0) {
        currentIndex--;
        updateDisplay();
      }
    });
    upBtn.addEventListener("click", () => {
      if (currentIndex < settings.length - 1) {
        currentIndex++;
        updateDisplay();
      }
    });

    selector.appendChild(downBtn);
    selector.appendChild(display);
    selector.appendChild(upBtn);
    controlWrapper.appendChild(label);
    controlWrapper.appendChild(selector);

    updateDisplay(); // Первичная отрисовка значения
    return controlWrapper;
  }

  // Запускаем процесс построения меню
  buildTrainerMenu();
});
