// UI Module - DOM manipulation and event handling

// Helper: convert hex color like #00ff88 to "0,255,136"
function hexToRgbString(hex) {
  if (!hex) return '0,255,136';
  const m = hex.trim().toLowerCase().match(/^#?([a-f0-9]{3}|[a-f0-9]{6})$/i);
  if (!m) return '0,255,136';
  let h = m[1];
  if (h.length === 3) {
    h = h.split('').map(c => c + c).join('');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

// Build the main UI
function buildUI() {
  const app = document.querySelector('.app');
  
  // Build tracks
  state.tracks = defaultTracks.map((track, i) => ({
    ...track,
    id: i,
    steps: new Array(state.steps).fill(0),
    volume: 1.0,
    muted: false,
    soloed: false,
    sample: null
  }));
  
  buildTracks();
  buildPads();
  updateDisplay();
}

// Build track UI
function buildTracks() {
  const rack = document.getElementById('rack');
  rack.innerHTML = '';
  
  state.tracks.forEach((track, idx) => {
    const trackEl = document.createElement('div');
    trackEl.className = 'track';
    trackEl.innerHTML = `
      <div class="track-header">
        <div class="track-controls">
          <select class="track-select">
            ${waveOptions.map(w => `<option value="${w}" ${w === track.type ? 'selected' : ''}>${w}</option>`).join('')}
          </select>
          <div class="track-key">${track.key}</div>
        </div>
        <button class="btn track-mute">Mute</button>
        <button class="btn track-solo">Solo</button>
        <div class="track-volume">
          <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="${track.volume}">
          <div class="volume-meter">
            <div class="volume-meter-fill" style="height: ${track.volume * 100}%"></div>
          </div>
        </div>
      </div>
      <div class="grid-container">
        <div class="grid" data-track="${idx}"></div>
      </div>
    `;
    
    rack.appendChild(trackEl);
    
    // Set per-track color for grid cells
    const gridEl = trackEl.querySelector(`.grid[data-track="${idx}"]`);
    if (gridEl) {
      gridEl.style.setProperty('--cell-color', track.color || 'var(--accent-primary)');
      gridEl.style.setProperty('--cell-color-rgb', hexToRgbString(track.color));
    }
    
    setupTrackEvents(trackEl, track, idx);
  });
  
  rebuildGrids();
}

// Setup track event listeners
function setupTrackEvents(trackEl, track, idx) {
  const select = trackEl.querySelector('.track-select');
  const muteBtn = trackEl.querySelector('.track-mute');
  const soloBtn = trackEl.querySelector('.track-solo');
  const volSlider = trackEl.querySelector('.volume-slider');
  const meterFill = trackEl.querySelector('.volume-meter-fill');
  
  select.addEventListener('change', (e) => {
    track.type = e.target.value;
    if (track.type === 'sample' && !track.sample) {
      document.getElementById('loadSampleFile').click();
    }
  });
  
  muteBtn.addEventListener('click', () => {
    track.muted = !track.muted;
    muteBtn.classList.toggle('active', track.muted);
    if (track.muted) soloBtn.classList.remove('active');
  });
  
  soloBtn.addEventListener('click', () => {
    track.soloed = !track.soloed;
    soloBtn.classList.toggle('active', track.soloed);
    if (track.soloed) muteBtn.classList.remove('active');
  });
  
  volSlider.addEventListener('input', (e) => {
    track.volume = parseFloat(e.target.value);
    meterFill.style.height = `${track.volume * 100}%`;
    // Add visual feedback
    meterFill.style.background = track.volume > 0.8 ? 
      'linear-gradient(to top, #ff4444, #ff6666)' : 
      'linear-gradient(to top, var(--accent-primary), var(--accent-secondary))';
  });
  
  // Initialize volume meter
  meterFill.style.height = `${track.volume * 100}%`;
}

// Build pads section
function buildPads() {
  const padsSection = document.querySelector('.pads-section');
  const padsGrid = document.querySelector('.pads-grid');
  
  padsGrid.innerHTML = '';
  
  state.tracks.forEach((track, idx) => {
    const pad = document.createElement('div');
    pad.className = 'pad';
    pad.dataset.track = idx;
    
    // Create more descriptive sound labels
    const soundLabels = {
      'kick': 'BOOM',
      'snare': 'CRACK', 
      'clap': 'CLAP',
      'hat': 'TSS',
      'square': 'BEEP',
      'triangle': 'DING',
      'sample': 'SAMPLE'
    };
    
    const soundLabel = soundLabels[track.type] || track.type.toUpperCase();
    
    pad.innerHTML = `
      <div class="pad-label">${track.name}</div>
      <div class="pad-sound">${soundLabel}</div>
      <div class="pad-key">${track.key}</div>
    `;
    
    pad.addEventListener('click', () => playPad(idx));
    pad.addEventListener('mousedown', () => {
      pad.classList.add('active');
      playPad(idx);
    });
    pad.addEventListener('mouseup', () => pad.classList.remove('active'));
    pad.addEventListener('mouseleave', () => pad.classList.remove('active'));
    
    padsGrid.appendChild(pad);
  });
}

// Play pad with visual feedback
function playPad(trackIdx) {
  const track = state.tracks[trackIdx];
  if (!track) return;
  
  const pad = document.querySelector(`[data-track="${trackIdx}"]`);
  pad.classList.add('active');
  
  setTimeout(() => pad.classList.remove('active'), 300);
  
  playTrack(track, engine.currentTime());
}

// Rebuild all grids
function rebuildGrids() {
  state.tracks.forEach((track, idx) => {
    const grid = document.querySelector(`.grid[data-track="${idx}"]`);
    if (!grid) return;
    
    // Ensure per-track color is applied (in case of rebuild)
    grid.style.setProperty('--cell-color', track.color || 'var(--accent-primary)');
    grid.style.setProperty('--cell-color-rgb', hexToRgbString(track.color));
    
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${state.steps}, 1fr)`;
    
    for (let i = 0; i < state.steps; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.step = i;
      cell.dataset.track = idx;
      
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        cycleCell(track.id, i);
      });
      
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        decreaseCell(track.id, i);
      });
      
      grid.appendChild(cell);
    }
    
    updateTrackGrid(track.id);
  });
}

// Update a track's grid display
function updateTrackGrid(trackId) {
  const track = state.tracks[trackId];
  if (!track) return;
  
  const grid = document.querySelector(`.grid[data-track="${trackId}"]`);
  if (!grid) return;
  
  // Ensure color variable is set
  grid.style.setProperty('--cell-color', track.color || 'var(--accent-primary)');
  grid.style.setProperty('--cell-color-rgb', hexToRgbString(track.color));
  
  track.steps.forEach((level, step) => {
    const cell = grid.querySelector(`[data-step="${step}"]`);
    if (!cell) return;
    
    // Reset classes
    cell.classList.remove('v1', 'v2', 'v3', 'on');
    
    if (level > 0) {
      cell.classList.add('on');
      if (level === 1) cell.classList.add('v1');
      else if (level === 2) cell.classList.add('v2');
      else cell.classList.add('v3');
    }
  });
}

// Cycle cell velocity
function cycleCell(trackId, step) {
  const track = state.tracks[trackId];
  if (!track) return;
  
  const current = track.steps[step] || 0;
  track.steps[step] = (current + 1) % 4;
  
  updateTrackGrid(trackId);
}

// Decrease cell velocity
function decreaseCell(trackId, step) {
  const track = state.tracks[trackId];
  if (!track) return;
  
  const current = track.steps[step] || 0;
  track.steps[step] = Math.max(0, current - 1);
  
  updateTrackGrid(trackId);
}

// Set cell value
function setCell(trackId, step, value) {
  const track = state.tracks[trackId];
  if (!track) return;
  
  track.steps[step] = clamp(value, 0, 3);
  updateTrackGrid(trackId);
}

// Update display values
function updateDisplay() {
  const bpmValEl = document.getElementById('bpmVal');
  const swingValEl = document.getElementById('swingVal');
  const driveValEl = document.getElementById('driveVal');
  const delayValEl = document.getElementById('delayVal');
  
  if (bpmValEl) bpmValEl.textContent = state.bpm;
  if (swingValEl) swingValEl.textContent = Math.round(state.swing * 100) + '%';
  
  // Safely read from sliders so we don't depend on undefined state fields
  const driveInput = document.getElementById('drive');
  const delayInput = document.getElementById('delayMix');
  const driveVal = driveInput ? parseFloat(driveInput.value) : 0.2;
  const delayVal = delayInput ? parseFloat(delayInput.value) : 0.15;
  
  if (driveValEl) driveValEl.textContent = driveVal.toFixed(2);
  if (delayValEl) delayValEl.textContent = delayVal.toFixed(2);
  
  // Update step counter
  const currentStep = state.playing ? (state.position % state.steps) + 1 : 0;
  const stepCounter = document.getElementById('stepCounter');
  if (stepCounter) {
    stepCounter.textContent = currentStep;
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Transport controls
  const playBtn = document.getElementById('play');
  const stopBtn = document.getElementById('stop');
  const recordBtn = document.getElementById('recordBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (state.playing) {
        stop();
      } else {
        play();
      }
    });
  }
  
  if (stopBtn) {
    stopBtn.addEventListener('click', stop);
  }
  
  if (recordBtn) {
    recordBtn.addEventListener('click', toggleRecording);
  }
  
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadRecording);
  }
  
  // Tempo and controls
  const bpmSlider = document.getElementById('bpm');
  const stepsSelect = document.getElementById('steps');
  const swingSlider = document.getElementById('swing');
  const driveSlider = document.getElementById('drive');
  const delayMixSlider = document.getElementById('delayMix');
  
  if (bpmSlider) {
    bpmSlider.addEventListener('input', (e) => {
      state.bpm = parseInt(e.target.value);
      updateDisplay();
    });
  }
  
  if (stepsSelect) {
    stepsSelect.addEventListener('change', (e) => {
      state.steps = parseInt(e.target.value);
      state.tracks.forEach(track => {
        const newSteps = new Array(state.steps).fill(0);
        track.steps.forEach((val, i) => {
          if (i < state.steps) newSteps[i] = val;
        });
        track.steps = newSteps;
      });
      rebuildGrids();
    });
  }
  
  if (swingSlider) {
    swingSlider.addEventListener('input', (e) => {
      state.swing = parseFloat(e.target.value);
      updateDisplay();
    });
  }
  
  if (driveSlider) {
    driveSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      engine.setDrive(val);
      updateDisplay();
    });
  }
  
  if (delayMixSlider) {
    delayMixSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      engine.setDelayMix(val);
      updateDisplay();
    });
  }
  
  // Sample loading
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const loadSampleFile = document.getElementById('loadSampleFile');
  
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', () => {
      loadSampleFile.click();
    });
  }
  
  if (loadSampleFile) {
    loadSampleFile.addEventListener('change', handleSampleLoad);
  }
  
  // Keyboard events
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  
  // Preset events
  const presetsEl = document.getElementById('presets');
  if (presetsEl) {
    presetsEl.addEventListener('click', handlePresetClick);
  }
}

// Handle keyboard events
function handleKeyDown(e) {
  if (e.repeat) return;
  
  const track = state.tracks.find(t => t.key === e.key.toUpperCase());
  if (!track) return;
  
  const pad = document.querySelector(`[data-track="${track.id}"]`);
  if (pad) {
    pad.classList.add('active');
    playPad(track.id);
  }
}

function handleKeyUp(e) {
  const track = state.tracks.find(t => t.key === e.key.toUpperCase());
  if (!track) return;
  
  const pad = document.querySelector(`[data-track="${track.id}"]`);
  if (pad) {
    pad.classList.remove('active');
  }
}

// Handle sample loading
async function handleSampleLoad(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await engine.decodeSample(arrayBuffer);
    
    if (buffer) {
      // Find first sample track or create one
      let sampleTrack = state.tracks.find(t => t.type === 'sample');
      if (!sampleTrack) {
        sampleTrack = state.tracks[0];
        sampleTrack.type = 'sample';
      }
      
      sampleTrack.sample = buffer;
      sampleTrack.name = file.name.replace(/\.[^/.]+$/, '');
      
      // Update UI
      const trackEl = document.querySelector(`[data-track="${sampleTrack.id}"]`);
      if (trackEl) {
        const select = trackEl.querySelector('.track-select');
        if (select) select.value = 'sample';
      }
      
      console.log('Sample loaded:', file.name);
    }
  } catch (error) {
    console.error('Failed to load sample:', error);
  }
}

// Handle preset clicks
function handlePresetClick(e) {
  const chip = e.target.closest('.preset-chip');
  if (!chip) return;
  
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  
  const preset = chip.dataset.preset;
  if (preset === 'chiptune') loadChiptune();
  else if (preset === 'electro') loadElectro();
  else if (preset === 'random') randomize();
  else if (preset === 'clear') clearAll();
  else if (chip.dataset.idx) {
    const idx = parseInt(chip.dataset.idx);
    if (isFinite(idx)) loadPresetByIndex(idx);
  }
}

// Render preset bank
function renderPresetBank() {
  const container = document.getElementById('presets');
  if (!container) return;
  
  const frag = document.createDocumentFragment();
  PRESET_BANK.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'preset-chip';
    btn.textContent = p.name;
    btn.dataset.idx = String(i);
    frag.appendChild(btn);
  });
  container.appendChild(frag);
}

// Preset loading functions
function parseRow(s) {
  const res = new Array(16).fill(0);
  if (!s) return res;
  for (let i = 0; i < Math.min(16, s.length); i++) {
    const c = s[i];
    res[i] = c === 'x' ? 1 : c === 'X' ? 2 : c === '!' ? 3 : 0;
  }
  return res;
}

function applyPatternRows(rows) {
  state.steps = 16;
  const stepsSelect = document.getElementById('steps');
  if (stepsSelect) stepsSelect.value = '16';
  
  rebuildGrids();
  clearAll();
  
  const trackOrder = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let ti = 0; ti < trackOrder.length; ti++) {
    const row = rows[ti] || ''.padEnd(16, '.');
    const levels = Array.isArray(row) ? row : parseRow(row);
    for (let i = 0; i < 16; i++) {
      const lvl = levels[i] | 0;
      if (lvl > 0) setCell(trackOrder[ti], i, lvl);
    }
  }
}

function loadPresetByIndex(i) {
  const p = PRESET_BANK[i | 0];
  if (!p) return;
  applyPatternRows(p.rows);
}

// Preset patterns
const PRESET_BANK = [
  { name: '808 Classic', rows: [
    '!...!...!...!...', // Kick
    '....X.......X...', // Snare
    '................', // Clap
    'x.x.x.x.x.x.x.x.', // CHat
    '........X.......', // OHat
    '...........x....', // Tom
    '................', // Cow
    '................'  // Sample
  ]},
  { name: 'Boom Bap', rows: [
    '!.....!..!..!...',
    '....X.......X...',
    '........X.......',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '......x.........',
    '........x.......',
    '................'
  ]},
  { name: 'Electro Funk', rows: [
    '!....!..!..!..!..',
    '....X.......X....',
    '....x.......x....',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '......x.....x...',
    '........x.......',
    '................'
  ]},
  { name: 'Techno 4x4', rows: [
    '!...!...!...!...',
    '........X.......',
    '................',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '................',
    '................',
    '................'
  ]},
  { name: 'House Jack', rows: [
    '!...!...!...!...',
    '........X.......',
    '....x.......x...',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '..........x.....',
    '................',
    '................'
  ]},
  { name: 'Trap Basic', rows: [
    '!.....!..!..!...',
    '....X.......X...',
    '..x.....x.......',
    'x.xxx.x.x.xxx.x.',
    '...........X....',
    '........x.......',
    '............x...',
    '................'
  ]},
  { name: 'Trap Triplet', rows: [
    '!....!..!..!..!..',
    '....X.......X....',
    '...x..x..x..x....',
    'x.xxx.xxx.xxx.x..',
    '..........X......',
    '........x.......',
    '...........x....',
    '................'
  ]},
  { name: 'DnB Roller', rows: [
    '!.....!..!..!...',
    '....X...X....X..',
    '........x.......',
    'x.xxxxxxxxxxxx.x',
    '......X.........',
    '......x.........',
    '................',
    '................'
  ]},
  { name: 'UKG Shuffle', rows: [
    '!...!..!..!..!..',
    '......X.....X...',
    '....x.......x...',
    'x.x.x.x.x.x.x.x.',
    '......X.........',
    '..........x.....',
    '........x.......',
    '................'
  ]},
  { name: 'Boom Trap', rows: [
    '!.....!..!..!...',
    '....X.....X.....',
    '....x...........',
    'x.xx.x.xx.x.xx..',
    '...........X....',
    '........x.......',
    '............x...',
    '................'
  ]},
  { name: 'Electro Clack', rows: [
    '!....!..!..!..!..',
    '....X.......X....',
    '....X.......X....',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '......x.....x...',
    '........x.......',
    '................'
  ]},
  { name: 'Minimal', rows: [
    '!...............',
    '........X.......',
    '................',
    'x...x...x...x...',
    '........X.......',
    '................',
    '................',
    '................'
  ]},
  { name: 'Half-time', rows: [
    '!.....!.....!...',
    '........X.......',
    '....x.......x...',
    'x.x.x.x.x.x.x.x.',
    '..........X......',
    '......x.........',
    '................',
    '................'
  ]},
  { name: 'Garage Skips', rows: [
    '!...!..!..!..!..',
    '......X.....X...',
    '....x..x........',
    'x.x..x.x.x..x.x.',
    '......X.........',
    '..........x.....',
    '........x.......',
    '................'
  ]},
  { name: 'Afro 1', rows: [
    '!..!..!..!..!..!',
    '......X.....X...',
    '....x...x.......',
    'x..x.x..x.x..x..',
    '........X.......',
    '......x.........',
    '........x.......',
    '................'
  ]},
  { name: 'Afro 2', rows: [
    '!..!..!..!..!..!',
    '......X.....X...',
    '........x.......',
    'x.x..x..x.x..x..',
    '........X.......',
    '......x..x......',
    '........x.......',
    '................'
  ]},
  { name: 'Reggaeton', rows: [
    '!..!..!..!..!...',
    '......X.....X...',
    '....X.......X...',
    'x...x.x...x.x...',
    '........X.......',
    '..........x.....',
    '........x.......',
    '................'
  ]},
  { name: 'Latin House', rows: [
    '!...!....!..!...',
    '......X.....X...',
    '....x.......x...',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '......x.....x...',
    '........x.......',
    '................'
  ]},
  { name: 'Footwork', rows: [
    '!....!..!..!..!..',
    '....X.X.....X....',
    '....x.......x....',
    'x.xxx.xxx.xxx.x..',
    '..........X......',
    '........x.......',
    '...........x....',
    '................'
  ]},
  { name: 'R&B Slow', rows: [
    '!.......!.......',
    '.......X........',
    '........x.......',
    'x..x..x..x..x..x',
    '........X.......',
    '......x.........',
    '................',
    '................'
  ]},
  { name: 'Funk Break', rows: [
    '!.....!..!..!...',
    '....X...X....X..',
    '........x.......',
    'x.x.x.xx.x.x.xx.',
    '......X.........',
    '......x.........',
    '................',
    '................'
  ]},
  { name: 'New Jack', rows: [
    '!...!..!..!..!..',
    '....X.......X....',
    '....X.......X....',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '......x.....x...',
    '........x.......',
    '................'
  ]},
  { name: 'Electro Pop', rows: [
    '!...!....!..!...',
    '......X.....X...',
    '....x.......x...',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '..........x.....',
    '........x.......',
    '................'
  ]},
  { name: 'Tech House', rows: [
    '!...!...!...!...',
    '........X.......',
    '................',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '............x...',
    '................',
    '................'
  ]},
  { name: 'LoFi Hop', rows: [
    '!.....!..!..!...',
    '....X.......X...',
    '........x.......',
    'x..x..x..x..x..x',
    '........X.......',
    '......x.........',
    '................',
    '................'
  ]},
  { name: 'Industrial', rows: [
    '!X..!X..!X..!X..',
    '....X.......X...',
    '..X.....X.......',
    'x.xXx.xXx.xXx.xX',
    '........X.......',
    '....x....x......',
    '........x.......',
    '................'
  ]},
  { name: 'Chillwave', rows: [
    '!...!....!...!..',
    '........X.......',
    '....x.......x...',
    'x...x...x...x...',
    '..........X......',
    '......x.........',
    '................',
    '................'
  ]}
];

// Preset loading functions
function loadChiptune() {
  applyPatternRows([
    '!...!...!...!...',
    '....X.......X...',
    '................',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '................',
    '................',
    '................'
  ]);
}

function loadElectro() {
  applyPatternRows([
    '!...!...!...!...',
    '........X.......',
    '................',
    'x.x.x.x.x.x.x.x.',
    '........X.......',
    '................',
    '................',
    '................'
  ]);
}

function randomize() {
  for (const track of state.tracks) {
    const density = track.type === "hat" ? 0.32 : (track.type === 'kick' ? 0.2 : 0.24);
    for (let i = 0; i < state.steps; i++) {
      const on = Math.random() < density ? (1 + Math.floor(Math.random() * 3)) : 0;
      setCell(track.id, i, on);
    }
  }
}

function clearAll() {
  state.tracks.forEach(track => {
    track.steps.fill(0);
    updateTrackGrid(track.id);
  });
}

// Export functions
window.buildUI = buildUI;
window.buildTracks = buildTracks;
window.buildPads = buildPads;
window.rebuildGrids = rebuildGrids;
window.updateTrackGrid = updateTrackGrid;
window.cycleCell = cycleCell;
window.decreaseCell = decreaseCell;
window.setCell = setCell;
window.updateDisplay = updateDisplay;
window.setupEventListeners = setupEventListeners;
window.handleKeyDown = handleKeyDown;
window.handleKeyUp = handleKeyUp;
window.handleSampleLoad = handleSampleLoad;
window.handlePresetClick = handlePresetClick;
window.renderPresetBank = renderPresetBank;
window.loadChiptune = loadChiptune;
window.loadElectro = loadElectro;
window.randomize = randomize;
window.clearAll = clearAll;
window.loadPresetByIndex = loadPresetByIndex;
window.PRESET_BANK = PRESET_BANK;
