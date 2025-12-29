// --- START OF FILE js/trainer.js ---

document.addEventListener("DOMContentLoaded", () => {
  // --- Инициализация голосового движка и обработчика высоты тона ---
  const voiceEngine = new VoiceEngine();
  const pitchProcessor = createPitchProcessor(voiceEngine);

  // --- DOM-элементы ---
  const startButton = document.getElementById("trainerStartButton"),
    stopButton = document.getElementById("trainerStopButton"),
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
    trainerTitleElement = document.getElementById("trainer-title"),
    resultsModal = document.getElementById("results-modal"),
    resultsContent = document.getElementById("results-content"),
    restartButton = document.getElementById("restart-button"),
    backToMenuButton = document.getElementById("back-to-menu-button"),
    loadingIndicator = document.getElementById("loading-indicator");

  // --- Константы (для UI) ---
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
  const sharpToFlat = {
    "C#": "Db",
    "D#": "Eb",
    "F#": "Gb",
    "G#": "Ab",
    "A#": "Bb",
  };
  const A4 = 440,
    C0 = A4 * Math.pow(2, -4.75);
  const MIN_NOTE_NUM = 12,
    MAX_NOTE_NUM = 84;
  const WHITE_KEY_PIXELS = 50,
    PITCH_HISTORY_SIZE = 400;

  // --- Переменные состояния ---
  let pitchHistory = [];
  let scrollOffsetPixels = 0,
    targetScrollOffset = 0,
    maxScrollOffset = 0;

  // --- Переменные движка ---
  let exerciseId = null,
    octaveShift = 0,
    holdDuration = 1.0,
    difficulty = "normal";
  let centTolerance = 35;
  let currentExercise = null,
    originalExercise = null,
    currentNoteIndex = -1,
    state = "IDLE",
    noteStartTime = 0,
    allNoteScores = [],
    noteResetTimeout = null,
    selectedStartNote = null;
  let audioLoaded = false;

  function mainLoop() {
    // 1. Скролл
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

    // 2. Обработка звука через VoiceEngine
    let currentPitchFreq = null;

    if (voiceEngine.isListening) {
      const rawPitchResults = voiceEngine.getPitch();
      const stableNoteDetails = pitchProcessor.process(rawPitchResults);

      updatePitchDisplay(stableNoteDetails);

      if (stableNoteDetails) {
        currentPitchFreq = stableNoteDetails.frequency;
      }

      const isNoteCorrect =
        stableNoteDetails &&
        currentExercise &&
        currentExercise.notes[currentNoteIndex] &&
        stableNoteDetails.noteNum ===
          voiceEngine.noteToNoteNum(
            currentExercise.notes[currentNoteIndex].noteName
          ) &&
        Math.abs(stableNoteDetails.cents) <= centTolerance;

      if (state === "LISTENING") {
        if (isNoteCorrect) {
          if (noteResetTimeout) {
            clearTimeout(noteResetTimeout);
            noteResetTimeout = null;
          }
          if (noteStartTime === 0) noteStartTime = Date.now();

          if ((Date.now() - noteStartTime) / 1000 >= holdDuration) {
            allNoteScores.push({
              note: currentExercise.notes[currentNoteIndex].noteName,
              cents: stableNoteDetails.cents,
            });
            goToNextNote();
          }
        } else {
          if (noteStartTime !== 0 && !noteResetTimeout) {
            noteResetTimeout = setTimeout(() => {
              noteStartTime = 0;
              noteResetTimeout = null;
            }, 200);
          }
        }
      }
    }

    pitchHistory.push(currentPitchFreq);
    if (pitchHistory.length > PITCH_HISTORY_SIZE) pitchHistory.shift();

    drawPitchGraph();
    requestAnimationFrame(mainLoop);
  }

  function resetExercise() {
    state = "IDLE";
    currentNoteIndex = -1;
    allNoteScores = [];
    if (noteResetTimeout) clearTimeout(noteResetTimeout);
    noteResetTimeout = null;
    noteStartTime = 0;
    selectedStartNote = null;

    pitchProcessor.reset(); // Сброс состояния обработчика

    if (originalExercise) {
      currentExercise = JSON.parse(JSON.stringify(originalExercise));
      if (currentExercise.type === "dynamic") {
        currentExercise.notes = [];
      }
    }
    updateUI();
    document
      .querySelectorAll(".key.target")
      .forEach((k) => k.classList.remove("target"));
    instructionsElement.textContent =
      "Кликните по ноте на пианино, с которой хотите начать упражнение";
    progressElement.textContent = "";
    startButton.textContent = "Начать упражнение";
    startButton.disabled = true;
    stopButton.classList.add("hidden");
  }

  function startExercise() {
    if (state !== "IDLE") return;
    if (!selectedStartNote) {
      instructionsElement.textContent =
        "Пожалуйста, сначала выберите ноту на пианино";
      return;
    }

    voiceEngine.initAudioContext();
    if (!voiceEngine.isListening) {
      voiceEngine.startListening().catch((err) => console.error(err));
    }

    allNoteScores = [];
    currentNoteIndex = 0;
    state = "LISTENING";
    updateUI();
    playReferenceNote();
    startButton.textContent = "Упражнение идет...";
    startButton.disabled = true;
    stopButton.classList.remove("hidden");
  }

  function goToNextNote() {
    state = "FEEDBACK";
    instructionsElement.textContent = "Отлично!";
    noteStartTime = 0;
    setTimeout(() => {
      currentNoteIndex++;
      if (currentNoteIndex >= currentExercise.notes.length) {
        finishExercise();
      } else {
        state = "LISTENING";
        updateUI();
        playReferenceNote();
      }
    }, 1000);
  }

  function finishExercise() {
    state = "FINISHED";
    voiceEngine.stopListening();
    updateUI();
    const results = calculateResults();

    localStorage.setItem("trainer_first_use", new Date().toISOString());
    if (results.accuracy >= 80)
      localStorage.setItem("trainer_accuracy_80", new Date().toISOString());
    if (results.accuracy >= 95)
      localStorage.setItem("trainer_accuracy_95", new Date().toISOString());
    if (results.accuracy >= 100)
      localStorage.setItem("trainer_accuracy_100", new Date().toISOString());
    if (difficulty === "hard")
      localStorage.setItem(
        "trainer_hard_mode_completed",
        new Date().toISOString()
      );
    try {
      let completedSet = new Set(
        JSON.parse(localStorage.getItem("trainerCompletedExercises")) || []
      );
      completedSet.add(exerciseId);
      localStorage.setItem(
        "trainerCompletedExercises",
        JSON.stringify(Array.from(completedSet))
      );
    } catch (e) {
      console.error("Ошибка сохранения прогресса тренажера:", e);
    }
    if (window.AchievementsEngine) AchievementsEngine.checkAndUnlock();

    showResults(results);
    startButton.textContent = "Начать заново";
    startButton.disabled = false;
    stopButton.classList.add("hidden");
  }

  function calculateResults() {
    if (allNoteScores.length === 0)
      return {
        completion: 0,
        avgCents: 0,
        accuracy: 0,
        worstNote: { note: "--", deviation: 0 },
      };
    let totalCents = 0,
      worstNote = { note: "--", deviation: -1 };
    allNoteScores.forEach((score) => {
      const deviation = Math.abs(score.cents);
      totalCents += deviation;
      if (deviation > worstNote.deviation)
        worstNote = { note: score.note, deviation: deviation };
    });
    const avgCents = totalCents / allNoteScores.length;
    const completion =
      (allNoteScores.length / currentExercise.notes.length) * 100;
    const accuracy = Math.max(0, (1 - avgCents / centTolerance) * 100);
    return { completion, avgCents, accuracy, worstNote };
  }

  function showResults(results) {
    resultsContent.innerHTML = `<div class="stat-item"><span class="stat-label">Точность интонирования</span><span class="stat-value">${results.accuracy.toFixed(
      0
    )}%</span></div><div class="stat-item"><span class="stat-label">Среднее отклонение</span><span class="stat-value">±${results.avgCents.toFixed(
      1
    )} cents</span></div><div class="stat-item"><span class="stat-label">Завершено нот</span><span class="stat-value">${results.completion.toFixed(
      0
    )}%</span></div><div class="stat-item"><span class="stat-label">Самая сложная нота</span><span class="stat-value">${
      results.worstNote.note
    } (±${results.worstNote.deviation.toFixed(0)} cents)</span></div>`;
    resultsModal.classList.remove("hidden");
  }

  function updateUI() {
    highlightTargetKey(null);
    if (state === "IDLE") {
      if (currentExercise) {
        instructionsElement.textContent = currentExercise.description;
        if (currentExercise.notes && currentExercise.notes.length > 0) {
          progressElement.textContent = `Ноты: ${currentExercise.notes.length}`;
        } else {
          progressElement.textContent = "";
        }
      }
    } else if (state === "LISTENING" || state === "FEEDBACK") {
      const targetNote = currentExercise.notes[currentNoteIndex];
      instructionsElement.textContent = `Пойте: ${targetNote.noteName}`;
      progressElement.textContent = `Нота ${currentNoteIndex + 1} / ${
        currentExercise.notes.length
      }`;
      highlightTargetKey(targetNote.noteName);
      scrollToNote(voiceEngine.noteToNoteNum(targetNote.noteName), false);
    } else if (state === "FINISHED") {
      instructionsElement.textContent = "Результаты";
      progressElement.textContent = `Упражнение завершено`;
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
      centsElement.textContent = "Отклонение: --- cents";
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
    if (state === "IDLE" && selectedStartNote) {
      const keyElementId = "key-" + selectedStartNote.replace("#", "s");
      const keyElement = document.getElementById(keyElementId);
      if (keyElement) {
        const keyTop = keyElement.offsetTop;
        const keyHeight = keyElement.offsetHeight;
        canvasCtx.fillStyle = "rgba(0, 123, 255, 0.3)";
        canvasCtx.fillRect(0, keyTop, width, keyHeight);
      }
    }
    if (
      (state === "LISTENING" || state === "FEEDBACK") &&
      currentExercise &&
      currentNoteIndex >= 0
    ) {
      const targetNoteName = currentExercise.notes[currentNoteIndex].noteName;
      const keyElementId = "key-" + targetNoteName.replace("#", "s");
      const keyElement = document.getElementById(keyElementId);
      if (keyElement) {
        const keyTop = keyElement.offsetTop;
        const keyHeight = keyElement.offsetHeight;
        canvasCtx.fillStyle = "rgba(40, 167, 69, 0.25)";
        canvasCtx.fillRect(0, keyTop, width, keyHeight);
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

  function applyOctaveShift(exercise, shift) {
    if (shift === 0) return JSON.parse(JSON.stringify(exercise));
    const newEx = JSON.parse(JSON.stringify(exercise));
    newEx.notes = newEx.notes.map((n) => {
      const num = voiceEngine.noteToNoteNum(n.noteName);
      if (num === null) return n;
      const newNum = num + shift;
      n.noteName = voiceEngine.noteNumToNote(newNum);
      return n;
    });
    return newEx;
  }

  function isStartNoteValid(startNoteNum, exercise) {
    if (!exercise) return true;

    if (exercise.type === "dynamic" && exercise.generator) {
      switch (exercise.generator.method) {
        case "chromatic":
          return startNoteNum + exercise.generator.steps <= MAX_NOTE_NUM;

        case "intervals":
          if (
            !exercise.generator.steps ||
            exercise.generator.steps.length === 0
          )
            return true;
          const minStep = Math.min(...exercise.generator.steps);
          const maxStep = Math.max(...exercise.generator.steps);
          return (
            startNoteNum + minStep >= MIN_NOTE_NUM &&
            startNoteNum + maxStep <= MAX_NOTE_NUM
          );

        default:
          return true;
      }
    }

    if (exercise.type === "static" || !exercise.type) {
      if (!exercise.notes || exercise.notes.length === 0) return true;
      const firstNoteNum = voiceEngine.noteToNoteNum(
        exercise.notes[0].noteName
      );
      if (firstNoteNum === null) return false;
      const semitoneShift = startNoteNum - firstNoteNum;
      for (const note of exercise.notes) {
        const noteNum = voiceEngine.noteToNoteNum(note.noteName);
        if (noteNum === null) return false;
        const shiftedNoteNum = noteNum + semitoneShift;
        if (shiftedNoteNum < MIN_NOTE_NUM || shiftedNoteNum > MAX_NOTE_NUM)
          return false;
      }
    }

    return true;
  }

  function updateDisabledKeys(exercise) {
    document
      .querySelectorAll(".key.disabled")
      .forEach((k) => k.classList.remove("disabled"));
    for (let i = MIN_NOTE_NUM; i <= MAX_NOTE_NUM; i++) {
      if (!isStartNoteValid(i, exercise)) {
        const noteName = noteStrings[i % 12];
        const octave = Math.floor(i / 12);
        const keyId = `key-${(noteName + octave).replace("#", "s")}`;
        const keyElement = document.getElementById(keyId);
        if (keyElement) keyElement.classList.add("disabled");
      }
    }
  }

  function onKeyClickForStartNote(event) {
    if (state !== "IDLE") return;
    const key = event.currentTarget;
    if (key.classList.contains("disabled")) return;

    if (!audioLoaded) {
      startAudioLoadingProcess().then(() => {
        pianoSoundService.playSound(key.dataset.note);
      });
    } else {
      pianoSoundService.playSound(key.dataset.note);
    }

    const noteName = key.dataset.note;
    if (!noteName || !originalExercise) return;
    const startNoteNum = voiceEngine.noteToNoteNum(noteName);
    if (startNoteNum === null) return;

    selectedStartNote = noteName;
    currentExercise = JSON.parse(JSON.stringify(originalExercise));

    if (currentExercise.type === "dynamic" && currentExercise.generator) {
      const generatedNotes = [];
      switch (currentExercise.generator.method) {
        case "chromatic":
          for (let i = 0; i <= currentExercise.generator.steps; i++) {
            const noteNum = startNoteNum + i;
            if (noteNum > MAX_NOTE_NUM) break;
            generatedNotes.push({
              noteName: voiceEngine.noteNumToNote(noteNum),
            });
          }
          break;

        case "intervals":
          currentExercise.generator.steps.forEach((step) => {
            const noteNum = startNoteNum + step;
            if (noteNum >= MIN_NOTE_NUM && noteNum <= MAX_NOTE_NUM) {
              generatedNotes.push({
                noteName: voiceEngine.noteNumToNote(noteNum),
              });
            }
          });
          break;
      }
      currentExercise.notes = generatedNotes;
    } else {
      const firstNoteNum = voiceEngine.noteToNoteNum(
        originalExercise.notes[0].noteName
      );
      const semitoneShift = startNoteNum - firstNoteNum;
      currentExercise = applyOctaveShift(originalExercise, semitoneShift);
    }

    instructionsElement.textContent = `Стартовая нота: ${noteName}. Нажмите "Начать упражнение"`;
    progressElement.textContent = `Выбрана нота: ${noteName}`;
    document
      .querySelectorAll(".key.target")
      .forEach((k) => k.classList.remove("target"));
    key.classList.add("target");

    voiceEngine.initAudioContext();
    startButton.disabled = false;
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

  function setupUI() {
    const totalWhiteKeys = Array.from(
      { length: MAX_NOTE_NUM - MIN_NOTE_NUM + 1 },
      (_, i) => i + MIN_NOTE_NUM
    ).filter((n) => !noteStrings[n % 12].includes("#")).length;
    const totalHeight = totalWhiteKeys * WHITE_KEY_PIXELS;
    pianoContainer.style.height = `${totalHeight}px`;
    canvas.height = totalHeight;
    const pianoViewport = document.querySelector(".piano-viewport");
    if (pianoViewport) {
      const canvasViewport = document.querySelector(".canvas-viewport");
      if (canvasViewport) canvas.width = canvasViewport.clientWidth;
    }
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
        label.innerHTML = `${noteName}<br>${sharpToFlat[noteName]}`;
        key.appendChild(label);
      }
      key.addEventListener("click", onKeyClickForStartNote);
      pianoContainer.appendChild(key);
    }
    if (originalExercise) updateDisabledKeys(originalExercise);
    scrollToNote(48, true);
  }

  function scrollToNote(num, immediate = false) {
    if (num === null || isManuallyScrolling) return;
    const int = Math.floor(num);
    const whiteKeysAbove = Array.from(
      { length: MAX_NOTE_NUM - int },
      (_, i) => i + int + 1
    ).filter((n) => !noteStrings[n % 12].includes("#")).length;
    const name = noteStrings[int % 12];
    const semitoneHeight =
      name === "E" || name === "B" ? WHITE_KEY_PIXELS : WHITE_KEY_PIXELS / 2;
    const yPos =
      whiteKeysAbove * WHITE_KEY_PIXELS +
      semitoneHeight -
      (num - int) * semitoneHeight;
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

  function playReferenceNote() {
    const noteName = currentExercise.notes[currentNoteIndex].noteName;
    if (noteName) pianoSoundService.playSound(noteName);
  }

  startButton.addEventListener("click", () => {
    if (!audioLoaded) {
      startAudioLoadingProcess().then(startExercise);
    } else {
      startExercise();
    }
  });
  stopButton.addEventListener("click", () => {
    if (voiceEngine.isListening) voiceEngine.stopListening();
    resetExercise();
  });
  restartButton.addEventListener("click", () => {
    resultsModal.classList.add("hidden");
    resetExercise();
    startExercise();
  });
  backToMenuButton.addEventListener("click", () => {
    window.location.href = "trainer_menu.html";
  });

  let isManuallyScrolling = false;
  let lastTouchY = 0;
  let manualScrollTimeout = null;
  function startManualScroll() {
    isManuallyScrolling = true;
    clearTimeout(manualScrollTimeout);
  }
  function endManualScroll() {
    manualScrollTimeout = setTimeout(() => {
      isManuallyScrolling = false;
    }, 2000);
  }
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
      console.log("Звуки для тренажера загружены.");
    } catch (err) {
      console.error("Критическая ошибка при загрузке звуков.", err);
      loadingIndicator.textContent = "Ошибка загрузки звуков";
      throw err;
    }
  }

  async function init() {
    if (loadingIndicator) loadingIndicator.style.display = "none";
    startButton.disabled = true;

    const urlParams = new URLSearchParams(window.location.search);
    exerciseId = urlParams.get("exercise");
    octaveShift = parseInt(urlParams.get("shift") || "0");
    difficulty = urlParams.get("difficulty") || "normal";

    if (!exerciseId) {
      instructionsElement.textContent = "Ошибка: не указано упражнение.";
      return;
    }

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
      default:
        centTolerance = 30;
    }

    try {
      const response = await fetch(
        `/mari-vocal-school/data/trainers/${exerciseId}.json`
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      originalExercise = await response.json();

      holdDuration =
        originalExercise.holdDuration ||
        parseFloat(urlParams.get("hold") || "1.0");

      if (originalExercise.type === "static") {
        currentExercise = applyOctaveShift(originalExercise, octaveShift);
      } else {
        currentExercise = JSON.parse(JSON.stringify(originalExercise));
      }

      trainerTitleElement.textContent = currentExercise.title;
      instructionsElement.textContent =
        "Кликните по ноте на пианино, с которой хотите начать упражнение";
      progressElement.textContent = "";

      setTimeout(() => {
        setupUI();
        resetExercise();
        mainLoop();
      }, 50);
    } catch (error) {
      console.error("Ошибка при загрузке данных упражнения:", error);
      loadingIndicator.style.display = "flex";
      loadingIndicator.textContent = "Ошибка загрузки упражнения!";
      mainContent.innerHTML = `<div class="error-container"><h2>Ошибка загрузки</h2><p>Не удалось загрузить данные. Пожалуйста, попробуйте вернуться в меню.</p><a href="trainer_menu.html" class="button-link">Вернуться в меню</a></div>`;
      return;
    }
  }

  init();
});
// --- END OF FILE js/trainer.js ---
