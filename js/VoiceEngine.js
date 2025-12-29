// --- START OF FILE js/VoiceEngine.js ---

class VoiceEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.dummyGainNode = null;
    this.isListening = false;

    // Массивы для данных
    this.timeDomainDataArray = null; // Для MPM (временная область)
    this.frequencyDataArray = null; // Для HPS (частотная область)

    // Константы
    this.fftSize = 4096; // Увеличим для лучшего разрешения по частоте, что важно для HPS
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
    this.rmsThreshold = 0.025; // Порог громкости
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

      // 1. Фильтр низких частот для ослабления обертонов
      const lowPassFilter = this.audioContext.createBiquadFilter();
      lowPassFilter.type = "lowpass";
      // Устанавливаем более агрессивное значение для отсечения гармоник
      lowPassFilter.frequency.setValueAtTime(
        1200,
        this.audioContext.currentTime
      );

      // 2. Анализатор
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.fftSize;

      // Инициализируем ОБА массива для данных
      this.timeDomainDataArray = new Float32Array(this.analyser.fftSize);
      this.frequencyDataArray = new Float32Array(
        this.analyser.frequencyBinCount
      );

      // 3. Источник звука
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // 4. Собираем цепочку обработки звука:
      // Микрофон -> Фильтр -> Анализатор -> "Тихий" выход
      this.sourceNode.connect(lowPassFilter);
      lowPassFilter.connect(this.analyser);
      this.analyser.connect(this.dummyGainNode);

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
   * Получает оценки высоты тона от двух разных алгоритмов.
   * @returns {{mpm: number|null, hps: number|null}} - Объект с результатами от MPM и HPS.
   */
  getPitch() {
    if (!this.isListening || !this.analyser) return null;

    // Получаем данные для обоих алгоритмов
    this.analyser.getFloatTimeDomainData(this.timeDomainDataArray);
    this.analyser.getFloatFrequencyData(this.frequencyDataArray);

    // Проверка громкости
    let rms = 0;
    for (let i = 0; i < this.timeDomainDataArray.length; i++) {
      rms += this.timeDomainDataArray[i] * this.timeDomainDataArray[i];
    }
    rms = Math.sqrt(rms / this.timeDomainDataArray.length);

    if (rms < this.rmsThreshold) return { mpm: null, hps: null };

    // Запускаем оба детектора
    const mpmPitch = this._mpm(
      this.timeDomainDataArray,
      this.audioContext.sampleRate
    );
    const hpsPitch = this._hps(
      this.frequencyDataArray,
      this.audioContext.sampleRate
    );

    return { mpm: mpmPitch, hps: hpsPitch };
  }

  /**
   * Алгоритм MPM (McLeod Pitch Method) для определения высоты тона.
   * Точен в определении центов.
   */
  _mpm(buffer, sampleRate) {
    const K = 0.8; // Более строгий порог для уменьшения ошибок
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

  /**
   * Алгоритм HPS (Harmonic Product Spectrum).
   * Устойчив к октавным ошибкам.
   */
  _hps(spectrum, sampleRate) {
    const result = new Float32Array(spectrum.length);

    // 1. Копируем спектр и конвертируем из dB в линейную шкалу мощности
    for (let i = 0; i < spectrum.length; i++) {
      result[i] = Math.pow(10, spectrum[i] / 10);
    }

    // 2. Перемножаем спектр с его сжатыми версиями (гармониками)
    const harmonics = 4; // Количество гармоник для проверки
    for (let i = 0; i < result.length; i++) {
      for (let j = 2; j <= harmonics; j++) {
        if (i * j < result.length) {
          result[i] *= result[i * j];
        } else {
          result[i] = 0; // Обнуляем, если не хватает данных для гармоники
        }
      }
    }

    // 3. Находим пик в результирующем спектре
    let maxVal = -1;
    let maxIndex = -1;
    const minIndex = Math.round((60 * this.fftSize) / sampleRate); // Начинаем поиск с 60 Гц
    const maxIndexLimit = Math.round((2000 * this.fftSize) / sampleRate); // Ограничиваем поиск 2000 Гц

    for (let i = minIndex; i < maxIndexLimit; i++) {
      if (result[i] > maxVal) {
        maxVal = result[i];
        maxIndex = i;
      }
    }

    if (maxIndex === -1) return null;

    // 4. Конвертируем индекс в частоту
    const pitchInHz = maxIndex * (sampleRate / this.fftSize);
    return pitchInHz;
  }

  // --- Утилиты (остаются без изменений, используются в tuner.js) ---

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
