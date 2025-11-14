document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("daily-practice-container");
  const adviceEl = document.getElementById("main-advice");
  const completeButton = document.getElementById("complete-daily-button");

  const storageKey = "lastCompletedDaily";

  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const lastCompletedDate = localStorage.getItem(storageKey);
  const todayDate = getTodayDate();

  // --- Логика кнопки и чекбоксов (НОВЫЙ БЛОК) ---
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

  function setButtonCompleted() {
    completeButton.classList.add("completed");
    completeButton.textContent = "Отлично, до завтра!";
    completeButton.disabled = true;
  }

  // Изначально кнопка неактивна
  completeButton.disabled = true;
  completeButton.textContent = "Отметьте все упражнения";

  if (lastCompletedDate === todayDate) {
    setButtonCompleted();
  }

  completeButton.addEventListener("click", () => {
    localStorage.setItem(storageKey, todayDate);
    setButtonCompleted();
    alert("Поздравляем с выполнением ежедневной практики!");
  });

  // --- Загрузка и отображение контента ---
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

    // --- Логика чекбоксов (НОВЫЙ БЛОК) ---
    // После того, как все чекбоксы добавлены на страницу, находим их
    allCheckboxes = Array.from(document.querySelectorAll(".daily-checkbox"));

    // Добавляем слушатель на каждый чекбокс
    allCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", checkAllCheckboxes);
    });

    // Если комплекс уже выполнен сегодня, то делаем все чекбоксы отмеченными и неактивными
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
