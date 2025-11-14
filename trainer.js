document.addEventListener("DOMContentLoaded", () => {
  // --- DOM-элементы (без изменений) ---
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
    backToMenuButton = document.getElementById("back-to-menu-button");

  // --- Константы (без изменений) ---
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
    ],
    sharpToFlat = {
      "C#": "Db",
      "D#": "Eb",
      "F#": "Gb",
      "G#": "Ab",
      "A#": "Bb",
    },
    A4 = 440,
    C0 = A4 * Math.pow(2, -4.75),
    MIN_NOTE_NUM = 24, // C2
    MAX_NOTE_NUM = 84, // C7
    WHITE_KEY_PIXELS = 50,
    PITCH_HISTORY_SIZE = 400;

  // --- Переменные состояния приложения (без изменений) ---
  let audioContext,
    analyser,
    sourceNode,
    dataArray,
    dummyGainNode,
    isListening = false,
    pitchHistory = [],
    scrollOffsetPixels = 0,
    targetScrollOffset = 0,
    maxScrollOffset = 0,
    referenceOscillator = null,
    ignoreFramesCounter = 0,
    lastFramePitch = null;

  // --- Переменные движка тренажера ---
  let exerciseId = null,
    octaveShift = 0,
    holdDuration = 1.0;
  let centTolerance = 35;
  let currentExercise = null,
    currentNoteIndex = -1,
    state = "IDLE", // IDLE, LISTENING, FEEDBACK, FINISHED
    noteStartTime = 0,
    allNoteScores = [];

  // --- ИЗМЕНЕНИЕ 1: Новая переменная для "периода прощения" ---
  let noteResetTimeout = null;

  // --- ОСНОВНАЯ ЛОГИКА (init без изменений) ---
  async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    exerciseId = urlParams.get("exercise");
    octaveShift = parseInt(urlParams.get("shift") || "0");
    holdDuration = parseFloat(urlParams.get("hold") || "1.0");
    const difficulty = urlParams.get("difficulty") || "normal";

    if (!exerciseId) {
      startButton.disabled = true;
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
      if (!response.ok) {
        throw new Error(
          `Не удалось загрузить файл упражнения: ${response.statusText}`
        );
      }
      const originalExercise = await response.json();
      currentExercise = applyOctaveShift(originalExercise, octaveShift);
      trainerTitleElement.textContent = currentExercise.title;
      setupUI();
      resetExercise();
      mainLoop();
    } catch (error) {
      console.error("Ошибка при загрузке данных упражнения:", error);
      startButton.disabled = true;
      mainContent.innerHTML = `<div class="error-container">
          <h2>Ошибка загрузки</h2>
          <p>Не удалось загрузить данные для тренажера. Пожалуйста, проверьте консоль для получения дополнительной информации и попробуйте вернуться в меню.</p>
          <a href="trainer_menu.html" class="button-link">Вернуться в меню</a>
        </div>`;
    }
  }

  function mainLoop() {
    // Скролл (без изменений)
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

    if (isListening) {
      // Получение данных с микрофона (без изменений)
      analyser.getFloatTimeDomainData(dataArray);
      let rms = 0;
      for (let i = 0; i < dataArray.length; i++)
        rms += dataArray[i] * dataArray[i];
      rms = Math.sqrt(rms / dataArray.length);
      let currentPitch = null,
        pitchInfo = null;
      if (rms > 0.025) {
        const pitch = yin(dataArray, audioContext.sampleRate);
        if (pitch !== -1) {
          currentPitch = pitch;
          pitchInfo = frequencyToNoteDetails(pitch);
        }
      }

      // Сглаживание (без изменений)
      if (lastFramePitch === null && currentPitch !== null) {
        ignoreFramesCounter = 10;
      }
      let pitchToProcess = currentPitch;
      if (ignoreFramesCounter > 0) {
        pitchToProcess = null;
        pitchInfo = null;
        ignoreFramesCounter--;
      }

      updatePitchDisplay(pitchInfo);

      // --- ИЗМЕНЕНИЕ 2: Обновленная логика таймера ---
      const isNoteCorrect =
        pitchInfo &&
        pitchInfo.noteNum ===
          noteToNoteNum(currentExercise.notes[currentNoteIndex].noteName) &&
        Math.abs(pitchInfo.cents) <= centTolerance;

      if (state === "LISTENING") {
        if (isNoteCorrect) {
          // Если мы в допуске, отменяем любой запланированный сброс таймера
          if (noteResetTimeout) {
            clearTimeout(noteResetTimeout);
            noteResetTimeout = null;
          }
          // И запускаем таймер, если он еще не запущен
          if (noteStartTime === 0) {
            noteStartTime = Date.now();
          }
          // Проверяем, достигнута ли нужная длительность
          if ((Date.now() - noteStartTime) / 1000 >= holdDuration) {
            allNoteScores.push({
              note: currentExercise.notes[currentNoteIndex].noteName,
              cents: pitchInfo.cents,
            });
            goToNextNote();
          }
        } else {
          // Если мы ВЫШЛИ из допуска, но таймер был запущен...
          if (noteStartTime !== 0 && !noteResetTimeout) {
            // ...запускаем отложенный сброс таймера.
            noteResetTimeout = setTimeout(() => {
              noteStartTime = 0;
              noteResetTimeout = null;
            }, 200); // <-- Наш "период прощения" в 200мс
          }
        }
      }

      pitchHistory.push(pitchToProcess);
      if (pitchHistory.length > PITCH_HISTORY_SIZE) pitchHistory.shift();
      lastFramePitch = currentPitch;
    }

    drawPitchGraph();
    requestAnimationFrame(mainLoop);
  }

  // --- Остальной код без изменений ---

  function resetExercise() {
    state = "IDLE";
    currentNoteIndex = -1;
    allNoteScores = [];
    // --- ИЗМЕНЕНИЕ 3: Сбрасываем таймаут при рестарте упражнения ---
    if (noteResetTimeout) clearTimeout(noteResetTimeout);
    noteResetTimeout = null;
    noteStartTime = 0;

    updateUI();
    startButton.textContent = "Начать упражнение";
    startButton.disabled = false;
    stopButton.classList.add("hidden");
    resultsModal.classList.add("hidden");
  }

  function startExercise() {
    if (state !== "IDLE") return;
    initAudioContext();
    if (!isListening) startListening();

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
    stopListening();
    updateUI();
    showResults();
    startButton.textContent = "Начать заново";
    startButton.disabled = false;
    stopButton.classList.add("hidden");
  }

  function showResults() {
    let totalCents = 0;
    let worstNote = { note: "--", deviation: -1 };

    allNoteScores.forEach((score) => {
      const deviation = Math.abs(score.cents);
      totalCents += deviation;
      if (deviation > worstNote.deviation) {
        worstNote = { note: score.note, deviation: deviation };
      }
    });

    const avgCents =
      allNoteScores.length > 0 ? totalCents / allNoteScores.length : 0;

    resultsContent.innerHTML = `<div class="stat-item">
        <span class="stat-label">Средняя точность</span>
        <span class="stat-value">±${avgCents.toFixed(1)} cents</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Самая сложная нота</span>
        <span class="stat-value">${
          worstNote.note
        } (±${worstNote.deviation.toFixed(0)} cents)</span>
      </div>`;

    resultsModal.classList.remove("hidden");
  }

  function updateUI() {
    highlightTargetKey(null);
    if (state === "IDLE") {
      instructionsElement.textContent = currentExercise.description;
      progressElement.textContent = `Ноты: ${currentExercise.notes.length}`;
    } else if (state === "LISTENING" || state === "FEEDBACK") {
      const targetNote = currentExercise.notes[currentNoteIndex];
      instructionsElement.textContent = `Пойте: ${targetNote.noteName}`;
      progressElement.textContent = `Нота ${currentNoteIndex + 1} / ${
        currentExercise.notes.length
      }`;
      highlightTargetKey(targetNote.noteName);
      scrollToNote(noteToNoteNum(targetNote.noteName), false);
    } else if (state === "FINISHED") {
      instructionsElement.textContent = "Результаты";
      progressElement.textContent = `Точность: ${allNoteScores.length} / ${currentExercise.notes.length}`;
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

    if (
      (state === "LISTENING" || state === "FEEDBACK") &&
      currentExercise &&
      currentNoteIndex >= 0
    ) {
      const targetNoteNum = noteToNoteNum(
        currentExercise.notes[currentNoteIndex].noteName
      );
      if (targetNoteNum !== null) {
        const yCenter = noteNumToY(targetNoteNum);
        const toleranceInSemitones = centTolerance / 100;
        const toleranceHeight = (WHITE_KEY_PIXELS / 2) * toleranceInSemitones;
        canvasCtx.fillStyle = "rgba(40, 167, 69, 0.25)";
        canvasCtx.fillRect(
          0,
          yCenter - toleranceHeight,
          width,
          toleranceHeight * 2
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
      if (pitch !== null) {
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
      const num = noteToNoteNum(n.noteName);
      if (num === null) return n;
      const newNum = num + shift;
      n.noteName = noteStrings[newNum % 12] + Math.floor(newNum / 12);
      return n;
    });
    return newEx;
  }

  function noteToNoteNum(note) {
    const name = note.replace(/[0-9]/g, "");
    const oct = parseInt(note.slice(-1));
    const index = noteStrings.indexOf(name);
    if (index === -1) return null;
    return 12 * oct + index;
  }

  function frequencyToNoteDetails(freq) {
    const num = 12 * Math.log2(freq / C0);
    const roundNum = Math.round(num);
    const oct = Math.floor(roundNum / 12);
    const note = noteStrings[roundNum % 12];
    const idealFreq = C0 * Math.pow(2, roundNum / 12);
    const cents = 1200 * Math.log2(freq / idealFreq);
    return { note, octave: oct, cents, noteNum: roundNum };
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
    if (canvas.parentElement) {
      canvas.width = canvas.parentElement.clientWidth;
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
      pianoContainer.appendChild(key);
    }
  }

  function scrollToNote(num, immediate = false) {
    if (num === null) return;
    const whiteKeysAbove = Array.from(
      { length: MAX_NOTE_NUM - num },
      (_, i) => i + num + 1
    ).filter((n) => !noteStrings[n % 12].includes("#")).length;
    const yPos = whiteKeysAbove * WHITE_KEY_PIXELS + WHITE_KEY_PIXELS / 2;
    targetScrollOffset = yPos - mainContent.clientHeight / 2;
    if (immediate) {
      scrollOffsetPixels = targetScrollOffset;
    }
  }

  function initAudioContext() {
    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        dummyGainNode = audioContext.createGain();
        dummyGainNode.gain.value = 0;
        dummyGainNode.connect(audioContext.destination);
      } catch (e) {
        alert("Web Audio API не поддерживается в вашем браузере.");
      }
    }
    if (audioContext.state === "suspended") audioContext.resume();
  }

  async function startListening() {
    if (isListening || !audioContext) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      dataArray = new Float32Array(analyser.fftSize);
      sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNode.connect(analyser);
      analyser.connect(dummyGainNode);
      isListening = true;
    } catch (err) {
      console.error("Microphone access error:", err);
    }
  }

  function stopListening() {
    if (!isListening || !sourceNode) return;
    sourceNode.mediaStream.getTracks().forEach((track) => track.stop());
    sourceNode.disconnect();
    sourceNode = null;
    isListening = false;
  }

  function playReferenceNote() {
    if (!audioContext) return;
    stopReferenceTone();
    const freq =
      C0 *
      Math.pow(
        2,
        noteToNoteNum(currentExercise.notes[currentNoteIndex].noteName) / 12
      );
    if (!freq) return;

    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.7);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + 0.8);
    referenceOscillator = osc;
  }

  function stopReferenceTone() {
    if (referenceOscillator) {
      try {
        referenceOscillator.stop();
      } catch (e) {}
      referenceOscillator = null;
    }
  }

  function yin(buffer, sampleRate) {
    const threshold = 0.12;
    const bufferSize = buffer.length;
    const yinBufferSize = bufferSize / 2;
    const yinBuffer = new Float32Array(yinBufferSize);
    let tauEstimate = -1;
    let pitchInHz = -1;
    let runningSum = 0;
    yinBuffer[0] = 1;
    for (let tau = 1; tau < yinBufferSize; tau++) {
      let differenceSum = 0;
      for (let i = 0; i < yinBufferSize; i++) {
        const delta = buffer[i] - buffer[i + tau];
        differenceSum += delta * delta;
      }
      runningSum += differenceSum;
      yinBuffer[tau] = (differenceSum * tau) / (runningSum || 1);
    }
    for (let tau = 4; tau < yinBufferSize; tau++) {
      if (yinBuffer[tau] < threshold) {
        if (
          yinBuffer[tau] < yinBuffer[tau - 1] &&
          yinBuffer[tau] < yinBuffer[tau + 1]
        ) {
          tauEstimate = tau;
          break;
        }
      }
    }
    if (tauEstimate === -1) {
      let min = Infinity;
      for (let tau = 4; tau < yinBufferSize; tau++) {
        if (yinBuffer[tau] < min) {
          min = yinBuffer[tau];
          tauEstimate = tau;
        }
      }
    }
    if (tauEstimate > 0 && tauEstimate < yinBufferSize - 1) {
      const y1 = yinBuffer[tauEstimate - 1];
      const y2 = yinBuffer[tauEstimate];
      const y3 = yinBuffer[tauEstimate + 1];
      const denominator = 2 * (2 * y2 - y3 - y1);
      if (denominator !== 0) {
        const betterTau = tauEstimate + (y3 - y1) / denominator;
        pitchInHz = sampleRate / betterTau;
      } else {
        pitchInHz = sampleRate / tauEstimate;
      }
    }
    return pitchInHz > 50 && pitchInHz < 3000 ? pitchInHz : -1;
  }

  startButton.addEventListener("click", startExercise);
  stopButton.addEventListener("click", () => {
    if (isListening) {
      stopListening();
    }
    resetExercise();
  });
  restartButton.addEventListener("click", () => {
    resetExercise();
    startExercise();
  });
  backToMenuButton.addEventListener("click", () => {
    window.location.href = "trainer_menu.html";
  });

  init();
});
