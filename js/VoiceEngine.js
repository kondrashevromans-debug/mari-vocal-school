// --- START OF FILE js/VoiceEngine.js ---

class VoiceEngine {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.dummyGainNode = null;
    this.isListening = false;

    // --- НОВАЯ ДВУХКОНТУРНАЯ СИСТЕМА ---
    this.analyserWide = null; // "Разведчик": слушает весь спектр для грубой оценки
    this.analyserNarrow = null; // "Снайпер": слушает отфильтрованный звук для точного анализа
    this.lowPassFilter = null; // Наш динамический фильтр

    // Массивы для данных
    this.timeDomainDataArray = null; // Для MPM (от "Снайпера")
    this.frequencyDataArrayNarrow = null; // Для HPS (от "Снайпера")
    this.frequencyDataArrayWide = null; // Для оценки спектра (от "Разведчика")

    // Константы
    this.fftSize = 4096;
    this.noteStrings = [
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
    this.A4 = 440;
    this.C0 = this.A4 * Math.pow(2, -4.75);
    this.rmsThreshold = 0.025;
  }

  initAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        this.dummyGainNode = this.audioContext.createGain();
        this.dummyGainNode.gain.value = 0;
        this.dummyGainNode.connect(this.audioContext.destination);
      } catch (e) {
        console.error("Web Audio API не поддерживается:", e);
        alert("Web Audio API не поддерживается в вашем браузере.");
      }
    }
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }

  async startListening() {
    this.initAudioContext();
    if (this.isListening || !this.audioContext) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // --- СОЗДАЕМ КОМПОНЕНТЫ ДВУХКОНТУРНОЙ СИСТЕМЫ ---

      // 1. Динамический Low-Pass фильтр. Начальное значение - безопасное.
      this.lowPassFilter = this.audioContext.createBiquadFilter();
      this.lowPassFilter.type = "lowpass";
      this.lowPassFilter.frequency.setValueAtTime(
        2000,
        this.audioContext.currentTime
      );

      // 2. "Разведчик" (analyserWide)
      this.analyserWide = this.audioContext.createAnalyser();
      this.analyserWide.fftSize = this.fftSize;
      this.frequencyDataArrayWide = new Float32Array(
        this.analyserWide.frequencyBinCount
      );

      // 3. "Снайпер" (analyserNarrow)
      this.analyserNarrow = this.audioContext.createAnalyser();
      this.analyserNarrow.fftSize = this.fftSize;
      this.timeDomainDataArray = new Float32Array(this.analyserNarrow.fftSize);
      this.frequencyDataArrayNarrow = new Float32Array(
        this.analyserNarrow.frequencyBinCount
      );

      // 4. Собираем новую, раздвоенную цепочку обработки звука:
      //
      //                    ┌──> analyserWide ("Разведчик") ──> dummyGain (тишина)
      // Микрофон (source)──┤
      //                    └──> lowPassFilter ──> analyserNarrow ("Снайпер") ──> dummyGain (тишина)
      //
      this.sourceNode.connect(this.analyserWide);
      this.analyserWide.connect(this.dummyGainNode);

      this.sourceNode.connect(this.lowPassFilter);
      this.lowPassFilter.connect(this.analyserNarrow);
      this.analyserNarrow.connect(this.dummyGainNode);

      this.isListening = true;
    } catch (err) {
      console.error("Ошибка доступа к микрофону:", err);
      throw err;
    }
  }

  stopListening() {
    if (!this.isListening || !this.sourceNode) return;
    this.sourceNode.mediaStream.getTracks().forEach((track) => track.stop());
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isListening = false;
  }

  /**
   * Основной метод, реализующий адаптивную фильтрацию.
   */
  getPitch() {
    if (!this.isListening || !this.analyserNarrow) return null;

    // --- ЭТАП 1: РАЗВЕДКА ---
    // Получаем полный, нефильтрованный спектр от "Разведчика"
    this.analyserWide.getFloatFrequencyData(this.frequencyDataArrayWide);

    // Проверяем общую громкость по нефильтрованному сигналу (более надежно)
    // Для этого нам нужны данные временной области от "Разведчика"
    const wideTimeData = new Float32Array(this.analyserWide.fftSize);
    this.analyserWide.getFloatTimeDomainData(wideTimeData);
    let rms = 0;
    for (let i = 0; i < wideTimeData.length; i++) {
      rms += wideTimeData[i] * wideTimeData[i];
    }
    rms = Math.sqrt(rms / wideTimeData.length);

    if (rms < this.rmsThreshold) return { mpm: null, hps: null };

    // Находим пиковую частоту в нефильтрованном спектре
    let peakFreq = this._findPeakFrequency(this.frequencyDataArrayWide);

    // --- ЭТАП 2: АДАПТАЦИЯ ФИЛЬТРА ---
    // На основе пиковой частоты принимаем решение о настройке фильтра
    let targetFilterFreq;
    if (peakFreq < 500) {
      // Низкий голос или средний голос с сильным основным тоном.
      // Можно использовать агрессивный фильтр.
      targetFilterFreq = 900;
    } else if (peakFreq < 1000) {
      // Средний/высокий голос, возможно, с сильным обертоном.
      // Используем умеренный фильтр.
      targetFilterFreq = 1500;
    } else {
      // Очень высокий голос. Фильтр должен быть очень щадящим.
      targetFilterFreq = 2500;
    }

    // Плавно (!) меняем частоту среза фильтра, чтобы избежать щелчков
    this.lowPassFilter.frequency.setTargetAtTime(
      targetFilterFreq,
      this.audioContext.currentTime,
      0.01 // timeConstant - скорость изменения
    );

    // --- ЭТАП 3: ТОЧНЫЙ АНАЛИЗ ---
    // Теперь, когда фильтр настроен, получаем отфильтрованные данные от "Снайпера"
    this.analyserNarrow.getFloatTimeDomainData(this.timeDomainDataArray);
    this.analyserNarrow.getFloatFrequencyData(this.frequencyDataArrayNarrow);

    // Запускаем наши точные алгоритмы на чистых данных
    const mpmPitch = this._mpm(
      this.timeDomainDataArray,
      this.audioContext.sampleRate
    );
    const hpsPitch = this._hps(
      this.frequencyDataArrayNarrow,
      this.audioContext.sampleRate
    );

    return { mpm: mpmPitch, hps: hpsPitch };
  }

  /**
   * Вспомогательный метод для грубого поиска пиковой частоты в спектре.
   */
  _findPeakFrequency(spectrum) {
    let maxVal = -Infinity;
    let maxIndex = -1;

    // Ищем пик в разумном диапазоне (например, от 80 Гц до 4000 Гц)
    const minIndex = Math.round(
      (80 * this.fftSize) / this.audioContext.sampleRate
    );
    const maxIndexLimit = Math.round(
      (4000 * this.fftSize) / this.audioContext.sampleRate
    );

    for (let i = minIndex; i < maxIndexLimit; i++) {
      if (spectrum[i] > maxVal) {
        maxVal = spectrum[i];
        maxIndex = i;
      }
    }

    if (maxIndex === -1) return 0;

    return maxIndex * (this.audioContext.sampleRate / this.fftSize);
  }

  // Алгоритмы _mpm и _hps остаются без изменений, так как они получают уже готовые данные
  _mpm(buffer, sampleRate) {
    const K = 0.8;
    const bufferSize = buffer.length;
    const nsdf = new Float32Array(bufferSize);

    let acf = 0,
      m = 0;
    for (let tau = 0; tau < bufferSize; tau++) {
      acf = 0;
      m = 0;
      for (let i = 0; i < bufferSize - tau; i++) {
        acf += buffer[i] * buffer[i + tau];
        m += buffer[i] * buffer[i] + buffer[i + tau] * buffer[i + tau];
      }
      nsdf[tau] = (2 * acf) / (m || 1);
    }

    const maxPositions = [];
    let maxVal = -Infinity;
    for (let i = 1; i < nsdf.length - 1; i++) {
      if (nsdf[i] > maxVal) maxVal = nsdf[i];
      if (nsdf[i] > nsdf[i - 1] && nsdf[i] > nsdf[i + 1]) {
        maxPositions.push(i);
      }
    }
    if (maxPositions.length === 0) return null;

    let tauEstimate = -1;
    const threshold = K * maxVal;
    for (const pos of maxPositions) {
      if (nsdf[pos] > threshold) {
        tauEstimate = pos;
        break;
      }
    }
    if (tauEstimate === -1) {
      let highestPeakVal = -Infinity;
      for (const pos of maxPositions) {
        if (nsdf[pos] > highestPeakVal) {
          highestPeakVal = nsdf[pos];
          tauEstimate = pos;
        }
      }
    }

    let pitchInHz = null;
    if (tauEstimate > 0 && tauEstimate < nsdf.length - 1) {
      const y1 = nsdf[tauEstimate - 1],
        y2 = nsdf[tauEstimate],
        y3 = nsdf[tauEstimate + 1];
      const denominator = 2 * (2 * y2 - y3 - y1);
      if (denominator !== 0) {
        const betterTau = tauEstimate + (y1 - y3) / denominator;
        pitchInHz = sampleRate / betterTau;
      } else {
        pitchInHz = sampleRate / tauEstimate;
      }
    }

    return pitchInHz > 60 && pitchInHz < 2000 ? pitchInHz : null;
  }

  _hps(spectrum, sampleRate) {
    const result = new Float32Array(spectrum.length);

    for (let i = 0; i < spectrum.length; i++) {
      result[i] = Math.pow(10, spectrum[i] / 10);
    }

    const harmonics = 4;
    for (let i = 0; i < result.length; i++) {
      for (let j = 2; j <= harmonics; j++) {
        if (i * j < result.length) {
          result[i] *= result[i * j];
        } else {
          result[i] = 0;
        }
      }
    }

    let maxVal = -1;
    let maxIndex = -1;
    const minIndex = Math.round((60 * this.fftSize) / sampleRate);
    const maxIndexLimit = Math.round((2000 * this.fftSize) / sampleRate);

    for (let i = minIndex; i < maxIndexLimit; i++) {
      if (result[i] > maxVal) {
        maxVal = result[i];
        maxIndex = i;
      }
    }

    if (maxIndex === -1) return null;

    return maxIndex * (sampleRate / this.fftSize);
  }

  // --- Утилиты ---
  frequencyToNoteDetails(freq) {
    if (!freq) return null;
    const num = 12 * Math.log2(freq / this.C0);
    const roundNum = Math.round(num);
    const oct = Math.floor(roundNum / 12);
    const note = this.noteStrings[roundNum % 12];
    const idealFreq = this.C0 * Math.pow(2, roundNum / 12);
    const cents = 1200 * Math.log2(freq / idealFreq);
    return { note, octave: oct, cents, noteNum: roundNum, frequency: freq };
  }

  noteToNoteNum(note) {
    const name = note.replace(/[0-9]/g, "");
    const oct = parseInt(note.slice(-1));
    const index = this.noteStrings.indexOf(name);
    return index === -1 ? null : 12 * oct + index;
  }

  noteNumToNote(num) {
    const oct = Math.floor(num / 12);
    const name = this.noteStrings[num % 12];
    return name + oct;
  }
}

window.VoiceEngine = VoiceEngine;
// --- END OF FILE js/VoiceEngine.js ---
