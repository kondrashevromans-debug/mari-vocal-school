document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("exercises-container");
  const indexPath = "data/exercises/exercises_index.json";

  if (!container) {
    console.error("Container element not found!");
    return;
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    const categoryId = params.get("category");

    if (categoryId) {
      renderCategoryPage(categoryId);
    } else {
      renderMainMenu();
    }
  }

  async function renderMainMenu() {
    try {
      const response = await fetch(indexPath);
      const categoriesIndex = await response.json();

      container.innerHTML = `
                <header class="main-header header-with-back-button">
                    <a href="main_vocal.html" class="back-button">← Назад</a>
                    <h1>Разделы упражнений</h1>
                </header>
                <div class="menu"></div>
            `;

      const menuContainer = container.querySelector(".menu");

      categoriesIndex.forEach((category) => {
        const link = document.createElement("a");
        link.href = `exercises.html?category=${category.id}`;

        link.className = "menu-button";
        link.innerHTML = `
                    <span class="button-icon">${category.icon}</span>
                    <span class="button-text">${category.title}</span>
                `;
        menuContainer.appendChild(link);
      });
    } catch (error) {
      console.error("Failed to render main menu:", error);
      container.innerHTML =
        '<p class="error-message">Не удалось загрузить разделы.</p>';
    }
  }

  async function renderCategoryPage(categoryId) {
    try {
      const indexResponse = await fetch(indexPath);
      const categoriesIndex = await indexResponse.json();
      const categoryInfo = categoriesIndex.find((cat) => cat.id === categoryId);

      if (!categoryInfo) {
        throw new Error(`Category with id "${categoryId}" not found in index.`);
      }

      const categoryResponse = await fetch(categoryInfo.path);
      const categoryData = await categoryResponse.json();

      const mainCategoryTitle = Object.keys(categoryData)[0];
      const subCategories = categoryData[mainCategoryTitle];

      container.innerHTML = "";

      const mainHeader = document.createElement("header");
      mainHeader.className = "main-header header-with-back-button";
      mainHeader.innerHTML = `
                <a href="exercises.html" class="back-button">← К разделам</a>
                <h1>${mainCategoryTitle}</h1>
            `;
      container.appendChild(mainHeader);

      subCategories.forEach((group) => {
        const subHeader = document.createElement("h3");
        subHeader.className = "sub-category-title";
        subHeader.textContent = group.category;
        container.appendChild(subHeader);

        const exercisesList = document.createElement("div");
        exercisesList.className = "exercises-list";
        group.exercises.forEach((ex) =>
          exercisesList.appendChild(createExerciseElement(ex))
        );
        container.appendChild(exercisesList);
      });
    } catch (error) {
      console.error("Failed to render category page:", error);
      container.innerHTML =
        '<p class="error-message">Не удалось загрузить упражнения. <a href="exercises.html">Вернуться к списку разделов</a></p>';
    }
  }

  function createExerciseElement(exercise) {
    const item = document.createElement("div");
    item.className = "exercise-item";
    // --- КРИТИЧЕСКАЯ ОШИБКА ИСПРАВЛЕНА ---
    // Добавлен класс "indicator" для спана с плюсом. Без него аккордеон не работал.
    item.innerHTML = `
            <div class="exercise-header">
                <span>${exercise.title}</span><span class="indicator">+</span>
            </div>
            <div class="exercise-content">
                ${
                  exercise.description.goal
                    ? `
                    <div class="exercise-section">
                        <h4>Цель:</h4>
                        <p>${exercise.description.goal}</p>
                    </div>`
                    : ""
                }
                ${
                  exercise.description.technique
                    ? `
                    <div class="exercise-section">
                        <h4>Техника выполнения:</h4>
                        <ol>${exercise.description.technique
                          .map((step) => `<li>${step}</li>`)
                          .join("")}</ol>
                    </div>`
                    : ""
                }
                ${
                  exercise.description.sensation
                    ? `
                    <div class="exercise-section">
                        <h4>Что вы почувствуете:</h4>
                        <p>${exercise.description.sensation}</p>
                    </div>`
                    : ""
                }
            </div>
        `;
    return item;
  }

  container.addEventListener("click", (event) => {
    const header = event.target.closest(".exercise-header");
    if (!header) return;

    const item = header.parentElement;
    const content = item.querySelector(".exercise-content");
    const indicator = header.querySelector(".indicator");

    if (item.classList.contains("active")) {
      content.style.maxHeight = null;
      item.classList.remove("active");
      indicator.textContent = "+";
    } else {
      const activeItem = container.querySelector(".exercise-item.active");
      if (activeItem) {
        activeItem.classList.remove("active");
        activeItem.querySelector(".exercise-content").style.maxHeight = null;
        activeItem.querySelector(".indicator").textContent = "+";
      }
      item.classList.add("active");
      content.style.maxHeight = content.scrollHeight + "px";
      indicator.textContent = "−";
    }
  });

  init();
});
