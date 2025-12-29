// --- START OF FILE js/tuner.js ---

document.addEventListener("DOMContentLoaded", () => {
  // --- Инициализация голосового движка и обработчика высоты тона ---
  const voiceEngine = new VoiceEngine();
  const pitchProcessor = createPitchProcessor(voiceEngine);

  let userId = null;
  let userProgress = {};
  let sessionStats;

  if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    try {
      userId = Telegram.WebApp.initDataUnsafe.user.id;
    } catch (e) {
      console.warn("Не удалось получить ID пользователя Telegram.");
    }
  }
  if (!userId) userId = "dev_user";

  const mainContent = document.getElementById("main-content");
  const display = document.querySelector(".output-display");
  const startButton = document.getElementById("startButton");
  const noteElement = document.getElementById("note");
  const octaveElement = document.getElementById("octave");
  const centsElement = document.getElementById("cents");
  const statusMessage = document.getElementById("status-message");
  const pianoContainer = document.getElementById("piano-container");
  const canvas = document.getElementById("pitch-canvas");
  const canvasCtx = canvas.getContext("2d");
  const holdButton = document.getElementById("holdButton");
  const tunerIndicator = document.getElementById("tuner-indicator");
  const tunerContainer = document.querySelector(".tuner-container");
  const referenceToneButton = document.getElementById("referenceToneButton");
  const targetNoteDisplay = document.getElementById("target-note-display");
  const octaveUpBtn = document.getElementById("octaveUp");
  const octaveDownBtn = document.getElementById("octaveDown");
  const progressArea = document.getElementById("progress-area");
  const levelDisplay = document.getElementById("level-display");
  const xpDisplay = document.getElementById("xp-display");
  const progressBarFill = document.getElementById("progress-bar-fill");
  const statsButton = document.getElementById("statsButton");
  const statsModal = document.getElementById("stats-modal");
  const closeStatsModal = document.getElementById("close-stats-modal");
  const sessionBestNoteStat = document.getElementById("session-best-note-stat");
  const sessionLongestHoldStat = document.getElementById(
    "session-longest-hold-stat"
  );
  const sessionBestIntonationStat = document.getElementById(
    "session-best-intonation-stat"
  );
  const allTimeBestNoteStat = document.getElementById(
    "all-time-best-note-stat"
  );
  const allTimeLongestHoldStat = document.getElementById(
    "all-time-longest-hold-stat"
  );
  const allTimeBestIntonationStat = document.getElementById(
    "all-time-best-intonation-stat"
  );
  const loadingIndicator = document.getElementById("loading-indicator");

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
  const sharpToFlat = {
    "C#": "Db",
    "D#": "Eb",
    "F#": "Gb",
    "G#": "Ab",
    "A#": "Bb",
  };
  const MIN_NOTE_NUM = 12; // C1
  const MAX_NOTE_NUM = 84; // C7
  const NUM_NOTES_DISPLAYED = MAX_NOTE_NUM - MIN_NOTE_NUM + 1;
  const WHITE_KEY_PIXELS = 50;
  const PITCH_HISTORY_SIZE = 400;

  // --- Переменные состояния ---
  let targetNote = null;
  let pitchHistory = [];
  let scrollOffsetPixels = 0,
    targetScrollOffset = 0,
    maxScrollOffset = 0;
  let isManuallyScrolling = false,
    manualScrollTimeout,
    lastTouchY = 0;

  // --- Переменные состояния тюнера ---
  let isFrozen = false;
  let referenceOscillator = null;
  let successfulSingTimeStart = 0;
  let currentStreak = 0;
  let lastSaveTime = 0;
  let recentCents = [];

  const XP_PER_SECOND = 1;
  const levelThresholds = [
    0, 120, 360, 720, 1500, 3000, 6000, 12000, 24000, 50000,
  ];

  function initializeSessionStats() {
    sessionStats = {
      noteStats: {},
      longestHold: { time: 0, note: null },
      bestIntonation: { cents: 999, note: null },
    };
  }

  function getDefaultProgress() {
    return {
      xp: 0,
      lastPracticeDate: null,
      noteStats: {},
      longestHold: { time: 0, note: null },
      bestIntonation: { cents: 999, note: null },
      chromaticNotes: [],
    };
  }

  function loadProgress() {
    try {
      const allData =
        JSON.parse(localStorage.getItem("vocal_progress_data")) || {};
      userProgress = allData[userId] || getDefaultProgress();
      if (
        !userProgress.longestHold ||
        typeof userProgress.longestHold !== "object"
      )
        userProgress.longestHold = {
          time: userProgress.longestHold || 0,
          note: null,
        };
      if (
        !userProgress.bestIntonation ||
        typeof userProgress.bestIntonation !== "object"
      )
        userProgress.bestIntonation = {
          cents: userProgress.bestIntonation || 999,
          note: null,
        };
      userProgress.chromaticNotes = new Set(userProgress.chromaticNotes || []);
    } catch (e) {
      userProgress = getDefaultProgress();
      userProgress.chromaticNotes = new Set();
    }
    updateProgressUI();
  }

  function saveProgress() {
    try {
      const allData =
        JSON.parse(localStorage.getItem("vocal_progress_data")) || {};
      const progressToSave = { ...userProgress };
      if (progressToSave.chromaticNotes instanceof Set) {
        progressToSave.chromaticNotes = Array.from(
          progressToSave.chromaticNotes
        );
      }
      allData[userId] = progressToSave;
      localStorage.setItem("vocal_progress_data", JSON.stringify(allData));
    } catch (e) {
      console.error("Не удалось сохранить прогресс:", e);
    }
  }

  function checkTunerAchievements() {
    if (userProgress.longestHold.time >= 5)
      localStorage.setItem("tuner_hold_5s", new Date().toISOString());
    if (userProgress.longestHold.time >= 10)
      localStorage.setItem("tuner_hold_10s", new Date().toISOString());
    if (userProgress.chromaticNotes.size >= 12)
      localStorage.setItem("tuner_chromatic_12", new Date().toISOString());
    if (window.AchievementsEngine) AchievementsEngine.checkAndUnlock();
  }

  function calculateLevel(xp) {
    let level = 1;
    for (let i = 1; i < levelThresholds.length; i++) {
      if (xp >= levelThresholds[i]) {
        level = i + 1;
      } else {
        break;
      }
    }
    return level;
  }

  function updateProgressUI() {
    const level = calculateLevel(userProgress.xp);
    const currentLevelXP = level > 1 ? levelThresholds[level - 1] : 0;
    const nextLevelXP = levelThresholds[level] || userProgress.xp;
    const xpInLevel = userProgress.xp - currentLevelXP;
    const xpForLevel = nextLevelXP - currentLevelXP;
    levelDisplay.textContent = `Уровень ${level}`;
    xpDisplay.textContent = `${userProgress.xp} / ${nextLevelXP} XP`;
    progressBarFill.style.width = `${(xpInLevel / xpForLevel) * 100}%`;
    progressArea.classList.remove("hidden");
    statsButton.classList.remove("hidden");
  }

  function updateLastPracticeDate() {
    const today = new Date().toDateString();
    if (userProgress.lastPracticeDate !== today) {
      userProgress.lastPracticeDate = today;
    }
  }

  function formatTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)} сек`;
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min} мин ${sec} сек`;
  }

  function openStatsModal() {
    const populateStatsBlock = (
      stats,
      bestNoteEl,
      longestHoldEl,
      bestIntonationEl
    ) => {
      let bestNote = null,
        maxTime = 0;
      for (const note in stats.noteStats) {
        if (stats.noteStats[note] > maxTime) {
          maxTime = stats.noteStats[note];
          bestNote = note;
        }
      }
      bestNoteEl.textContent = bestNote
        ? `${bestNote} (${formatTime(maxTime)})`
        : "--";
      longestHoldEl.textContent =
        stats.longestHold && stats.longestHold.note
          ? `${formatTime(stats.longestHold.time)} (на ${
              stats.longestHold.note
            })`
          : `${formatTime(stats.longestHold.time || 0)}`;
      bestIntonationEl.textContent =
        stats.bestIntonation && stats.bestIntonation.cents < 999
          ? `±${stats.bestIntonation.cents.toFixed(1)} cents (на ${
              stats.bestIntonation.note
            })`
          : "--";
    };
    populateStatsBlock(
      sessionStats,
      sessionBestNoteStat,
      sessionLongestHoldStat,
      sessionBestIntonationStat
    );
    populateStatsBlock(
      userProgress,
      allTimeBestNoteStat,
      allTimeLongestHoldStat,
      allTimeBestIntonationStat
    );
    statsModal.classList.remove("hidden");
  }

  async function startListening() {
    if (voiceEngine.isListening) return;
    try {
      await voiceEngine.startListening();
      startButton.textContent = "Остановить";
      startButton.classList.add("listening");
      tunerContainer.style.visibility = "visible";
      centsElement.textContent = "Пойте в микрофон...";
    } catch (err) {
      statusMessage.textContent = "Ошибка доступа к микрофону.";
      console.error(err);
    }
  }

  function stopListening() {
    if (!voiceEngine.isListening) return;
    voiceEngine.stopListening();
    pitchProcessor.reset(); // Сброс состояния обработчика
    startButton.textContent = "Начать";
    startButton.classList.remove("listening");
    resetDisplay();
    stopReferenceTone();
    if (isFrozen) toggleFreeze();
  }

  function setupUI() {
    if (!mainContent.clientHeight) {
      setTimeout(setupUI, 50);
      return;
    }
    mainContent.style.overflow = "hidden";
    const totalWhiteKeys = Array.from(
      { length: NUM_NOTES_DISPLAYED },
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
      const noteName = noteStrings[i % 12];
      const octave = Math.floor(i / 12);
      const isBlack = noteName.includes("#");
      const key = document.createElement("div");
      key.className = `key ${isBlack ? "black" : "white"}`;
      key.dataset.note = `${noteName}${octave}`;
      key.id = "key-" + (noteName + octave).replace("#", "s");
      const label = document.createElement("span");
      label.className = "key-label";
      if (!isBlack) {
        key.style.height = `${WHITE_KEY_PIXELS}px`;
        key.style.top = `${currentY}px`;
        label.textContent = noteName + octave;
        key.appendChild(label);
        currentY += WHITE_KEY_PIXELS;
      } else {
        const blackKeyHeight = WHITE_KEY_PIXELS * 0.6;
        key.style.height = `${blackKeyHeight}px`;
        key.style.top = `${currentY - blackKeyHeight / 2}px`;
        const flatName = sharpToFlat[noteName];
        label.innerHTML = `${noteName}<br>${flatName}`;
        key.appendChild(label);
      }
      key.addEventListener("click", onKeyClick);
      pianoContainer.appendChild(key);
    }
    scrollToNote(48, true);
    drawPitchGraph();
  }

  const noteNumToY = (noteNumFloat) => {
    const noteNumInt = Math.floor(noteNumFloat);
    const fraction = noteNumFloat - noteNumInt;
    const whiteKeysAbove = Array.from(
      { length: MAX_NOTE_NUM - noteNumInt },
      (_, i) => i + noteNumInt + 1
    ).filter((n) => !noteStrings[n % 12].includes("#")).length;
    const yOfNoteBoundary = whiteKeysAbove * WHITE_KEY_PIXELS;
    const currentNoteName = noteStrings[noteNumInt % 12];
    const semitoneHeight =
      currentNoteName === "E" || currentNoteName === "B"
        ? WHITE_KEY_PIXELS
        : WHITE_KEY_PIXELS / 2;
    return yOfNoteBoundary + semitoneHeight - fraction * semitoneHeight;
  };

  function drawPitchGraph() {
    const width = canvas.width,
      height = canvas.height;
    canvasCtx.fillStyle = "#000";
    canvasCtx.fillRect(0, 0, width, height);
    if (targetNote) {
      const targetKeyElement = document.getElementById(
        "key-" + targetNote.replace("#", "s")
      );
      if (targetKeyElement) {
        const keyTop = targetKeyElement.offsetTop,
          keyHeight = targetKeyElement.offsetHeight;
        canvasCtx.fillStyle = "rgba(0, 123, 255, 0.3)";
        canvasCtx.fillRect(0, keyTop, width, keyHeight);
      }
    }
    const totalWhiteKeys = Array.from(
      { length: NUM_NOTES_DISPLAYED },
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
    canvasCtx.strokeStyle = "#ffc107";
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    let lastPointWasNull = true;
    for (let i = 0; i < pitchHistory.length; i++) {
      const pitch = pitchHistory[i];
      const x = (i / PITCH_HISTORY_SIZE) * width;

      if (pitch && pitch > 0) {
        const noteNumFloat = 12 * Math.log2(pitch / voiceEngine.C0);
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

    // 2. Обработка звука
    let currentPitchFreq = null;

    if (voiceEngine.isListening && !isFrozen) {
      const rawPitchResults = voiceEngine.getPitch();
      const stableNoteDetails = pitchProcessor.process(rawPitchResults);

      if (stableNoteDetails) {
        currentPitchFreq = stableNoteDetails.frequency;

        noteElement.textContent = stableNoteDetails.note;
        octaveElement.textContent = stableNoteDetails.octave;
        centsElement.textContent = `Отклонение: ${stableNoteDetails.cents.toFixed(
          0
        )} cents`;
        updateTuner(stableNoteDetails.cents);

        if (!isManuallyScrolling) scrollToNote(stableNoteDetails.noteNum);

        if (targetNote) {
          const sungNoteWithOctave =
            stableNoteDetails.note + stableNoteDetails.octave;
          display.classList.remove("correct", "octave-miss", "wrong");
          if (sungNoteWithOctave === targetNote)
            display.classList.add("correct");
          else if (stableNoteDetails.note === targetNote.replace(/[0-9]/g, ""))
            display.classList.add("octave-miss");
          else display.classList.add("wrong");
        }

        let isCorrectNote = false;
        if (targetNote) {
          if (stableNoteDetails.note + stableNoteDetails.octave === targetNote)
            isCorrectNote = true;
        }

        if (isCorrectNote) {
          if (successfulSingTimeStart === 0)
            successfulSingTimeStart = Date.now();
          currentStreak = (Date.now() - successfulSingTimeStart) / 1000;
          recentCents.push(Math.abs(stableNoteDetails.cents));
          if (recentCents.length > 60) recentCents.shift();
          if (recentCents.length === 60) {
            const avgCents =
              recentCents.reduce((a, b) => a + b, 0) / recentCents.length;
            if (avgCents < sessionStats.bestIntonation.cents)
              sessionStats.bestIntonation = {
                cents: avgCents,
                note: targetNote,
              };
            if (avgCents < userProgress.bestIntonation.cents)
              userProgress.bestIntonation = {
                cents: avgCents,
                note: targetNote,
              };
            userProgress.chromaticNotes.add(stableNoteDetails.note);
          }
        } else {
          if (successfulSingTimeStart > 0) {
            const elapsedSeconds =
              (Date.now() - successfulSingTimeStart) / 1000;
            userProgress.xp += Math.round(elapsedSeconds * XP_PER_SECOND);
            if (!sessionStats.noteStats[targetNote])
              sessionStats.noteStats[targetNote] = 0;
            sessionStats.noteStats[targetNote] += elapsedSeconds;
            if (currentStreak > sessionStats.longestHold.time)
              sessionStats.longestHold = {
                time: currentStreak,
                note: targetNote,
              };
            if (!userProgress.noteStats[targetNote])
              userProgress.noteStats[targetNote] = 0;
            userProgress.noteStats[targetNote] += elapsedSeconds;
            if (currentStreak > userProgress.longestHold.time)
              userProgress.longestHold = {
                time: currentStreak,
                note: targetNote,
              };
            updateLastPracticeDate();
            updateProgressUI();
            checkTunerAchievements();
          }
          successfulSingTimeStart = 0;
          currentStreak = 0;
          recentCents = [];
        }
      } else {
        // --- Если стабильная нота не определена ---
        noteElement.textContent = "--";
        octaveElement.textContent = "";
        centsElement.textContent = "Пойте в микрофон...";
        updateTuner(null);
        display.classList.remove("correct", "octave-miss", "wrong");

        if (successfulSingTimeStart > 0) {
          const elapsedSeconds = (Date.now() - successfulSingTimeStart) / 1000;
          userProgress.xp += Math.round(elapsedSeconds * XP_PER_SECOND);
          if (!sessionStats.noteStats[targetNote])
            sessionStats.noteStats[targetNote] = 0;
          sessionStats.noteStats[targetNote] += elapsedSeconds;
          if (currentStreak > sessionStats.longestHold.time)
            sessionStats.longestHold = {
              time: currentStreak,
              note: targetNote,
            };
          if (!userProgress.noteStats[targetNote])
            userProgress.noteStats[targetNote] = 0;
          userProgress.noteStats[targetNote] += elapsedSeconds;
          if (currentStreak > userProgress.longestHold.time)
            userProgress.longestHold = {
              time: currentStreak,
              note: targetNote,
            };
          updateLastPracticeDate();
          updateProgressUI();
          checkTunerAchievements();
        }
        successfulSingTimeStart = 0;
        currentStreak = 0;
        recentCents = [];
      }

      if (Date.now() - lastSaveTime > 5000) {
        saveProgress();
        lastSaveTime = Date.now();
      }
    }

    pitchHistory.push(currentPitchFreq);
    if (pitchHistory.length > PITCH_HISTORY_SIZE) pitchHistory.shift();

    drawPitchGraph();
    requestAnimationFrame(mainLoop);
  }

  let allAudioLoaded = false;
  function onKeyClick(event) {
    voiceEngine.initAudioContext();
    if (!voiceEngine.audioContext) return;

    const key = event.currentTarget;
    const newTargetNote = key.dataset.note;
    document
      .querySelectorAll(".key.target")
      .forEach((k) => k.classList.remove("target"));
    key.classList.add("target");

    if (targetNote !== newTargetNote && referenceOscillator)
      toggleReferenceTone();
    targetNote = newTargetNote;
    targetNoteDisplay.textContent = `Цель: ${targetNote}`;
    referenceToneButton.classList.remove("hidden");
    isManuallyScrolling = false;

    if (
      !allAudioLoaded &&
      pianoSoundService &&
      typeof pianoSoundService.isAnySampleLoaded === "function" &&
      !pianoSoundService.isAnySampleLoaded()
    ) {
      allAudioLoaded = true;
      pianoSoundService
        .initialize()
        .then(() => {
          pianoSoundService.playSound(newTargetNote);
        })
        .catch(() => {
          alert("Ошибка загрузки аудио");
        });
    } else {
      pianoSoundService.playSound(newTargetNote);
    }

    if (!voiceEngine.isListening) startListening();
  }

  startButton.addEventListener("click", () => {
    voiceEngine.initAudioContext();
    if (!voiceEngine.audioContext) return;

    if (!voiceEngine.isListening) {
      targetNote = null;
      document
        .querySelectorAll(".key.target")
        .forEach((k) => k.classList.remove("target"));
      stopReferenceTone();
      referenceToneButton.classList.add("hidden");
      targetNoteDisplay.textContent = "";
      isManuallyScrolling = false;
      startListening();
      if (!localStorage.getItem("tuner_first_use")) {
        localStorage.setItem("tuner_first_use", new Date().toISOString());
        if (window.AchievementsEngine) AchievementsEngine.checkAndUnlock();
      }
    } else {
      stopListening();
    }
  });

  holdButton.addEventListener("click", toggleFreeze);
  referenceToneButton.addEventListener("click", toggleReferenceTone);
  statsButton.addEventListener("click", openStatsModal);
  closeStatsModal.addEventListener("click", () =>
    statsModal.classList.add("hidden")
  );

  function toggleFreeze() {
    if (!voiceEngine.isListening) return;
    isFrozen = !isFrozen;
    holdButton.classList.toggle("active", isFrozen);
    holdButton.textContent = isFrozen ? "Продолжить" : "Заморозить";
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

  function toggleReferenceTone() {
    if (!voiceEngine.audioContext || !targetNote) return;
    if (referenceOscillator) {
      stopReferenceTone();
    } else {
      const frequency = noteToFrequency(targetNote);
      if (!frequency) return;

      const ctx = voiceEngine.audioContext;
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      referenceOscillator = { oscillator, gainNode };
      referenceToneButton.classList.add("active");
    }
  }

  function stopReferenceTone() {
    if (referenceOscillator) {
      const { oscillator, gainNode } = referenceOscillator;
      const ctx = voiceEngine.audioContext;
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      oscillator.stop(ctx.currentTime + 0.1);
      referenceOscillator = null;
      referenceToneButton.classList.remove("active");
    }
  }

  function resetDisplay() {
    noteElement.textContent = "--";
    octaveElement.textContent = "";
    centsElement.textContent = "Нажмите 'Начать' или сыграйте ноту";
    statusMessage.textContent = "";
    if (!targetNote) targetNoteDisplay.textContent = "";
    pitchHistory = [];
    updateTuner(null);
    tunerContainer.style.visibility = "hidden";
    drawPitchGraph();
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

  function noteToFrequency(note) {
    const noteNum = voiceEngine.noteToNoteNum(note);
    if (noteNum === null) return null;
    return voiceEngine.C0 * Math.pow(2, noteNum / 12);
  }

  function jumpOctave(direction) {
    startManualScroll();
    const octavePixelHeight = 7 * WHITE_KEY_PIXELS;
    targetScrollOffset += direction * octavePixelHeight;
    targetScrollOffset = Math.max(
      0,
      Math.min(targetScrollOffset, maxScrollOffset)
    );
    endManualScroll();
  }
  octaveUpBtn.addEventListener("click", () => jumpOctave(-1));
  octaveDownBtn.addEventListener("click", () => jumpOctave(1));

  function initializeApp() {
    initializeSessionStats();
    loadProgress();
    setTimeout(setupUI, 50);
    window.addEventListener("resize", setupUI);
    resetDisplay();
    mainLoop();
  }

  initializeApp();
});
// --- END OF FILE js/tuner.js ---
