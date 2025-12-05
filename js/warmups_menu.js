// Файл: js/warmups_menu.js

document.addEventListener("DOMContentLoaded", () => {
  const categoriesContainer = document.getElementById("warmup-categories");

  // Проверяем, что контейнер для категорий существует на странице
  if (!categoriesContainer) {
    console.error("Контейнер для категорий #warmup-categories не найден.");
    return;
  }

  /**
   * Загружает данные о категориях распевок и отображает их.
   */
  async function loadCategories() {
    try {
      // Используем dataService для загрузки данных, если он есть, или fetch как запасной вариант
      const categories = window.dataService
        ? await window.dataService.getWarmupIndex()
        : await fetch("/mari-vocal-school/data/warmups/index.json").then(
            (res) => res.json()
          );

      renderCategories(categories);
    } catch (error) {
      console.error("Ошибка при загрузке категорий распевок:", error);
      categoriesContainer.innerHTML =
        '<p class="error-message">Не удалось загрузить список категорий. Попробуйте обновить страницу.</p>';
    }
  }

  /**
   * Отрисовывает карточки категорий на странице.
   * @param {Array<Object>} categories - Массив объектов категорий.
   */
  function renderCategories(categories) {
    if (!categories || categories.length === 0) {
      categoriesContainer.innerHTML = "<p>Категории распевок не найдены.</p>";
      return;
    }

    // Очищаем контейнер перед добавлением новых элементов
    categoriesContainer.innerHTML = "";

    categories.forEach((category) => {
      const categoryElement = document.createElement("a");
      categoryElement.href = `warmup_player.html?category=${category.id}`;
      categoryElement.className = "category-card"; // Используем класс для стилизации

      categoryElement.innerHTML = `
                <h3 class="category-card__title">${category.title}</h3>
                <p class="category-card__description">${category.description}</p>
            `;

      categoriesContainer.appendChild(categoryElement);
    });
  }

  // Запускаем процесс загрузки при готовности DOM
  loadCategories();
});
