// Файл: js/warmup_player.js

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. ПОЛУЧЕНИЕ DOM-ЭЛЕМЕНТОВ ---
  const categoryTitle = document.getElementById("category-title");
  const exerciseList = document.getElementById("exercise-list");
  const audioPlayer = document.getElementById("audio-player");

  // Элементы управления плеером
  const playPauseBtn = document.getElementById("play-pause-btn");
  const progressBarContainer = document.getElementById(
    "progress-bar-container"
  );
  const progressBarFilled = document.getElementById("progress-bar-filled");
  const currentTimeEl = document.getElementById("current-time");
  const totalDurationEl = document.getElementById("total-duration");
  const currentTrackTitleEl = document.getElementById("current-track-title");

  let currentExercises = []; // Будем хранить здесь загруженный список упражнений
  let currentPlayingIndex = -1; // Индекс текущего трека в списке

  // --- 2. ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ ---

  /**
   * Главная функция инициализации
   */
  async function init() {
    // Получаем ID категории из URL-параметра (?category=...)
    const urlParams = new URLSearchParams(window.location.search);
    const categoryId = urlParams.get("category");

    if (!categoryId) {
      categoryTitle.textContent = "Ошибка";
      exerciseList.innerHTML =
        '<p class="error-message">Категория не выбрана.</p>';
      return;
    }

    await loadExercises(categoryId);
    setupEventListeners();
  }

  /**
   * Загружает данные упражнений для указанной категории
   * @param {string} categoryId - ID категории
   */
  async function loadExercises(categoryId) {
    try {
      const path = `/mari-vocal-school/data/warmups/${categoryId}.json`;
      const data = window.dataService
        ? await window.dataService.getWarmupCategory(categoryId) // Предполагаем, что такой метод может появиться
        : await fetch(path).then((res) => res.json());

      currentExercises = data.exercises;
      categoryTitle.textContent = data.title;
      renderExercises(currentExercises);
    } catch (error) {
      console.error(
        `Ошибка загрузки упражнений для категории ${categoryId}:`,
        error
      );
      categoryTitle.textContent = "Ошибка";
      exerciseList.innerHTML =
        '<p class="error-message">Не удалось загрузить упражнения.</p>';
    }
  }

  /**
   * Отрисовывает список упражнений
   * @param {Array<Object>} exercises - Массив упражнений
   */
  function renderExercises(exercises) {
    exerciseList.innerHTML = ""; // Очищаем список
    exercises.forEach((exercise, index) => {
      const li = document.createElement("li");
      li.className = "exercise-list-item";
      li.textContent = exercise.title;
      li.dataset.index = index; // Сохраняем индекс для быстрого доступа
      exerciseList.appendChild(li);
    });
  }

  // --- 3. ЛОГИКА ПЛЕЕРА ---

  /**
   * Настройка всех обработчиков событий
   */
  function setupEventListeners() {
    // Клик по списку упражнений (делегирование событий)
    exerciseList.addEventListener("click", (event) => {
      if (event.target && event.target.matches(".exercise-list-item")) {
        const index = parseInt(event.target.dataset.index, 10);
        playExercise(index);
      }
    });

    // Клик по кнопке Play/Pause
    playPauseBtn.addEventListener("click", togglePlayPause);

    // Обновление шкалы прогресса во время проигрывания
    audioPlayer.addEventListener("timeupdate", updateProgressBar);

    // Получение длительности трека, когда он загружен
    audioPlayer.addEventListener("loadedmetadata", () => {
      totalDurationEl.textContent = formatTime(audioPlayer.duration);
    });

    // Когда трек закончился
    audioPlayer.addEventListener("ended", () => {
      playPauseBtn.className = "play-btn"; // Возвращаем иконку Play
    });

    // Перемотка по клику на шкалу прогресса
    progressBarContainer.addEventListener("click", seek);
  }

  /**
   * Начинает воспроизведение выбранного упражнения
   * @param {number} index - Индекс упражнения в массиве `currentExercises`
   */
  function playExercise(index) {
    if (index < 0 || index >= currentExercises.length) return;

    currentPlayingIndex = index;
    const exercise = currentExercises[index];

    audioPlayer.src = exercise.file;
    audioPlayer.play();

    currentTrackTitleEl.textContent = exercise.title;
    playPauseBtn.className = "pause-btn"; // Меняем иконку на Pause

    // Обновляем подсветку активного трека
    document
      .querySelectorAll(".exercise-list-item")
      .forEach((item, itemIndex) => {
        item.classList.toggle("active", itemIndex === index);
      });
  }

  /**
   * Переключает воспроизведение/паузу
   */
  function togglePlayPause() {
    if (currentPlayingIndex === -1) return; // Ничего не выбрано

    if (audioPlayer.paused) {
      audioPlayer.play();
      playPauseBtn.className = "pause-btn";
    } else {
      audioPlayer.pause();
      playPauseBtn.className = "play-btn";
    }
  }

  /**
   * Обновляет шкалу прогресса и таймер
   */
  function updateProgressBar() {
    if (audioPlayer.duration) {
      const progressPercent =
        (audioPlayer.currentTime / audioPlayer.duration) * 100;
      progressBarFilled.style.width = `${progressPercent}%`;
      currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    }
  }

  /**
   * Перематывает трек в позицию клика
   * @param {MouseEvent} event
   */
  function seek(event) {
    if (isNaN(audioPlayer.duration)) return; // Нельзя перемотать, если длительность неизвестна

    const width = progressBarContainer.clientWidth;
    const clickX = event.offsetX;
    const duration = audioPlayer.duration;

    audioPlayer.currentTime = (clickX / width) * duration;
  }

  // --- 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

  /**
   * Форматирует время из секунд в строку MM:SS
   * @param {number} seconds
   * @returns {string}
   */
  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  // --- ЗАПУСК ---
  init();
});
