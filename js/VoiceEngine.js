// --- START OF FILE js/VoiceEngine.js ---

class VoiceEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.dataArray = null;
    this.dummyGainNode = null;
    this.isListening = false;

    // Константы
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

  /**
   * Инициализирует AudioContext.
   * Желательно вызывать по клику пользователя.
   */
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

  /**
   * Запрашивает доступ к микрофону и начинает анализ.
   */
  async startListening() {
    this.initAudioContext();
    if (this.isListening || !this.audioContext) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.dataArray = new Float32Array(this.analyser.fftSize);
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.dummyGainNode);
      this.isListening = true;
    } catch (err) {
      console.error("Microphone access error:", err);
      throw err;
    }
  }

  /**
   * Останавливает прослушивание и освобождает ресурсы микрофона.
   */
  stopListening() {
    if (!this.isListening || !this.sourceNode) return;
    this.sourceNode.mediaStream.getTracks().forEach((track) => track.stop());
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isListening = false;
  }

  /**
   * Основной метод получения текущей ноты.
   * Возвращает объект с данными о ноте или null, если тишина/не распознано.
   */
  getPitch() {
    if (!this.isListening || !this.analyser) return null;

    this.analyser.getFloatTimeDomainData(this.dataArray);

    // 1. Проверка громкости (RMS)
    let rms = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      rms += this.dataArray[i] * this.dataArray[i];
    }
    rms = Math.sqrt(rms / this.dataArray.length);

    if (rms < this.rmsThreshold) return null;

    // 2. Алгоритм YIN
    const pitchInHz = this._yin(this.dataArray, this.audioContext.sampleRate);

    if (!pitchInHz) return null;

    // 3. Конвертация в ноту
    return this.frequencyToNoteDetails(pitchInHz);
  }

  /**
   * Внутренний алгоритм YIN (приватный метод по сути)
   */
  _yin(buffer, sampleRate) {
    const threshold = 0.12;
    const bufferSize = buffer.length;
    const yinBufferSize = bufferSize / 2;
    const yinBuffer = new Float32Array(yinBufferSize);
    let tauEstimate = -1;
    let pitchInHz = null; // Изменено с -1 на null для стандарта

    // Шаг 2: Разностная функция
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

    // Шаг 3: Абсолютный порог
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

    // Шаг 4: Параболическая интерполяция (если порог не сработал, ищем глобальный минимум)
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

    return pitchInHz > 50 && pitchInHz < 3000 ? pitchInHz : null;
  }

  // --- Утилиты (доступны извне, так как нужны для UI) ---

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

// Экспортируем в глобальную область видимости
window.VoiceEngine = VoiceEngine;
