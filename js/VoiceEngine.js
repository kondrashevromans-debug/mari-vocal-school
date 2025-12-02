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

  stopListening() {
    if (!this.isListening || !this.sourceNode) return;
    this.sourceNode.mediaStream.getTracks().forEach((track) => track.stop());
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isListening = false;
  }

  getPitch() {
    if (!this.isListening || !this.analyser) return null;

    this.analyser.getFloatTimeDomainData(this.dataArray);

    let rms = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      rms += this.dataArray[i] * this.dataArray[i];
    }
    rms = Math.sqrt(rms / this.dataArray.length);

    if (rms < this.rmsThreshold) return null;

    // Используем новый, более точный алгоритм MPM
    const pitchInHz = this._mpm(this.dataArray, this.audioContext.sampleRate);

    if (!pitchInHz) return null;

    return this.frequencyToNoteDetails(pitchInHz);
  }

  /**
   * Алгоритм MPM (McLeod Pitch Method) для определения высоты тона.
   * Более устойчив к октавным ошибкам, чем YIN.
   */
  _mpm(buffer, sampleRate) {
    const K = 0.9;
    const bufferSize = buffer.length;
    const nsdf = new Float32Array(bufferSize);

    // 1. Автокорреляция с использованием NSDF
    let acf = 0;
    let m = 0;
    for (let tau = 0; tau < bufferSize; tau++) {
      acf = 0;
      m = 0;
      for (let i = 0; i < bufferSize - tau; i++) {
        acf += buffer[i] * buffer[i + tau];
        m += buffer[i] * buffer[i] + buffer[i + tau] * buffer[i + tau];
      }
      nsdf[tau] = (2 * acf) / (m || 1);
    }

    // 2. Поиск пиков (локальных максимумов)
    const maxPositions = [];
    let maxVal = -Infinity;
    for (let i = 1; i < nsdf.length - 1; i++) {
      if (nsdf[i] > maxVal) {
        maxVal = nsdf[i];
      }
      if (nsdf[i] > nsdf[i - 1] && nsdf[i] > nsdf[i + 1]) {
        maxPositions.push(i);
      }
    }
    if (maxPositions.length === 0) return null;

    // 3. Выбор лучшего пика
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

    // 4. Параболическая интерполяция
    let pitchInHz = null;
    if (tauEstimate > 0 && tauEstimate < nsdf.length - 1) {
      const y1 = nsdf[tauEstimate - 1];
      const y2 = nsdf[tauEstimate];
      const y3 = nsdf[tauEstimate + 1];
      const denominator = 2 * (2 * y2 - y3 - y1);
      if (denominator !== 0) {
        const betterTau = tauEstimate + (y1 - y3) / denominator;
        pitchInHz = sampleRate / betterTau;
      } else {
        pitchInHz = sampleRate / tauEstimate;
      }
    }

    // 5. Фильтрация
    return pitchInHz > 50 && pitchInHz < 3000 ? pitchInHz : null;
  }

  // --- Утилиты (остаются без изменений) ---

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
