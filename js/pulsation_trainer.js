// --- START OF FILE js/pulsation_trainer.js ---

document.addEventListener("DOMContentLoaded", () => {
  // --- Инициализация голосового движка ---
  const voiceEngine = new VoiceEngine();

  // --- DOM-элементы ---
  const startButton = document.getElementById("pulsationStartButton"),
    limitButton = document.getElementById("pulsationLimitButton"),
    noteElement = document.getElementById("note"),
    octaveElement = document.getElementById("octave"),
    centsElement = document.getElementById("cents"),
    pianoContainer = document.getElementById("piano-container"),
    canvas = document.getElementById("pitch-canvas"),
    canvasCtx = canvas.getContext("2d"),
    mainContent = document.getElementById("main-content"),
    tunerIndicator = document.getElementById("tuner-indicator"),
    instructionsElement = document.getElementById("trainer-instructions"),
    progressElement = document.getElementById("trainer-progress"),
    resultsModal = document.getElementById("results-modal"),
    resultsContent = document.getElementById("results-content"),
    restartButton = document.getElementById("restart-button"),
    backToMenuButton = document.getElementById("back-to-menu-button"),
    loadingIndicator = document.getElementById("loading-indicator");

  // --- Константы ---
  const noteStrings = [
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
  ];
  const A4 = 440,
    C0 = A4 * Math.pow(2, -4.75);

  const MIN_NOTE_NUM = 12,
    MAX_NOTE_NUM = 84;
  const WHITE_KEY_PIXELS = 50,
    PITCH_HISTORY_SIZE = 400;
  const REQUIRED_CORRECT_FRAMES = 90;

  // --- Переменные состояния приложения ---
  let pitchHistory = [];
  let scrollOffsetPixels = 0,
    targetScrollOffset = 0,
    maxScrollOffset = 0;
  let isManuallyScrolling = false,
    manualScrollTimeout,
    lastTouchY = 0;
  let audioLoaded = false;

  // --- Переменные для сглаживания (Медианный фильтр) ---
  const SMOOTHING_WINDOW_SIZE = 5;
  let pitchBuffer = [];
  let ignoreFramesCounter = 0;
  let previousSmoothedFreq = null;

  // --- Переменные для пост-обработки и подтверждения ноты ---
  const CONFIRMATION_THRESHOLD = 3;
  let stableNoteDetails = null;
  let potentialNoteNum = null;
  let potentialNoteCount = 0;

  // --- НОВЫЕ ПЕРЕМЕННЫЕ ДЛЯ ЛОГИКИ ВЫБОРА И САМОКОРРЕКЦИИ ---
  let lastStableFreq = null;
  let candidateFreq = null;
  let candidateCount = 0;
  const CANDIDATE_CONFIRMATION_THRESHOLD = 4;

  // --- Переменные состояния упражнения ---
  let state = "SELECT_NOTE";
  let difficulty = "normal",
    centTolerance = 30;
  let startNoteNum = null,
    currentNoteNum = null,
    limitNoteNum = null;
  let direction = "up";
  let attemptsPerNote = {};
  let correctFrames = 0;
  let listeningTimeout = null;

  /**
   * Выбирает лучшую оценку высоты тона из двух алгоритмов (MPM и HPS).
   * @param {{mpm: number|null, hps: number|null}} pitchResults - Результаты от VoiceEngine.
   * @param {number|null} lastFreq - Последняя стабильно определенная частота.
   * @returns {number|null} - Наиболее вероятная частота.
   */
  function selectBestPitch(pitchResults, lastFreq) {
    const { mpm, hps } = pitchResults;

    if (!mpm && !hps) return null;
    if (!mpm) return hps;
    if (!hps) return mpm;

    const ratio = mpm / hps;
    if (ratio > 1.9 && ratio < 2.1) return hps;
    if (ratio > 0.47 && ratio < 0.53) return mpm;

    if (lastFreq) {
      const mpmDiff = Math.abs(mpm - lastFreq);
      const hpsDiff = Math.abs(hps - lastFreq);

      if (mpmDiff < lastFreq * 0.2 && hpsDiff < lastFreq * 0.2) {
        return mpmDiff < hpsDiff ? mpm : hps;
      }

      if (mpmDiff < lastFreq * 0.2) return mpm;
      if (hpsDiff < lastFreq * 0.2) return hps;
    }

    return mpm;
  }

  function mainLoop() {
    // 1. Логика скролла
    let distance = targetScrollOffset - scrollOffsetPixels;
    if (Math.abs(distance) > 0.01) {
      scrollOffsetPixels += distance * 0.1;
      scrollOffsetPixels = Math.max(
        0,
        Math.min(scrollOffsetPixels, maxScrollOffset)
      );
      pianoContainer.style.transform = `translateY(-${scrollOffsetPixels}px)`;
      canvas.style.transform = `translateY(-${scrollOffsetPixels}px)`;
    }

    // 2. Логика обработки звука через VoiceEngine
    let currentPitchFreq = null;
    let pitchInfo = null;

    if (voiceEngine.isListening) {
      // =================== НАЧАЛО: ОБНОВЛЕННЫЙ БЛОК ОБРАБОТКИ ЗВУКА ===================
      const rawPitchResults = voiceEngine.getPitch();
      let rawFreq = null;
      if (rawPitchResults) {
        rawFreq = selectBestPitch(rawPitchResults, lastStableFreq);
      }

      if (rawFreq && lastStableFreq) {
        const diff = Math.abs(rawFreq - lastStableFreq);
        if (diff > lastStableFreq * 0.2) {
          if (
            candidateFreq &&
            Math.abs(rawFreq - candidateFreq) < candidateFreq * 0.1
          ) {
            candidateCount++;
          } else {
            candidateFreq = rawFreq;
            candidateCount = 1;
          }

          if (candidateCount >= CANDIDATE_CONFIRMATION_THRESHOLD) {
            lastStableFreq = candidateFreq;
            candidateFreq = null;
            candidateCount = 0;
          } else {
            rawFreq = null;
          }
        } else {
          candidateFreq = null;
          candidateCount = 0;
        }
      } else if (!rawFreq) {
        candidateFreq = null;
        candidateCount = 0;
      }

      pitchBuffer.push(rawFreq);
      if (pitchBuffer.length > SMOOTHING_WINDOW_SIZE) {
        pitchBuffer.shift();
      }

      const validPitches = pitchBuffer.filter(
        (p) => typeof p === "number" && p > 0
      );
      let smoothedFreq = null;

      if (validPitches.length > SMOOTHING_WINDOW_SIZE / 2) {
        validPitches.sort((a, b) => a - b);
        smoothedFreq = validPitches[Math.floor(validPitches.length / 2)];
      }

      if (previousSmoothedFreq === null && smoothedFreq !== null) {
        ignoreFramesCounter = 5;
      }
      previousSmoothedFreq = smoothedFreq;

      if (ignoreFramesCounter > 0) {
        currentPitchFreq = null;
        pitchInfo = null;
        ignoreFramesCounter--;
      } else {
        currentPitchFreq = smoothedFreq;
        if (currentPitchFreq) {
          pitchInfo = voiceEngine.frequencyToNoteDetails(currentPitchFreq);
        }
      }
      // =================== КОНЕЦ: ОБНОВЛЕННОГО БЛОКА =================================

      if (pitchInfo) {
        const currentNoteNum = pitchInfo.noteNum;
        if (currentNoteNum === potentialNoteNum) {
          potentialNoteCount++;
        } else {
          potentialNoteNum = currentNoteNum;
          potentialNoteCount = 1;
        }

        if (potentialNoteCount >= CONFIRMATION_THRESHOLD) {
          stableNoteDetails = pitchInfo;
          if (!lastStableFreq) {
            // Устанавливаем самую первую стабильную частоту
            lastStableFreq = stableNoteDetails.frequency;
          }
        }
      } else {
        stableNoteDetails = null;
        potentialNoteNum = null;
        potentialNoteCount = 0;
      }

      updatePitchDisplay(stableNoteDetails);

      if (state === "LISTENING") {
        const isNoteCorrect =
          stableNoteDetails &&
          stableNoteDetails.noteNum === currentNoteNum &&
          Math.abs(stableNoteDetails.cents) <= centTolerance;

        if (isNoteCorrect) {
          correctFrames++;
        } else {
          correctFrames = Math.max(0, correctFrames - 2);
        }

        if (correctFrames >= REQUIRED_CORRECT_FRAMES) {
          if (listeningTimeout) clearTimeout(listeningTimeout);
          handleCorrectNote();
        }
      }
    }

    pitchHistory.push(currentPitchFreq);
    if (pitchHistory.length > PITCH_HISTORY_SIZE) pitchHistory.shift();

    drawPitchGraph();
    requestAnimationFrame(mainLoop);
  }

  function setState(newState) {
    state = newState;
    updateUI();
  }

  function handleKeyClick(event) {
    if (state !== "SELECT_NOTE" && state !== "READY") return;
    const key = event.currentTarget;
    const noteName = key.dataset.note;

    if (!audioLoaded) {
      startAudioLoadingProcess().then(() => {
        pianoSoundService.playSound(noteName);
      });
    } else {
      pianoSoundService.playSound(noteName);
    }

    startNoteNum = voiceEngine.noteToNoteNum(noteName);
    currentNoteNum = startNoteNum;

    document
      .querySelectorAll(".key.target")
      .forEach((k) => k.classList.remove("target"));
    key.classList.add("target");

    scrollToNote(startNoteNum, true);
    setState("READY");
  }

  function startExercise() {
    if (state !== "READY") return;

    const run = () => {
      voiceEngine.initAudioContext();
      if (!voiceEngine.isListening) {
        voiceEngine.startListening().catch((err) => console.error(err));
      }
      runExerciseLogic();
    };

    if (!audioLoaded) {
      startAudioLoadingProcess().then(run);
    } else {
      run();
    }
  }

  function runExerciseLogic() {
    attemptsPerNote = {};
    attemptsPerNote[startNoteNum] = 1;
    direction = "up";
    limitNoteNum = null;
    playPattern(currentNoteNum);
  }

  function playPattern(noteNum) {
    setState("PLAYING");
    const noteName = voiceEngine.noteNumToNote(noteNum);
    progressElement.textContent = `Пойте: ${noteName}`;
    highlightTargetKey(noteName);
    scrollToNote(noteNum, false);

    let delay = 0;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => pianoSoundService.playSound(noteName), delay);
      delay += 400;
    }

    setTimeout(() => {
      pianoSoundService.playSound(noteName);
      correctFrames = 0;
      setState("LISTENING");
      if (listeningTimeout) clearTimeout(listeningTimeout);
      listeningTimeout = setTimeout(handleIncorrectNote, 6000);
    }, delay);
  }

  function handleCorrectNote() {
    if (state !== "LISTENING") return;
    setState("FEEDBACK");
    instructionsElement.textContent = "Отлично!";

    setTimeout(() => {
      if (direction === "up") {
        currentNoteNum++;
        if (currentNoteNum > MAX_NOTE_NUM) {
          handleLimitReached();
        } else {
          if (!attemptsPerNote[currentNoteNum])
            attemptsPerNote[currentNoteNum] = 1;
          playPattern(currentNoteNum);
        }
      } else {
        currentNoteNum--;
        if (currentNoteNum < startNoteNum) {
          finishExercise();
        } else {
          if (!attemptsPerNote[currentNoteNum])
            attemptsPerNote[currentNoteNum] = 1;
          playPattern(currentNoteNum);
        }
      }
    }, 1000);
  }

  function handleIncorrectNote() {
    if (state !== "LISTENING") return;
    attemptsPerNote[currentNoteNum]++;
    playPattern(currentNoteNum);
  }

  function handleLimitReached() {
    if (direction !== "up" || state === "FINISHED") return;
    if (listeningTimeout) clearTimeout(listeningTimeout);

    limitNoteNum = currentNoteNum - 1;
    direction = "down";
    currentNoteNum--;

    if (currentNoteNum < startNoteNum) {
      finishExercise();
      return;
    }
    if (!attemptsPerNote[currentNoteNum]) attemptsPerNote[currentNoteNum] = 1;
    playPattern(currentNoteNum);
  }

  function finishExercise() {
    setState("FINISHED");
    voiceEngine.stopListening();
    showResults();
  }

  function showResults() {
    const finalLimitNote =
      limitNoteNum !== null
        ? limitNoteNum
        : direction === "up"
        ? currentNoteNum - 1
        : startNoteNum;

    const range = `${voiceEngine.noteNumToNote(
      startNoteNum
    )} ➔ ${voiceEngine.noteNumToNote(finalLimitNote)}`;
    const totalNotes = Object.keys(attemptsPerNote).length;
    const firstAttemptSuccesses = Object.values(attemptsPerNote).filter(
      (a) => a === 1
    ).length;
    const accuracy =
      totalNotes > 0 ? (firstAttemptSuccesses / totalNotes) * 100 : 0;

    resultsContent.innerHTML = `<div class="stat-item"><span class="stat-label">Рабочий диапазон</span><span class="stat-value">${range}</span></div><div class="stat-item"><span class="stat-label">Точность с 1-й попытки</span><span class="stat-value">${accuracy.toFixed(
      0
    )}%</span></div><div class="stat-item"><span class="stat-label">Пропето нот</span><span class="stat-value">${totalNotes} (${firstAttemptSuccesses} с 1-й попытки)</span></div>`;
    resultsModal.classList.remove("hidden");
  }

  function resetExercise() {
    voiceEngine.stopListening();
    if (listeningTimeout) clearTimeout(listeningTimeout);
    startNoteNum = null;
    currentNoteNum = null;
    limitNoteNum = null;
    attemptsPerNote = {};
    direction = "up";

    // =================== СБРОС КОНТЕКСТА ПРИ ПЕРЕЗАПУСКЕ ===================
    lastStableFreq = null;
    candidateFreq = null;
    candidateCount = 0;
    // ======================================================================

    resultsModal.classList.add("hidden");
    document
      .querySelectorAll(".key.target, .key.target-exercise")
      .forEach((k) => k.classList.remove("target", "target-exercise"));
    setState("SELECT_NOTE");
  }

  function updateUI() {
    startButton.classList.remove("hidden");
    switch (state) {
      case "SELECT_NOTE":
        instructionsElement.textContent = "Выберите стартовую ноту на пианино";
        progressElement.textContent = "";
        startButton.textContent = "Начать";
        startButton.disabled = true;
        limitButton.classList.add("hidden");
        break;
      case "READY":
        instructionsElement.textContent = `Начать с ноты ${voiceEngine.noteNumToNote(
          startNoteNum
        )}?`;
        startButton.disabled = false;
        break;
      case "PLAYING":
        instructionsElement.textContent = "Слушайте...";
        startButton.disabled = true;
        limitButton.classList.add("hidden");
        break;
      case "LISTENING":
        instructionsElement.textContent = "Теперь ваша очередь!";
        startButton.textContent = "Закончить";
        startButton.disabled = false;
        if (direction === "up") limitButton.classList.remove("hidden");
        else limitButton.classList.add("hidden");
        break;
      case "FEEDBACK":
        instructionsElement.textContent = "Отлично!";
        startButton.disabled = true;
        limitButton.classList.add("hidden");
        break;
      case "FINISHED":
        instructionsElement.textContent = "Упражнение завершено!";
        progressElement.textContent = "";
        startButton.classList.add("hidden");
        limitButton.classList.add("hidden");
        break;
    }
  }

  function updatePitchDisplay(pitchInfo) {
    if (pitchInfo) {
      noteElement.textContent = pitchInfo.note;
      octaveElement.textContent = pitchInfo.octave;
      centsElement.textContent = `Отклонение: ${pitchInfo.cents.toFixed(
        0
      )} cents`;
      updateTuner(pitchInfo.cents);
    } else {
      noteElement.textContent = "--";
      octaveElement.textContent = "";
      centsElement.textContent = "---";
      updateTuner(null);
    }
  }

  function highlightTargetKey(noteName) {
    document
      .querySelectorAll(".key.target-exercise")
      .forEach((k) => k.classList.remove("target-exercise"));
    if (noteName) {
      const keyId = `key-${noteName.replace("#", "s")}`;
      const key = document.getElementById(keyId);
      if (key) key.classList.add("target-exercise");
    }
  }

  function updateTuner(cents) {
    if (cents === null) {
      tunerIndicator.style.opacity = "0";
      return;
    }
    tunerIndicator.style.opacity = "1";
    const clampedCents = Math.max(-50, Math.min(50, cents));
    const percentage = 50 + clampedCents;
    tunerIndicator.style.left = `${percentage}%`;
  }

  startButton.addEventListener("click", () => {
    if (state === "READY") startExercise();
    else if (state === "LISTENING") finishExercise();
  });
  limitButton.addEventListener("click", handleLimitReached);
  restartButton.addEventListener("click", resetExercise);
  backToMenuButton.addEventListener("click", () => {
    window.location.href = "trainer_menu.html";
  });

  function setupUI() {
    const totalWhiteKeys = Array.from(
      { length: MAX_NOTE_NUM - MIN_NOTE_NUM + 1 },
      (_, i) => i + MIN_NOTE_NUM
    ).filter((n) => !noteStrings[n % 12].includes("#")).length;
    const totalHeight = totalWhiteKeys * WHITE_KEY_PIXELS;
    pianoContainer.style.height = `${totalHeight}px`;
    canvas.height = totalHeight;
    canvas.width = canvas.parentElement.clientWidth;
    maxScrollOffset = totalHeight - mainContent.clientHeight;
    pianoContainer.innerHTML = "";
    let currentY = 0;
    for (let i = MAX_NOTE_NUM; i >= MIN_NOTE_NUM; i--) {
      const noteName = noteStrings[i % 12],
        oct = Math.floor(i / 12),
        isBlack = noteName.includes("#");
      const key = document.createElement("div");
      key.className = `key ${isBlack ? "black" : "white"}`;
      key.id = `key-${(noteName + oct).replace("#", "s")}`;
      key.dataset.note = `${noteName}${oct}`;
      const label = document.createElement("span");
      label.className = "key-label";
      if (!isBlack) {
        key.style.height = `${WHITE_KEY_PIXELS}px`;
        key.style.top = `${currentY}px`;
        label.textContent = noteName + oct;
        key.appendChild(label);
        currentY += WHITE_KEY_PIXELS;
      } else {
        const blackKeyHeight = WHITE_KEY_PIXELS * 0.6;
        key.style.height = `${blackKeyHeight}px`;
        key.style.top = `${currentY - blackKeyHeight / 2}px`;
        label.textContent = noteName;
        key.appendChild(label);
      }
      key.addEventListener("click", handleKeyClick);
      pianoContainer.appendChild(key);
    }
    scrollToNote(48, true);
  }

  const noteNumToY = (num) => {
    const int = Math.floor(num);
    const whiteKeysAbove = Array.from(
      { length: MAX_NOTE_NUM - int },
      (_, i) => i + int + 1
    ).filter((n) => !noteStrings[n % 12].includes("#")).length;
    const yBoundary = whiteKeysAbove * WHITE_KEY_PIXELS;
    const name = noteStrings[int % 12];
    const semitoneHeight =
      name === "E" || name === "B" ? WHITE_KEY_PIXELS : WHITE_KEY_PIXELS / 2;
    return yBoundary + semitoneHeight - (num - int) * semitoneHeight;
  };

  function drawPitchGraph() {
    const width = canvas.width,
      height = canvas.height;
    canvasCtx.clearRect(0, 0, width, height);
    const totalWhiteKeys = Array.from(
      { length: MAX_NOTE_NUM - MIN_NOTE_NUM + 1 },
      (_, i) => i + MIN_NOTE_NUM
    ).filter((n) => !noteStrings[n % 12].includes("#")).length;
    for (let i = 0; i <= totalWhiteKeys; i++) {
      const y = Math.round(i * WHITE_KEY_PIXELS);
      canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      canvasCtx.lineWidth = 1;
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, y);
      canvasCtx.lineTo(width, y);
      canvasCtx.stroke();
    }
    if (state === "LISTENING" || state === "PLAYING" || state === "FEEDBACK") {
      const keyElement = document.getElementById(
        `key-${voiceEngine.noteNumToNote(currentNoteNum).replace("#", "s")}`
      );
      if (keyElement) {
        canvasCtx.fillStyle = "rgba(40, 167, 69, 0.25)";
        canvasCtx.fillRect(
          0,
          keyElement.offsetTop,
          width,
          keyElement.offsetHeight
        );
      }
    }
    canvasCtx.strokeStyle = "#ffc107";
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    let lastPointWasNull = true;
    for (let i = 0; i < pitchHistory.length; i++) {
      const pitch = pitchHistory[i];
      const x = (i / PITCH_HISTORY_SIZE) * width;

      if (pitch && pitch > 0) {
        const noteNumFloat = 12 * Math.log2(pitch / C0);
        const y = noteNumToY(noteNumFloat);
        if (lastPointWasNull) {
          canvasCtx.moveTo(x, y);
          lastPointWasNull = false;
        } else {
          canvasCtx.lineTo(x, y);
        }
      } else {
        lastPointWasNull = true;
      }
    }
    canvasCtx.stroke();
  }

  function setupScrollListeners() {
    const startManualScroll = () => {
      isManuallyScrolling = true;
      clearTimeout(manualScrollTimeout);
    };
    const endManualScroll = () => {
      manualScrollTimeout = setTimeout(() => {
        isManuallyScrolling = false;
      }, 2000);
    };
    mainContent.addEventListener("wheel", (e) => {
      e.preventDefault();
      startManualScroll();
      targetScrollOffset += e.deltaY;
      targetScrollOffset = Math.max(
        0,
        Math.min(targetScrollOffset, maxScrollOffset)
      );
      endManualScroll();
    });
    mainContent.addEventListener(
      "touchstart",
      (e) => {
        startManualScroll();
        lastTouchY = e.touches[0].clientY;
      },
      { passive: false }
    );
    mainContent.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const deltaY = lastTouchY - e.touches[0].clientY;
        lastTouchY = e.touches[0].clientY;
        targetScrollOffset += deltaY;
        targetScrollOffset = Math.max(
          0,
          Math.min(targetScrollOffset, maxScrollOffset)
        );
      },
      { passive: false }
    );
    mainContent.addEventListener("touchend", endManualScroll);
  }

  function scrollToNote(num, immediate = false) {
    if (num === null || isManuallyScrolling) return;
    const yPos = noteNumToY(num);
    targetScrollOffset = yPos - mainContent.clientHeight / 2;
    targetScrollOffset = Math.max(
      0,
      Math.min(targetScrollOffset, maxScrollOffset)
    );
    if (immediate) {
      scrollOffsetPixels = targetScrollOffset;
      pianoContainer.style.transform = `translateY(-${scrollOffsetPixels}px)`;
      canvas.style.transform = `translateY(-${scrollOffsetPixels}px)`;
    }
  }

  async function startAudioLoadingProcess() {
    voiceEngine.initAudioContext();
    if (!voiceEngine.audioContext) {
      alert("Не удалось запустить аудиосистему.");
      return Promise.reject("AudioContext not supported");
    }

    loadingIndicator.style.display = "flex";
    pianoContainer.style.pointerEvents = "none";

    try {
      await pianoSoundService.initialize();
      audioLoaded = true;
      loadingIndicator.style.display = "none";
      pianoContainer.style.pointerEvents = "auto";
      console.log("Звуки для тренажера-пульсации загружены.");
    } catch (error) {
      console.error("Ошибка при загрузке звуков:", error);
      loadingIndicator.textContent = "Ошибка загрузки!";
      throw error;
    }
  }

  async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    difficulty = urlParams.get("difficulty") || "normal";
    switch (difficulty) {
      case "easy":
        centTolerance = 50;
        break;
      case "normal":
        centTolerance = 30;
        break;
      case "hard":
        centTolerance = 10;
        break;
    }

    setTimeout(() => {
      setupUI();
      setupScrollListeners();
      mainLoop();
      loadingIndicator.style.display = "none";
    }, 50);

    if (sessionStorage.getItem("startTrainerPreload") === "true") {
      sessionStorage.removeItem("startTrainerPreload");
      console.log("Найден флаг предзагрузки. Запускаю загрузку аудио...");
      startAudioLoadingProcess();
    } else {
      console.log("Флаг предзагрузки не найден. Ждем действия пользователя.");
    }
  }

  init();
});
// --- END OF FILE js/pulsation_trainer.js ---
