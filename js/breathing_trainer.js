document.addEventListener("DOMContentLoaded", () => {
  const circle = document.getElementById("pacer-circle");
  const timerDisplay = document.getElementById("pacer-timer");
  const prompt = document.getElementById("pacer-prompt");
  const inhaleInput = document.getElementById("inhale-duration");
  const holdInput = document.getElementById("hold-duration");
  const exhaleInput = document.getElementById("exhale-duration");
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");

  let isAnimating = false;
  let animationTimeout;
  let timerInterval;
  let sessionStartTime = null;

  function startTimer(duration) {
    clearInterval(timerInterval);
    let timeLeft = duration;
    timerDisplay.textContent = timeLeft;

    timerInterval = setInterval(() => {
      timeLeft--;
      timerDisplay.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
      }
    }, 1000);
  }

  function runCycle() {
    if (!isAnimating) return;

    const inhaleTime = parseInt(inhaleInput.value);
    const holdTime = parseInt(holdInput.value);
    const exhaleTime = parseInt(exhaleInput.value);

    prompt.textContent = "Вдох";
    startTimer(inhaleTime);
    circle.style.transition = `transform ${inhaleTime}s ease-in-out`;
    circle.style.transform = "scale(1.5)";

    animationTimeout = setTimeout(() => {
      if (!isAnimating) return;

      prompt.textContent = "Задержка";
      if (holdTime > 0) {
        startTimer(holdTime);
      } else {
        timerDisplay.textContent = "";
      }

      animationTimeout = setTimeout(() => {
        if (!isAnimating) return;

        prompt.textContent = "Выдох";
        startTimer(exhaleTime);
        circle.style.transition = `transform ${exhaleTime}s ease-in-out`;
        circle.style.transform = "scale(1)";

        animationTimeout = setTimeout(() => {
          if (isAnimating) {
            runCycle();
          }
        }, exhaleTime * 1000);
      }, holdTime * 1000);
    }, inhaleTime * 1000);
  }

  function startSession() {
    if (isAnimating) return;
    isAnimating = true;
    sessionStartTime = Date.now();

    if (!StorageService.get("breathing_trainer_first_use")) {
      StorageService.set(
        "breathing_trainer_first_use",
        new Date().toISOString()
      );
      AchievementsEngine.checkAndUnlock();
    }

    startBtn.style.display = "none";
    stopBtn.style.display = "block";
    [inhaleInput, holdInput, exhaleInput].forEach(
      (input) => (input.disabled = true)
    );

    runCycle();
  }

  function stopSession() {
    if (!isAnimating) return;
    isAnimating = false;

    clearTimeout(animationTimeout);
    clearInterval(timerInterval);

    // --- ИСПРАВЛЕННАЯ ЛОГИКА ---
    if (sessionStartTime) {
      // Считаем продолжительность в секундах для точности
      const sessionDurationSeconds = Math.floor(
        (Date.now() - sessionStartTime) / 1000
      );

      // Проверяем ачивки (5 минут = 300 секунд, 10 минут = 600 секунд)
      if (sessionDurationSeconds >= 300) {
        StorageService.set("breathing_trainer_5min", new Date().toISOString());
      }
      if (sessionDurationSeconds >= 600) {
        StorageService.set("breathing_trainer_10min", new Date().toISOString());
      }

      // Вызываем движок в любом случае, чтобы он проверил установленные флаги
      AchievementsEngine.checkAndUnlock();
      sessionStartTime = null;
    }
    // --- КОНЕЦ ИСПРАВЛЕННОЙ ЛОГИКИ ---

    prompt.textContent = 'Настройте время и нажмите "Старт"';
    timerDisplay.textContent = "";
    circle.style.transition = "transform 0.5s ease-in-out";
    circle.style.transform = "scale(1)";
    startBtn.style.display = "block";
    stopBtn.style.display = "none";
    [inhaleInput, holdInput, exhaleInput].forEach(
      (input) => (input.disabled = false)
    );
  }

  startBtn.addEventListener("click", startSession);
  stopBtn.addEventListener("click", stopSession);
});
