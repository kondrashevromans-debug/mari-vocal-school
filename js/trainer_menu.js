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

  // --- ОСНОВНАЯ ЛОГИКА ---
  async function buildTrainerMenu() {
    try {
      const response = await fetch(
        "/mari-vocal-school/data/trainers/trainers_index.json"
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const trainersList = await response.json();

      container.innerHTML = "";
      trainersList.forEach((trainer) => {
        createTrainerCard(trainer);
      });
    } catch (error) {
      console.error("Could not load trainer menu:", error);
      container.innerHTML =
        '<p class="error-message">Не удалось загрузить список упражнений. Пожалуйста, попробуйте обновить страницу.</p>';
    }
  }

  function createTrainerCard(trainer) {
    let difficultyIndex = 1,
      durationIndex = 1;
    const card = document.createElement("div");
    card.className = "trainer-card";
    const title = document.createElement("h3");
    title.className = "trainer-card-title";
    title.textContent = trainer.title;
    const description = document.createElement("p");
    description.className = "trainer-card-description";
    description.textContent = trainer.description;
    const startLink = document.createElement("a");
    startLink.className = "start-trainer-button";
    startLink.textContent = "Начать";

    function updateLink() {
      const difficultyValue = difficultySettings[difficultyIndex].value;
      const holdValue = durationSettings[durationIndex].value;

      // --- ИЗМЕНЕНИЕ: Логика формирования ссылки ---
      const baseUrl = trainer.url || "trainer.html";
      const params = new URLSearchParams();

      if (trainer.settings.includes("difficulty")) {
        params.set("difficulty", difficultyValue);
      }
      if (trainer.settings.includes("duration") && !trainer.url) {
        params.set("hold", holdValue);
      }
      if (!trainer.url) {
        params.set("exercise", trainer.id);
      }

      startLink.href = `${baseUrl}?${params.toString()}`;
    }

    card.appendChild(title);
    card.appendChild(description);

    // --- ИЗМЕНЕНИЕ: Условное добавление контролов ---
    if (trainer.settings.includes("difficulty")) {
      const difficultyControl = createControl(
        "Точность",
        difficultySettings,
        difficultyIndex,
        (i) => {
          difficultyIndex = i;
          updateLink();
        }
      );
      card.appendChild(difficultyControl);
    }

    if (trainer.settings.includes("duration")) {
      const durationControl = createControl(
        "Длительность",
        durationSettings,
        durationIndex,
        (i) => {
          durationIndex = i;
          updateLink();
        }
      );
      card.appendChild(durationControl);
    }

    card.appendChild(startLink);
    container.appendChild(card);
    updateLink();
  }

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
    updateDisplay();
    return controlWrapper;
  }

  buildTrainerMenu();
});
