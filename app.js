// Modern Web 808 Drum Machine - JavaScript

// Utility functions
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Audio Engine
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
      console.warn("WebAudio not supported");
      return;
    }
    
    const ac = new Ctor({ latencyHint: "interactive" });
    const limit = ac.createDynamicsCompressor();
    limit.threshold.value = -6;
    limit.knee.value = 30;
    limit.ratio.value = 12;
    limit.attack.value = 0.003;
    limit.release.value = 0.25;

    const master = ac.createGain();
    master.gain.value = 0.9;

    // FX: Drive (waveshaper) -> Delay -> Output
    const drive = ac.createWaveShaper();
    const driveGain = ac.createGain();
    driveGain.gain.value = 0.2;
    drive.curve = ChipEngine.makeDriveCurve(0.2);

    const delay = ac.createDelay(1.0);
    delay.delayTime.value = 0.25;
    const delayFb = ac.createGain();
    delayFb.gain.value = 0.25;
    const delayMix = ac.createGain();
    delayMix.gain.value = 0.15;

    master.connect(driveGain).connect(drive);
    // dry path
    drive.connect(limit);
    // delay path
    drive.connect(delay);
    delay.connect(delayFb).connect(delay);
    delay.connect(delayMix).connect(limit);

    const out = ac.createGain();
    out.gain.value = 1.0;

    limit.connect(out).connect(ac.destination);

    const metGain = ac.createGain();
    metGain.gain.value = 0.0;
    metGain.connect(limit);

    // Recording destination
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
    if (this.ac.state !== "running") {
      try {
        await this.ac.resume();
      } catch (e) {
        console.warn("AudioContext resume failed", e);
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
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
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
    } catch (e) {
      console.warn('MediaRecorder unsupported or blocked', e);
      return null;
    }
  }

  async decodeSample(arrayBuffer) {
    this.ensure();
    if (!this.ac) return null;
    try {
      return await this.ac.decodeAudioData(arrayBuffer);
    } catch {
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

  playSine808({ time, baseFreq = 55, pitchDecay = 0.02, duration = 0.6, gain = 0.9, attack = 0.001, decay = 0.1, sustain = 0.0, release = 0.3 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(Math.max(20, baseFreq * 7), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, baseFreq), t0 + clamp(pitchDecay, 0.001, 1));

    const vca = ac.createGain();
    vca.gain.value = 0;
    osc.connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0003, 0.2), D = clamp(decay, 0.01, 1), S = clamp(sustain, 0, 1), R = clamp(release, 0.01, 2);
    const tEnd = t0 + clamp(duration, 0.05, 4) + R;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain, 0, 1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain,0,1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration,0.05,4), R / 3);

    osc.start(t0);
    osc.stop(tEnd);
  }

  playSquare({ time, freq, duration = 0.2, gain = 0.5, attack = 0.002, decay = 0.08, sustain = 0.2, release = 0.08, filterHz = 12000 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.value = isFinite(freq) ? freq : 440;

    const vca = ac.createGain();
    vca.gain.value = 0;

    const filt = ac.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = isFinite(filterHz) ? filterHz : 12000;
    filt.Q.value = 0.6;

    osc.connect(filt).connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0005, 1), D = clamp(decay, 0.001, 2), S = clamp(sustain, 0, 1), R = clamp(release, 0.001, 2);
    const tEnd = t0 + clamp(duration, 0.01, 5) + R;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain, 0, 1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain,0,1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration,0.01,5), R / 3);

    osc.start(t0);
    osc.stop(tEnd);
  }

  playTriangle({ time, freq, duration = 0.25, gain = 0.5, attack = 0.003, decay = 0.06, sustain = 0.25, release = 0.08, filterHz = 10000 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = isFinite(freq) ? freq : 440;

    const vca = ac.createGain();
    vca.gain.value = 0;

    const filt = ac.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = isFinite(filterHz) ? filterHz : 10000;
    filt.Q.value = 0.5;

    osc.connect(filt).connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0005, 1), D = clamp(decay, 0.001, 2), S = clamp(sustain, 0, 1), R = clamp(release, 0.001, 2);
    const tEnd = t0 + clamp(duration, 0.01, 5) + R;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain, 0, 1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain,0,1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration,0.01,5), R / 3);

    osc.start(t0);
    osc.stop(tEnd);
  }

  playNoise({ time, duration = 0.15, gain = 0.55, attack = 0.001, decay = 0.06, sustain = 0.2, release = 0.05, type = "white", hp = 200, lp = 8000 }) {
    this.ensure();
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;

    const length = Math.max(1, Math.floor(ac.sampleRate * clamp(duration,0.01,2) * 2));
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      let v = (Math.random() * 2 - 1);
      if (type === "pink") {
        const last = i ? data[i - 1] : 0;
        v = (v + last) * 0.5;
      }
      data[i] = v;
    }

    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = false;

    const vca = ac.createGain();
    vca.gain.value = 0;

    const hpF = ac.createBiquadFilter();
    hpF.type = "highpass";
    hpF.frequency.value = clamp(hp, 20, 16000);

    const lpF = ac.createBiquadFilter();
    lpF.type = "lowpass";
    lpF.frequency.value = clamp(lp, 200, 20000);

    src.connect(hpF).connect(lpF).connect(vca).connect(this.master);

    const g = vca.gain;
    const A = clamp(attack, 0.0003, 1), D = clamp(decay, 0.001, 2), S = clamp(sustain, 0, 1), R = clamp(release, 0.001, 2);
    const tEnd = t0 + clamp(duration, 0.01, 5) + R;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(clamp(gain,0,1), t0 + A);
    g.linearRampToValueAtTime(clamp(gain,0,1) * S, t0 + A + D);
    g.setTargetAtTime(0, t0 + clamp(duration,0.01,5), R / 3);

    src.start(t0);
    src.stop(tEnd);
  }

  tick(time, strong = false) {
    this.ensure();
    if (!this.ac || !this.metGain) return;
    const ac = this.ac;
    const t0 = isFinite(time) ? time : ac.currentTime;
    const osc = ac.createOscillator();
    const vca = ac.createGain();
    vca.gain.value = 0;
    osc.type = "square";
    osc.frequency.value = strong ? 1200 : 900;
    osc.connect(vca).connect(this.metGain);

    const g = vca.gain;
    const A = 0.001, D = 0.04;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(strong ? 0.08 : 0.05, t0 + A);
    g.linearRampToValueAtTime(0, t0 + A + D);

    osc.start(t0);
    osc.stop(t0 + 0.07);
  }
}

// App State
const state = {
  bpm: 120,
  steps: 16,
  swing: 0,
  playing: false,
  position: 0,
  scheduleAhead: 0.1,
  lookahead: 0.025,
  nextTime: 0,
  tracks: []
};

// Global variables
let engine = null;
let schedulerId = null;
let mediaRecorder = null;
let recordedChunks = [];
let recStartTs = 0;
let recTimerId = null;

// Track definitions
const defaultTracks = [
  { name: "Kick",   key: "Q", color: "#00ff88", type: "kick",    params: { baseFreq: 55, pitchDecay: 0.03, duration: 0.8, gain: 0.95 } },
  { name: "Snare",  key: "W", color: "#ffaa00", type: "snare",   params: { hp: 1400, lp: 8000, duration: 0.18, decay: 0.08, sustain: 0.0, release: 0.05, gain: 0.7 } },
  { name: "Clap",   key: "E", color: "#ff6b9d", type: "clap",    params: { hp: 800, lp: 7000, duration: 0.25, decay: 0.12, gain: 0.7 } },
  { name: "CHat",   key: "R", color: "#00ccff", type: "hat",     params: { hp: 6000, lp: 14000, duration: 0.06, decay: 0.04, gain: 0.45 } },
  { name: "OHat",   key: "T", color: "#b8b8c8", type: "hat",     params: { hp: 4000, lp: 11000, duration: 0.18, decay: 0.10, gain: 0.4 } },
  { name: "Tom",    key: "Y", color: "#00ccff", type: "square",  params: { duration: 0.22, decay: 0.08, sustain: 0.2, release: 0.08, gain: 0.55, filterHz: 2400 }, baseNote: "G2" },
  { name: "Cow",    key: "U", color: "#00ff88", type: "triangle",params: { duration: 0.25, decay: 0.06, sustain: 0.3, release: 0.06, gain: 0.45, filterHz: 5000 }, baseNote: "E5" },
  { name: "Sample", key: "I", color: "#ff6b9d", type: "sample",  params: { gain: 0.8 } }
];

const waveOptions = ["kick", "snare", "clap", "hat", "square", "triangle", "noise", "sample"];
const scale = [
  "C2","D2","E2","G2","A2",
  "C3","D3","E3","G3","A3",
  "C4","D4","E4","G4","A4",
  "C5","D5","E5","G5","A5"
];

// Utility functions
function noteToFreq(note) {
  const A4 = 440;
  const map = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6, G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };
  const m = (note||"").toString().match(/^([A-G](?:#|b)?)(-?\d+)$/i);
  if (!m) return 440;
  const p = m[1];
  const o = parseInt(m[2], 10);
  const semitone = map[p];
  if (!isFinite(semitone)) return 440;
  const n = semitone + (o - 4) * 12;
  return A4 * Math.pow(2, (n - 9) / 12);
}

// Initialize the app
function initApp() {
  engine = new ChipEngine();
  buildUI();
  setupEventListeners();
  loadChiptune();
  renderPresetBank();
}

// Export for use in HTML
window.initApp = initApp;
window.engine = engine;
window.state = state;
window.defaultTracks = defaultTracks;
window.waveOptions = waveOptions;
window.scale = scale;
window.noteToFreq = noteToFreq;
window.clamp = clamp;
