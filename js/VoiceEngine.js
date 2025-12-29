// --- START OF FILE VoiceEngine.js ---

class VoiceEngine {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.dummyGainNode = null;
    this.isListening = false;

    this.analyserWide = null;
    this.analyserNarrow = null;
    this.lowPassFilter = null;

    this.timeDomainDataArray = null;
    this.frequencyDataArrayNarrow = null;
    this.frequencyDataArrayWide = null;
    this.wideTimeDomainDataArray = null;

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

    this.f0MinHz = 70;
    this.f0MaxHz = 350;
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

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);

    this.lowPassFilter = this.audioContext.createBiquadFilter();
    this.lowPassFilter.type = "lowpass";
    this.lowPassFilter.Q.setValueAtTime(0.707, this.audioContext.currentTime);
    this.lowPassFilter.frequency.setValueAtTime(
      2000,
      this.audioContext.currentTime
    );

    this.analyserWide = this.audioContext.createAnalyser();
    this.analyserWide.fftSize = this.fftSize;
    this.frequencyDataArrayWide = new Float32Array(
      this.analyserWide.frequencyBinCount
    );
    this.wideTimeDomainDataArray = new Float32Array(this.analyserWide.fftSize);

    this.analyserNarrow = this.audioContext.createAnalyser();
    this.analyserNarrow.fftSize = this.fftSize;
    this.timeDomainDataArray = new Float32Array(this.analyserNarrow.fftSize);
    this.frequencyDataArrayNarrow = new Float32Array(
      this.analyserNarrow.frequencyBinCount
    );

    this.sourceNode.connect(this.analyserWide);
    this.analyserWide.connect(this.dummyGainNode);

    this.sourceNode.connect(this.lowPassFilter);
    this.lowPassFilter.connect(this.analyserNarrow);
    this.analyserNarrow.connect(this.dummyGainNode);

    this.isListening = true;
  }

  stopListening() {
    if (!this.isListening || !this.sourceNode) return;
    this.sourceNode.mediaStream.getTracks().forEach((t) => t.stop());
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isListening = false;
  }

  getPitch() {
    if (!this.isListening || !this.analyserNarrow) return null;

    // wide
    this.analyserWide.getFloatFrequencyData(this.frequencyDataArrayWide);
    this.analyserWide.getFloatTimeDomainData(this.wideTimeDomainDataArray);

    let rms = 0;
    for (let i = 0; i < this.wideTimeDomainDataArray.length; i++) {
      const v = this.wideTimeDomainDataArray[i];
      rms += v * v;
    }
    rms = Math.sqrt(rms / this.wideTimeDomainDataArray.length);
    if (rms < this.rmsThreshold) return { mpm: null, hps: null };

    const f0Estimate = this._estimateF0ByHarmonicSum(
      this.frequencyDataArrayWide,
      this.audioContext.sampleRate,
      this.f0MinHz,
      this.f0MaxHz
    );

    let targetFilterFreq = 2000;
    if (f0Estimate && f0Estimate > 0) {
      targetFilterFreq = this._clamp(f0Estimate * 4.5, 500, 2500);
    }

    this.lowPassFilter.frequency.setTargetAtTime(
      targetFilterFreq,
      this.audioContext.currentTime,
      0.03
    );

    // narrow
    this.analyserNarrow.getFloatTimeDomainData(this.timeDomainDataArray);
    this.analyserNarrow.getFloatFrequencyData(this.frequencyDataArrayNarrow);

    // IMPORTANT: разрешение на октавный downshift — по wide спектру
    const allowOctaveDown = this._isMissingFundamentalLikely(
      this.frequencyDataArrayWide,
      this.audioContext.sampleRate,
      f0Estimate
    );

    const mpmPitch = this._mpm(
      this.timeDomainDataArray,
      this.audioContext.sampleRate,
      allowOctaveDown
    );
    const hpsPitch = this._hps(
      this.frequencyDataArrayNarrow,
      this.audioContext.sampleRate
    ); // без деления на 2

    return { mpm: mpmPitch, hps: hpsPitch };
  }

  _estimateF0ByHarmonicSum(spectrumDb, sampleRate, fMin = 70, fMax = 350) {
    const binHz = sampleRate / this.fftSize;
    const toIndex = (freq) => Math.round(freq / binHz);
    const maxFreq = (spectrumDb.length - 1) * binHz;
    fMin = Math.max(40, Math.min(fMin, maxFreq));
    fMax = Math.max(fMin, Math.min(fMax, maxFreq));

    const harmonics = 6;
    const stepHz = 1;

    const magAt = (idx) => {
      if (idx < 0 || idx >= spectrumDb.length) return 0;
      return Math.pow(10, spectrumDb[idx] / 10);
    };

    let bestF0 = 0;
    let bestScore = -Infinity;

    for (let f0 = fMin; f0 <= fMax; f0 += stepHz) {
      let score = 0;
      for (let k = 1; k <= harmonics; k++) {
        const idx = toIndex(k * f0);
        if (idx >= spectrumDb.length) break;
        score += magAt(idx) * (1 / k);
      }
      if (score > bestScore) {
        bestScore = score;
        bestF0 = f0;
      }
    }
    return bestF0 || 0;
  }

  // Разрешаем downshift только если 2*f0 явно сильнее f0 (missing fundamental)
  _isMissingFundamentalLikely(spectrumDb, sampleRate, f0) {
    if (!f0 || f0 < 70 || f0 > 350) return false;

    const binHz = sampleRate / this.fftSize;
    const idx1 = Math.round(f0 / binHz);
    const idx2 = Math.round((2 * f0) / binHz);

    if (idx2 <= 0 || idx2 >= spectrumDb.length) return false;

    const mag1 = Math.pow(10, (spectrumDb[idx1] ?? -120) / 10);
    const mag2 = Math.pow(10, (spectrumDb[idx2] ?? -120) / 10);

    // если 2-я гармоника заметно сильнее фундамента — да, missing fundamental вероятен
    return mag2 > 1.8 * mag1; // можно 1.5..2.5 под микрофон
  }

  _mpm(buffer, sampleRate, allowOctaveDown) {
    const K = 0.8;
    const bufferSize = buffer.length;
    const nsdf = new Float32Array(bufferSize);

    for (let tau = 0; tau < bufferSize; tau++) {
      let acf = 0,
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
      if (nsdf[i] > nsdf[i - 1] && nsdf[i] > nsdf[i + 1]) maxPositions.push(i);
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
      let best = -Infinity;
      for (const pos of maxPositions) {
        if (nsdf[pos] > best) {
          best = nsdf[pos];
          tauEstimate = pos;
        }
      }
    }

    // OK: строгий downshift ТОЛЬКО если allowOctaveDown=true (missing fundamental)
    if (allowOctaveDown && tauEstimate > 0) {
      const tau2 = tauEstimate * 2;
      if (tau2 > 1 && tau2 < nsdf.length - 2) {
        const v1 = nsdf[tauEstimate];
        const v2 = nsdf[tau2];

        const tau2IsLocalPeak =
          nsdf[tau2] > nsdf[tau2 - 1] && nsdf[tau2] > nsdf[tau2 + 1];
        const v2HighEnough = v2 >= 0.8; // строже, чтобы не ронять B3 -> B2
        const v2CloseToV1 = v2 >= 0.95 * v1;

        if (tau2IsLocalPeak && v2HighEnough && v2CloseToV1) {
          tauEstimate = tau2;
        }
      }
    }

    // parabola
    let pitchInHz = null;
    if (tauEstimate > 0 && tauEstimate < nsdf.length - 1) {
      const y1 = nsdf[tauEstimate - 1],
        y2 = nsdf[tauEstimate],
        y3 = nsdf[tauEstimate + 1];
      const denom = 2 * (2 * y2 - y3 - y1);
      if (denom !== 0) {
        const betterTau = tauEstimate + (y1 - y3) / denom;
        pitchInHz = sampleRate / betterTau;
      } else {
        pitchInHz = sampleRate / tauEstimate;
      }
    }

    return pitchInHz > 60 && pitchInHz < 2000 ? pitchInHz : null;
  }

  // HPS без деления на 2 (чтобы не прыгал вниз)
  _hps(spectrumDb, sampleRate) {
    const n = spectrumDb.length;
    const binHz = sampleRate / this.fftSize;

    const mag = new Float32Array(n);
    for (let i = 0; i < n; i++) mag[i] = Math.pow(10, spectrumDb[i] / 10);

    const result = new Float32Array(mag);
    const harmonics = 4;
    for (let i = 0; i < result.length; i++) {
      for (let j = 2; j <= harmonics; j++) {
        const idx = i * j;
        if (idx < result.length) result[i] *= mag[idx];
        else {
          result[i] = 0;
          break;
        }
      }
    }

    let maxVal = -1,
      maxIndex = -1;
    const minIndex = Math.round(60 / binHz);
    const maxIndexLimit = Math.round(2000 / binHz);

    for (let i = minIndex; i < Math.min(maxIndexLimit, result.length); i++) {
      if (result[i] > maxVal) {
        maxVal = result[i];
        maxIndex = i;
      }
    }
    if (maxIndex === -1) return null;

    return maxIndex * binHz;
  }

  _clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

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

// --- END OF FILE VoiceEngine.js ---
