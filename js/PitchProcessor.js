// --- START OF FILE PitchProcessor.js ---

/**
 * Создает экземпляр обработчика высоты тона (pitch).
 * Эта фабрика инкапсулирует сложную логику для преобразования "сырых"
 * данных о частоте в стабильную, подтвержденную информацию о ноте.
 *
 * @param {VoiceEngine} voiceEngine - Экземпляр голосового движка для выполнения расчетов.
 * @param {object} [config={}] - Объект конфигурации.
 * @param {number} [config.smoothingWindowSize=5] - Размер окна для медианного фильтра.
 * @param {number} [config.confirmationThreshold=3] - Количество последовательных кадров для подтверждения ноты.
 * @param {number} [config.candidateConfirmationThreshold=4] - Количество кадров для подтверждения новой "стабильной" частоты при резком скачке.
 * @returns {{process: function(object): object|null, reset: function(): void}} - Объект с методами process и reset.
 */
function createPitchProcessor(voiceEngine, config = {}) {
  // --- Конфигурация с значениями по умолчанию ---
  const {
    smoothingWindowSize = 5,
    confirmationThreshold = 3,
    candidateConfirmationThreshold = 4,
  } = config;

  // --- Внутреннее состояние модуля ---
  let pitchBuffer = [];
  let ignoreFramesCounter = 0;
  let previousSmoothedFreq = null;

  let stableNoteDetails = null;
  let potentialNoteNum = null;
  let potentialNoteCount = 0;

  let lastStableFreq = null;
  let candidateFreq = null;
  let candidateCount = 0;

  /**
   * Приватная функция: выбирает лучшую оценку высоты тона из двух алгоритмов (MPM и HPS).
   * @param {{mpm: number|null, hps: number|null}} pitchResults - Результаты от VoiceEngine.
   * @param {number|null} lastFreq - Последняя стабильно определенная частота.
   * @returns {number|null} - Наиболее вероятная частота.
   */
  function selectBestPitch(pitchResults, lastFreq) {
    const { mpm, hps } = pitchResults;

    if (!mpm && !hps) return null;
    if (!mpm) return hps;
    if (!hps) return mpm;

    // Октавная ошибка: если частоты отличаются примерно в 2 раза, HPS часто точнее.
    const ratio = mpm / hps;
    if (ratio > 1.9 && ratio < 2.1) return hps;
    if (ratio > 0.47 && ratio < 0.53) return mpm;

    // Если есть предыдущая стабильная частота, используем ее как контекст.
    if (lastFreq) {
      const mpmDiff = Math.abs(mpm - lastFreq);
      const hpsDiff = Math.abs(hps - lastFreq);

      // Если оба результата близки к предыдущему, выбираем самый близкий.
      if (mpmDiff < lastFreq * 0.2 && hpsDiff < lastFreq * 0.2) {
        return mpmDiff < hpsDiff ? mpm : hps;
      }

      // Если только один результат близок, выбираем его.
      if (mpmDiff < lastFreq * 0.2) return mpm;
      if (hpsDiff < lastFreq * 0.2) return hps;
    }

    // В остальных случаях MPM является более надежным по умолчанию.
    return mpm;
  }

  /**
   * Обрабатывает "сырые" данные о частоте и возвращает стабильную ноту.
   * @param {{mpm: number|null, hps: number|null}} rawPitchResults - "Сырые" результаты от voiceEngine.getPitch().
   * @returns {object|null} - Объект stableNoteDetails или null, если нота не определена.
   */
  function process(rawPitchResults) {
    // 1. Выбор лучшей "сырой" частоты
    let rawFreq = null;
    if (rawPitchResults) {
      rawFreq = selectBestPitch(rawPitchResults, lastStableFreq);
    }

    // 2. Логика самокоррекции ("правило сильного большинства")
    if (rawFreq && lastStableFreq) {
      const diff = Math.abs(rawFreq - lastStableFreq);
      // Если новая частота сильно отличается (больше чем на ~3 полутона)
      if (diff > lastStableFreq * 0.2) {
        // Проверяем, это тот же кандидат, что и в прошлый раз?
        if (
          candidateFreq &&
          Math.abs(rawFreq - candidateFreq) < candidateFreq * 0.1
        ) {
          candidateCount++;
        } else {
          // Новый кандидат
          candidateFreq = rawFreq;
          candidateCount = 1;
        }

        // Если кандидат подтвержден, он становится новой "правдой" (самокоррекция)
        if (candidateCount >= candidateConfirmationThreshold) {
          lastStableFreq = candidateFreq;
          candidateFreq = null;
          candidateCount = 0;
        } else {
          // Пока кандидат не подтвержден, игнорируем его
          rawFreq = null;
        }
      } else {
        // Частота близка к стабильной, сбрасываем кандидата
        candidateFreq = null;
        candidateCount = 0;
      }
    } else if (!rawFreq) {
      // Если звука нет, сбрасываем кандидата
      candidateFreq = null;
      candidateCount = 0;
    }

    // 3. Сглаживание (Медианный фильтр)
    pitchBuffer.push(rawFreq);
    if (pitchBuffer.length > smoothingWindowSize) {
      pitchBuffer.shift();
    }

    const validPitches = pitchBuffer.filter(
      (p) => typeof p === "number" && p > 0
    );
    let smoothedFreq = null;

    if (validPitches.length > smoothingWindowSize / 2) {
      validPitches.sort((a, b) => a - b);
      smoothedFreq = validPitches[Math.floor(validPitches.length / 2)];
    }

    // 4. Игнорирование первых кадров после появления звука для предотвращения "скачков"
    if (previousSmoothedFreq === null && smoothedFreq !== null) {
      ignoreFramesCounter = 5; // Игнорировать следующие 5 кадров
    }
    previousSmoothedFreq = smoothedFreq;

    let currentPitchFreq = null;
    let pitchInfo = null;

    if (ignoreFramesCounter > 0) {
      ignoreFramesCounter--;
    } else {
      currentPitchFreq = smoothedFreq;
      if (currentPitchFreq) {
        pitchInfo = voiceEngine.frequencyToNoteDetails(currentPitchFreq);
      }
    }

    // 5. Подтверждение стабильности ноты
    if (pitchInfo) {
      const currentNoteNum = pitchInfo.noteNum;
      if (currentNoteNum === potentialNoteNum) {
        potentialNoteCount++;
      } else {
        potentialNoteNum = currentNoteNum;
        potentialNoteCount = 1;
      }

      if (potentialNoteCount >= confirmationThreshold) {
        stableNoteDetails = pitchInfo;
        if (!lastStableFreq) {
          // Устанавливаем самую первую стабильную частоту для контекста
          lastStableFreq = stableNoteDetails.frequency;
        }
      }
    } else {
      stableNoteDetails = null;
      potentialNoteNum = null;
      potentialNoteCount = 0;
      // При долгой тишине можно сбросить контекст, чтобы быть готовым к любой новой ноте
      if (!rawFreq) {
        lastStableFreq = null;
      }
    }

    return stableNoteDetails;
  }

  /**
   * Сбрасывает внутреннее состояние обработчика к начальным значениям.
   * Необходимо вызывать при перезапуске упражнения или сессии.
   */
  function reset() {
    pitchBuffer = [];
    ignoreFramesCounter = 0;
    previousSmoothedFreq = null;
    stableNoteDetails = null;
    potentialNoteNum = null;
    potentialNoteCount = 0;
    lastStableFreq = null;
    candidateFreq = null;
    candidateCount = 0;
  }

  // Возвращаем публичный API
  return {
    process,
    reset,
  };
}

// --- END OF FILE PitchProcessor.js ---
