// 8Beat Chiptune Studio - Core App & Audio Engine

// Utility helpers
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const NOTE_INDEX = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_MAP = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  F: 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11
};

function noteToFreq(note) {
  const A4 = 440;
  const m = (note || '').toString().match(/^([A-G](?:#|b)?)(-?\d+)$/i);
  if (!m) return 440;
  const p = m[1].toUpperCase();
  const o = parseInt(m[2], 10);
  const semitone = NOTE_MAP[p];
  if (!isFinite(semitone)) return 440;
  const n = semitone + (o - 4) * 12;
  return A4 * Math.pow(2, (n - 9) / 12);
}

function noteToMidi(note) {
  const m = (note || '').toString().match(/^([A-G](?:#|b)?)(-?\d+)$/i);
  if (!m) return 60;
  const pitch = m[1].toUpperCase();
  const octave = parseInt(m[2], 10);
  const semitone = NOTE_MAP[pitch];
  const base = isFinite(semitone) ? semitone : NOTE_INDEX.indexOf(pitch.replace('B', '#'));
  const idx = base >= 0 ? base : 0;
  return idx + (octave + 1) * 12;
}

function midiToNoteName(midi) {
  const idx = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_INDEX[idx]}${octave}`;
}

const SCALE_MODES = {
  major:       [2, 2, 1, 2, 2, 2, 1],
  minor:       [2, 1, 2, 2, 1, 2, 2],
  dorian:      [2, 1, 2, 2, 2, 1, 2],
  mixolydian:  [2, 2, 1, 2, 2, 1, 2],
  lydian:      [2, 2, 2, 1, 2, 2, 1],
  phrygian:    [1, 2, 2, 2, 1, 2, 2],
  harmonic:    [2, 1, 2, 2, 1, 3, 1],
  pentatonic:  [2, 2, 3, 2, 3],
  chip:        [2, 1, 4, 1, 4]
};

function generateScale(root, mode, { startOctave = 2, octaves = 4 } = {}) {
  const intervals = SCALE_MODES[mode] || SCALE_MODES.minor;
  const rootIndex = NOTE_INDEX.indexOf(root.toUpperCase());
  const notes = [];
  if (rootIndex < 0) return notes;

  let midi = (startOctave + 1) * 12 + rootIndex;
  const steps = intervals.length;
  for (let o = 0; o < octaves; o++) {
    for (let i = 0; i < steps; i++) {
      const label = midiToNoteName(midi);
      notes.push({ label, freq: noteToFreq(label) });
      midi += intervals[i % steps];
    }
  }

  const finalLabel = midiToNoteName(midi);
  notes.push({ label: finalLabel, freq: noteToFreq(finalLabel) });
  return notes;
}


class ChipEngine {
  constructor() {
    this.ac = null;
    this.master = null;
    this.limit = null;
    this.metGain = null;
    this.mediaDest = null;
    this.drive = null;
    this.driveGain = null;
    this.delay = null;
    this.delayMix = null;
    this.delayFb = null;
    this.out = null;
  }

  ensure() {
    if (this.ac) return;

    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      console.warn('WebAudio not supported');
      return;
    }

    const ac = new Ctor({ latencyHint: 'interactive' });
    const limit = ac.createDynamicsCompressor();
    limit.threshold.value = -6;
    limit.knee.value = 30;
    limit.ratio.value = 12;
    limit.attack.value = 0.003;
    limit.release.value = 0.25;

    const master = ac.createGain();
    master.gain.value = 0.92;

    const drive = ac.createWaveShaper();
    const driveGain = ac.createGain();
    driveGain.gain.value = 0.25;
    drive.curve = ChipEngine.makeDriveCurve(0.25);

    const delay = ac.createDelay(1.0);
    delay.delayTime.value = 0.25;
    const delayFb = ac.createGain();
    delayFb.gain.value = 0.25;
    const delayMix = ac.createGain();
    delayMix.gain.value = 0.15;

    master.connect(driveGain).connect(drive);
    drive.connect(limit);
    drive.connect(delay);
    delay.connect(delayFb).connect(delay);
    delay.connect(delayMix).connect(limit);

    const out = ac.createGain();
    out.gain.value = 1.0;

    limit.connect(out).connect(ac.destination);

    const metGain = ac.createGain();
    metGain.gain.value = 0.0;
    metGain.connect(limit);

    const mediaDest = ac.createMediaStreamDestination();
    out.connect(mediaDest);

    this.ac = ac;
    this.limit = limit;
    this.master = master;
    this.metGain = metGain;
    this.drive = drive;
    this.driveGain = driveGain;
    this.delay = delay;
    this.delayMix = delayMix;
    this.delayFb = delayFb;
    this.out = out;
    this.mediaDest = mediaDest;
  }

  async resume() {
    this.ensure();
    if (!this.ac) return;
    if (this.ac.state !== 'running') {
      try {
        await this.ac.resume();
      } catch (err) {
        console.warn('AudioContext resume failed', err);
      }
    }
  }

  currentTime() {
    this.ensure();
    return this.ac ? this.ac.currentTime : 0;
  }

  static makeDriveCurve(amount) {
    const k = Math.max(0.0001, amount) * 100;
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; ++i) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  static pulseWave(ac, duty) {
    const amt = clamp(duty, 0.05, 0.95);
    const key = amt.toFixed(3);
    if (!ChipEngine._pulseCache) {
      ChipEngine._pulseCache = new Map();
    }
    if (ChipEngine._pulseCache.has(key)) {
      return ChipEngine._pulseCache.get(key);
    }
    const harmonics = 32;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let n = 1; n < harmonics; n++) {
      const theta = n * Math.PI * amt;
      imag[n] = (2 / (n * Math.PI)) * Math.sin(theta);
      real[n] = 0;
    }
    const wave = ac.createPeriodicWave(real, imag, { disableNormalization: false });
    ChipEngine._pulseCache.set(key, wave);
    return wave;
  }

  static resolveArpSequence(notes, steps, pattern) {
    const pool = Array.isArray(notes) ? notes.filter(Boolean) : [];
    if (!pool.length) return [];
    const target = Math.max(1, steps || pool.length);
    const sequence = [];
    const append = (arr) => {
      for (const note of arr) {
        if (sequence.length >= target) break;
        sequence.push(note);
      }
    };

    switch (pattern) {
      case 'down':
        append(pool.slice().reverse());
        break;
      case 'bounce':
      case 'updown': {
        const asc = pool.slice();
        const desc = pool.slice(0, -1).reverse();
        const combined = asc.concat(desc);
        while (sequence.length < target) {
          append(combined);
        }
        break;
      }
      case 'random':
        while (sequence.length < target) {
          const idx = Math.floor(Math.random() * pool.length);
          sequence.push(pool[idx]);
        }
        break;
      case 'chord':
        append(pool);
        break;
      default:
        append(pool);
        break;
    }

    while (sequence.length < target) {
      append(pool);
    }
    return sequence.slice(0, target);
  }

  setDrive(amount) {
    this.ensure();
    if (!this.ac) return;
    this.driveGain.gain.value = clamp(amount, 0, 1);
    this.drive.curve = ChipEngine.makeDriveCurve(this.driveGain.gain.value);
  }

  setDelayMix(amount) {
    this.ensure();
    if (!this.ac) return;
    this.delayMix.gain.value = clamp(amount, 0, 1);
  }

  setDelayTime(seconds) {
    this.ensure();
    if (!this.ac) return;
    this.delay.delayTime.value = clamp(seconds, 0, 1);
  }

  setDelayFeedback(amount) {
    this.ensure();
    if (!this.ac) return;
    this.delayFb.gain.value = clamp(amount, 0, 0.95);
  }

  createRecorder() {
    this.ensure();
    if (!this.ac || !this.mediaDest) return null;
    try {
      const stream = this.mediaDest.stream;
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      return rec;
    } catch (err) {
      console.warn('MediaRecorder unsupported or blocked', err);
      return null;
    }
  }

  async decodeSample(arrayBuffer) {
    this.ensure();
    if (!this.ac) return null;
    try {
      return await this.ac.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn('decodeAudioData failed', err);
      return null;
    }
  }

  playSample({ time, buffer, gain = 1.0, playbackRate = 1.0 }) {
    this.ensure();
    if (!this.ac || !buffer) return;
    const t0 = isFinite(time) ? time : this.ac.currentTime;
    const src = this.ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = clamp(playbackRate, 0.25, 4);
    const vca = this.ac.createGain();
    vca.gain.value = clamp(gain, 0, 1);
    src.connect(vca).connect(this.master);
    src.start(t0);
  }

  playSine808({ time, baseFreq = 55, pitchDecay = 0.03, duration = 0.7, gain = 0.95, attack = 0.001, decay = 0.12, sustain = 0.0, release = 0.3 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(20, baseFreq * 8), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, baseFreq), t0 + clamp(pitchDecay, 0.001, 1));

    const vca = ac.createGain();
    vca.gain.value = 0;
    osc.connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0003, 0.2);
    const D = clamp(decay, 0.01, 1);
    const S = clamp(sustain, 0, 1);
    const R = clamp(release, 0.01, 2);
    const tEnd = t0 + clamp(duration, 0.05, 4) + R;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain, 0, 1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain, 0, 1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration, 0.05, 4), R / 3);

    osc.start(t0);
    osc.stop(tEnd);
  }

  playSquare({ time, freq, duration = 0.25, gain = 0.6, attack = 0.002, decay = 0.08, sustain = 0.25, release = 0.08, filterHz = 12000 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.value = isFinite(freq) ? freq : 440;

    const vca = ac.createGain();
    vca.gain.value = 0;

    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = isFinite(filterHz) ? filterHz : 12000;
    filt.Q.value = 0.6;

    osc.connect(filt).connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0005, 1);
    const D = clamp(decay, 0.001, 2);
    const S = clamp(sustain, 0, 1);
    const R = clamp(release, 0.001, 2);
    const tEnd = t0 + clamp(duration, 0.01, 5) + R;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain, 0, 1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain, 0, 1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration, 0.01, 5), R / 3);

    osc.start(t0);
    osc.stop(tEnd);
  }

  playTriangle({ time, freq, duration = 0.3, gain = 0.55, attack = 0.003, decay = 0.06, sustain = 0.3, release = 0.1, filterHz = 8000 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = isFinite(freq) ? freq : 440;

    const vca = ac.createGain();
    vca.gain.value = 0;

    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = isFinite(filterHz) ? filterHz : 8000;
    filt.Q.value = 0.5;

    osc.connect(filt).connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0005, 1);
    const D = clamp(decay, 0.001, 2);
    const S = clamp(sustain, 0, 1);
    const R = clamp(release, 0.001, 2);
    const tEnd = t0 + clamp(duration, 0.01, 5) + R;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain, 0, 1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain, 0, 1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration, 0.01, 5), R / 3);

    osc.start(t0);
    osc.stop(tEnd);
  }

  playNoise({ time, duration = 0.18, gain = 0.55, attack = 0.001, decay = 0.06, sustain = 0.2, release = 0.05, type = 'white', hp = 200, lp = 8000 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;

    const length = Math.max(1, Math.floor(ac.sampleRate * clamp(duration, 0.01, 2) * 2));
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let pink = 0;
    for (let i = 0; i < length; i++) {
      let v = Math.random() * 2 - 1;
      if (type === 'pink') {
        pink = 0.98 * pink + 0.02 * v;
        v = pink;
      }
      data[i] = v;
    }

    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = false;

    const vca = ac.createGain();
    vca.gain.value = 0;

    const hpF = ac.createBiquadFilter();
    hpF.type = 'highpass';
    hpF.frequency.value = clamp(hp, 20, 16000);

    const lpF = ac.createBiquadFilter();
    lpF.type = 'lowpass';
    lpF.frequency.value = clamp(lp, 200, 20000);

    src.connect(hpF).connect(lpF).connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0003, 1);
    const D = clamp(decay, 0.001, 2);
    const S = clamp(sustain, 0, 1);
    const R = clamp(release, 0.001, 2);
    const tEnd = t0 + clamp(duration, 0.01, 5) + R;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain, 0, 1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain, 0, 1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration, 0.01, 5), R / 3);

    src.start(t0);
    src.stop(tEnd);
  }

  playPulse({ time, freq, dutyCycle = 0.5, duration = 0.25, gain = 0.6, attack = 0.0015, decay = 0.08, sustain = 0.25, release = 0.08, filterHz = 12000 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;

    const osc = ac.createOscillator();
    const wave = ChipEngine.pulseWave(ac, dutyCycle);
    if (wave) osc.setPeriodicWave(wave);
    else osc.type = 'square';
    osc.frequency.value = isFinite(freq) ? freq : 440;

    const vca = ac.createGain();
    vca.gain.value = 0;

    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = isFinite(filterHz) ? filterHz : 12000;
    filt.Q.value = 0.7;

    osc.connect(filt).connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0005, 1);
    const D = clamp(decay, 0.001, 2);
    const S = clamp(sustain, 0, 1);
    const R = clamp(release, 0.001, 2);
    const tEnd = t0 + clamp(duration, 0.01, 5) + R;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain, 0, 1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain, 0, 1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration, 0.01, 5), R / 3);

    osc.start(t0);
    osc.stop(tEnd);
  }

  playArp({ time, bpm = 120, notes = [], pattern = 'up', steps = 4, subdivision = 4, waveform = 'pulse', dutyCycle = 0.4, params = {}, gain = 0.55 }) {
    this.ensure();
    if (!this.ac) return;
    const sequence = ChipEngine.resolveArpSequence(notes, steps, pattern);
    if (!sequence.length) return;
    const ac = this.ac;
    const stepDur = 60 / Math.max(1, bpm) / Math.max(1, subdivision);
    const baseTime = isFinite(time) ? time : ac.currentTime;

    sequence.forEach((note, idx) => {
      const playTime = baseTime + idx * stepDur;
      const payload = { time: playTime, freq: note.freq, dutyCycle, ...(params || {}), gain };
      switch (waveform) {
        case 'triangle':
          this.playTriangle(payload);
          break;
        case 'square':
          this.playSquare(payload);
          break;
        default:
          this.playPulse(payload);
          break;
      }
    });
  }

  playFx(name, { time } = {}) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;
    switch (name) {
      case 'laser': {
        const osc = ac.createOscillator();
        const wave = ChipEngine.pulseWave(ac, 0.2);
        if (wave) osc.setPeriodicWave(wave); else osc.type = 'square';
        const vca = ac.createGain();
        vca.gain.value = 0;
        osc.frequency.setValueAtTime(1600, t0);
        osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.55);
        vca.gain.setValueAtTime(0, t0);
        vca.gain.linearRampToValueAtTime(0.8, t0 + 0.02);
        vca.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
        osc.connect(vca).connect(this.master);
        osc.start(t0);
        osc.stop(t0 + 0.6);
        break;
      }
      case 'power': {
        const osc = ac.createOscillator();
        const wave = ChipEngine.pulseWave(ac, 0.35);
        if (wave) osc.setPeriodicWave(wave); else osc.type = 'square';
        const vca = ac.createGain();
        vca.gain.value = 0;
        osc.frequency.setValueAtTime(220, t0);
        osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.35);
        vca.gain.setValueAtTime(0, t0);
        vca.gain.linearRampToValueAtTime(0.7, t0 + 0.03);
        vca.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
        osc.connect(vca).connect(this.master);
        osc.start(t0);
        osc.stop(t0 + 0.45);
        break;
      }
      case 'hit': {
        this.playTriangle({ time: t0, freq: 660, duration: 0.18, gain: 0.6, attack: 0.0008, decay: 0.06, sustain: 0.0, release: 0.12, filterHz: 9000 });
        break;
      }
      case 'explosion': {
        this.playNoise({ time: t0, duration: 0.6, gain: 0.75, attack: 0.002, decay: 0.35, sustain: 0.1, release: 0.25, type: 'pink', hp: 80, lp: 2000 });
        break;
      }
      case 'coin': {
        this.playPulse({ time: t0, freq: 1200, dutyCycle: 0.5, duration: 0.18, gain: 0.55, attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.12, filterHz: 8000 });
        this.playPulse({ time: t0 + 0.12, freq: 1800, dutyCycle: 0.3, duration: 0.12, gain: 0.45, attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.1, filterHz: 9000 });
        break;
      }
      default:
        this.playNoise({ time: t0, duration: 0.2, gain: 0.4, attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.08, type: 'white', hp: 500, lp: 6000 });
        break;
    }
  }

  tick(time, strong = false) {
    this.ensure();
    if (!this.ac || !this.metGain) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;
    const osc = ac.createOscillator();
    const vca = ac.createGain();
    vca.gain.value = 0;
    osc.type = 'square';
    osc.frequency.value = strong ? 1600 : 1100;
    osc.connect(vca).connect(this.metGain);

    const g = vca.gain;
    const A = 0.001;
    const D = 0.05;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(strong ? 0.08 : 0.05, t0 + A);
    g.linearRampToValueAtTime(0, t0 + A + D);

    osc.start(t0);
    osc.stop(t0 + 0.08);
  }
}

ChipEngine._pulseCache = new Map();


const KEY_POOL = ['Q','W','E','R','T','Y','U','I','O','P','A','S','D','F','G','H','J','K','L','Z','X','C','V','B','N','M','1','2','3','4','5','6','7','8','9','0'];
const DEFAULT_ROOT = 'C';
const DEFAULT_MODE = 'minor';

const trackLibrary = [
  {
    id: 'pulseLead',
    name: 'Pulse Lead',
    category: 'Melody',
    type: 'melody',
    waveform: 'pulse',
    dutyCycle: 0.25,
    color: '#ff6b9d',
    key: 'Q',
    params: { attack: 0.0015, decay: 0.09, sustain: 0.25, release: 0.16, duration: 0.42, gain: 0.7, filterHz: 10500 },
    noteOffset: 6,
    noteSpan: 14,
    previewNote: 4,
    volume: 0.85
  },
  {
    id: 'chipBass',
    name: 'Chip Bass',
    category: 'Bass',
    type: 'melody',
    waveform: 'pulse',
    dutyCycle: 0.12,
    color: '#00ff88',
    key: 'W',
    params: { attack: 0.002, decay: 0.12, sustain: 0.12, release: 0.09, duration: 0.34, gain: 0.9, filterHz: 4200 },
    noteOffset: 2,
    noteSpan: 8,
    previewNote: 2,
    volume: 0.95
  },
  {
    id: 'trianglePad',
    name: 'Triangle Pad',
    category: 'Harmony',
    type: 'melody',
    waveform: 'triangle',
    color: '#00ccff',
    key: 'E',
    params: { attack: 0.01, decay: 0.32, sustain: 0.45, release: 0.45, duration: 0.7, gain: 0.62, filterHz: 7000 },
    noteOffset: 10,
    noteSpan: 16,
    previewNote: 6,
    volume: 0.75
  },
  {
    id: 'arpRunner',
    name: 'Arp Runner',
    category: 'Sequence',
    type: 'arpeggio',
    waveform: 'pulse',
    dutyCycle: 0.4,
    color: '#ffaa00',
    key: 'R',
    params: { attack: 0.001, decay: 0.07, sustain: 0.1, release: 0.12, duration: 0.3, gain: 0.65, filterHz: 9000 },
    noteOffset: 6,
    noteSpan: 12,
    previewNote: 3,
    arpPattern: 'updown',
    arpSubdivision: 4,
    arpSpan: 4,
    volume: 0.8
  },
  {
    id: 'chipKick',
    name: 'Chip Kick',
    category: 'Drums',
    type: 'drum',
    drumType: 'kick',
    color: '#ff4757',
    key: 'A',
    params: { baseFreq: 55, pitchDecay: 0.04, duration: 0.85, gain: 0.95 }
  },
  {
    id: 'chipSnare',
    name: 'Bit Snare',
    category: 'Drums',
    type: 'drum',
    drumType: 'snare',
    color: '#ffaa00',
    key: 'S',
    params: { hp: 1400, lp: 8000, duration: 0.19, decay: 0.08, sustain: 0.0, release: 0.05, gain: 0.75 }
  },
  {
    id: 'chipHat',
    name: 'Noise Hat',
    category: 'Drums',
    type: 'drum',
    drumType: 'hat',
    color: '#b8b8c8',
    key: 'D',
    params: { hp: 6000, lp: 14000, duration: 0.06, decay: 0.04, sustain: 0.0, release: 0.05, gain: 0.5 }
  },
  {
    id: 'chipPerc',
    name: 'Glitch Perc',
    category: 'Drums',
    type: 'drum',
    drumType: 'noise',
    color: '#7a5cff',
    key: 'F',
    params: { hp: 2000, lp: 9000, duration: 0.12, decay: 0.06, sustain: 0.1, release: 0.08, gain: 0.55 }
  },
  {
    id: 'samplePad',
    name: 'Sample Player',
    category: 'Texture',
    type: 'sample',
    color: '#ff85ff',
    key: 'G',
    params: { gain: 0.8 }
  }
];

const soundboardFx = [
  { id: 'laser', label: 'Laser', description: 'Descending pulse sweep', color: '#ff6b9d' },
  { id: 'power', label: 'Power Up', description: 'Ascending power chord', color: '#00ff88' },
  { id: 'hit', label: 'Impact', description: 'Short triangle stab', color: '#ffaa00' },
  { id: 'coin', label: 'Coin', description: 'Retro pickup sparkle', color: '#00ccff' },
  { id: 'explosion', label: 'Explosion', description: 'Noisy boom for boss fights', color: '#ff4757' }
];

const initialTrackOrder = ['pulseLead', 'chipBass', 'arpRunner', 'trianglePad', 'chipKick', 'chipSnare', 'chipHat', 'chipPerc'];

const state = {
  bpm: 120,
  steps: 16,
  swing: 0,
  playing: false,
  position: 0,
  scheduleAhead: 0.12,
  lookahead: 0.025,
  nextTime: 0,
  scale: {
    root: DEFAULT_ROOT,
    mode: DEFAULT_MODE,
    notes: generateScale(DEFAULT_ROOT, DEFAULT_MODE, { startOctave: 2, octaves: 4 })
  },
  tracks: [],
  soundboard: [],
  selectedTrackIndex: 0
};

let engine = null;
let schedulerId = null;
let mediaRecorder = null;
let recordedChunks = [];
let recStartTs = 0;
let recTimerId = null;
let trackCounter = 0;

function assignKey(preferred) {
  const used = new Set(state.tracks.map(t => t.key));
  if (preferred && !used.has(preferred)) return preferred;
  for (const key of KEY_POOL) {
    if (!used.has(key)) return key;
  }
  return '';
}

function cloneParams(params) {
  return params ? JSON.parse(JSON.stringify(params)) : {};
}

function getTrackScale(track) {
  const notes = state.scale.notes || [];
  if (!notes.length) return [];
  const span = Math.max(1, track.noteSpan || notes.length);
  const maxOffset = Math.max(0, notes.length - span);
  const offset = clamp(track.noteOffset || 0, 0, maxOffset);
  track.noteOffset = offset;
  const end = Math.min(notes.length, offset + span);
  return notes.slice(offset, end);
}

function setPreviewNote(track, slice) {
  if (!slice || !slice.length) {
    track.previewNoteIndex = 0;
    return;
  }
  const idx = clamp(track.previewNoteIndex ?? 0, 0, slice.length - 1);
  track.previewNoteIndex = idx;
}

function clampTrackToScale(track) {
  if (!track) return;
  if (track.type === 'drum' || track.type === 'sample') {
    track.steps = (track.steps || []).map(val => clamp(val || 0, 0, 3));
    return;
  }
  const slice = getTrackScale(track);
  if (!slice.length) {
    track.steps = new Array(state.steps).fill(null);
    track.previewNoteIndex = 0;
    return;
  }
  track.steps = (track.steps || []).map(step => {
    if (!step) return null;
    const noteIndex = clamp(step.noteIndex ?? 0, 0, slice.length - 1);
    const velocity = clamp(step.velocity ?? 2, 1, 3);
    return { noteIndex, velocity };
  });
  setPreviewNote(track, slice);
}

function instantiateTrack(templateId) {
  const template = trackLibrary.find(t => t.id === templateId);
  if (!template) return null;
  const key = assignKey(template.key);
  const isRhythm = template.type === 'drum' || template.type === 'sample';
  const baseSteps = isRhythm ? new Array(state.steps).fill(0) : new Array(state.steps).fill(null);
  const track = {
    uid: ++trackCounter,
    id: trackCounter,
    templateId: template.id,
    name: template.name,
    category: template.category,
    type: template.type,
    key,
    color: template.color || '#00ff88',
    params: cloneParams(template.params || {}),
    drumType: template.drumType,
    waveform: template.waveform || 'pulse',
    dutyCycle: template.dutyCycle ?? 0.5,
    arpPattern: template.arpPattern || 'up',
    arpSubdivision: template.arpSubdivision || 4,
    arpSpan: template.arpSpan || 4,
    noteOffset: template.noteOffset ?? 0,
    noteSpan: template.noteSpan ?? 12,
    previewNoteIndex: template.previewNote ?? 0,
    volume: template.volume ?? 0.85,
    muted: false,
    soloed: false,
    steps: baseSteps,
    sample: null,
    _lastVolume: template.volume ?? 0.85
  };
  clampTrackToScale(track);
  return track;
}

function updateScale(root, mode) {
  state.scale.root = root;
  state.scale.mode = mode;
  state.scale.notes = generateScale(root, mode, { startOctave: 2, octaves: 4 });
  state.tracks.forEach(track => clampTrackToScale(track));
}

function setStepsPerTrack(newSteps) {
  state.steps = newSteps;
  state.tracks.forEach(track => {
    const length = newSteps;
    if (track.type === 'drum' || track.type === 'sample') {
      const next = new Array(length).fill(0);
      (track.steps || []).forEach((val, idx) => {
        if (idx < length) next[idx] = clamp(val || 0, 0, 3);
      });
      track.steps = next;
    } else {
      const slice = getTrackScale(track);
      const next = new Array(length).fill(null);
      (track.steps || []).forEach((evt, idx) => {
        if (idx >= length || !evt || !slice.length) return;
        next[idx] = {
          noteIndex: clamp(evt.noteIndex ?? 0, 0, slice.length - 1),
          velocity: clamp(evt.velocity ?? 2, 1, 3)
        };
      });
      track.steps = next;
    }
  });
}

function ensureSoundboard() {
  state.soundboard = soundboardFx.map(fx => ({ ...fx }));
}

function triggerSoundboardFx(id) {
  if (!engine) return;
  engine.resume();
  engine.playFx(id, { time: engine.currentTime() });
}

function initApp() {
  engine = new ChipEngine();
  window.engine = engine;
  state.tracks = [];
  state.selectedTrackIndex = 0;
  updateScale(state.scale.root, state.scale.mode);
  trackCounter = 0;
  initialTrackOrder.forEach(id => {
    const track = instantiateTrack(id);
    if (track) state.tracks.push(track);
  });
  ensureSoundboard();
  if (typeof buildInterface === 'function') buildInterface();
  if (typeof setupEventListeners === 'function') setupEventListeners();
  updateDisplay();
}

window.initApp = initApp;
window.state = state;
window.trackLibrary = trackLibrary;
window.soundboardFx = soundboardFx;
window.instantiateTrack = instantiateTrack;
window.assignKey = assignKey;
window.getTrackScale = getTrackScale;
window.clampTrackToScale = clampTrackToScale;
window.updateScale = updateScale;
window.setStepsPerTrack = setStepsPerTrack;
window.triggerSoundboardFx = triggerSoundboardFx;
window.generateScale = generateScale;
window.noteToFreq = noteToFreq;
