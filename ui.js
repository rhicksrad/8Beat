// 8Beat Chiptune Studio - Interface & Interaction Layer

const SOUND_LABELS = {
  melody: 'Lead',
  bass: 'Bass',
  harmony: 'Chord',
  sequence: 'Arp',
  drum: 'Drum',
  sample: 'Sample'
};

const superRandomizerState = {
  running: false,
  toggles: {
    tracks: true,
    instruments: true,
    key: true,
    tempo: true,
    interval: true
  },
  baseInterval: 8,
  timerId: null,
  countdownId: null,
  nextTriggerTime: 0
};

function buildInterface() {
  buildTracks();
  buildPads();
  renderSoundboard();
  renderInstrumentOverlay();
  refreshScalePreview();
  updateScaleSummary();
}

function buildTracks() {
  const rack = document.getElementById('rack');
  if (!rack) return;
  rack.innerHTML = '';

  state.tracks.forEach((track, idx) => {
    const trackEl = document.createElement('article');
    trackEl.className = 'track';
    trackEl.dataset.track = String(idx);
    trackEl.style.setProperty('--track-color', track.color || 'var(--accent-primary)');

    const typeLabel = track.category || (track.type === 'melody' ? 'Melody' : track.type.charAt(0).toUpperCase() + track.type.slice(1));
    const registerLabel = getTrackRegisterLabel(track);
    const dutyValue = typeof track.dutyCycle === 'number' ? track.dutyCycle : 0.5;

    trackEl.innerHTML = `
      <div class="track-header">
        <div class="track-meta">
          <span class="track-name">${track.name}</span>
          <span class="track-type">${typeLabel}</span>
          <span class="track-key">Key: ${track.key || '-'}</span>
        </div>
        <div class="track-actions">
          <button class="btn ghost track-mute${track.muted ? ' active' : ''}">${track.muted ? 'Unmute' : 'Mute'}</button>
          <button class="btn ghost track-solo${track.soloed ? ' active' : ''}">${track.soloed ? 'Soloed' : 'Solo'}</button>
          <button class="btn ghost track-remove">Remove</button>
        </div>
      </div>
      <div class="track-settings">
        <div class="control-group">
          <label>Volume</label>
          <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="${track.volume}" ${track.muted ? 'disabled' : ''}>
          <div class="volume-meter"><div class="volume-meter-fill" style="height:${track.volume * 100}%"></div></div>
        </div>
        ${(track.type === 'melody' || track.type === 'arpeggio') ? `
          <div class="control-group">
            <label>Register</label>
            <div class="stepper">
              <button class="btn ghost stepper-btn" data-action="register-down">-</button>
              <span class="stepper-value">${registerLabel}</span>
              <button class="btn ghost stepper-btn" data-action="register-up">+</button>
            </div>
          </div>
        ` : ''}
        ${(track.waveform === 'pulse') ? `
          <div class="control-group">
            <label>Pulse Width</label>
            <input type="range" class="duty-slider" min="0.05" max="0.95" step="0.01" value="${dutyValue.toFixed(2)}">
            <span class="value-display duty-value">${dutyValue.toFixed(2)}</span>
          </div>
        ` : ''}
      </div>
      <div class="grid-container">
        <div class="grid" data-track="${idx}"></div>
      </div>
    `;

    rack.appendChild(trackEl);
    setupTrackEvents(trackEl, track, idx);
  });

  rebuildGrids();
  highlightSelectedTrack();
}

function getTrackRegisterLabel(track) {
  const slice = getTrackScale(track);
  if (!slice.length) return 'N/A';
  const first = slice[0]?.label || '';
  const last = slice[slice.length - 1]?.label || first;
  return slice.length > 1 ? `${first} → ${last}` : first;
}

function setupTrackEvents(trackEl, track, idx) {
  trackEl.addEventListener('click', (event) => {
    const target = event.target;
    if (target.closest('button') || target.closest('.grid')) return;
    selectTrack(idx);
  });

  const muteBtn = trackEl.querySelector('.track-mute');
  const soloBtn = trackEl.querySelector('.track-solo');
  const removeBtn = trackEl.querySelector('.track-remove');
  const volSlider = trackEl.querySelector('.volume-slider');
  const meterFill = trackEl.querySelector('.volume-meter-fill');
  const dutySlider = trackEl.querySelector('.duty-slider');
  const dutyValue = trackEl.querySelector('.duty-value');
  const stepperBtns = trackEl.querySelectorAll('.stepper-btn');

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      track.muted = !track.muted;
      muteBtn.classList.toggle('active', track.muted);
      muteBtn.textContent = track.muted ? 'Unmute' : 'Mute';
      if (track.muted) {
        track._lastVolume = track.volume;
        track.volume = 0;
        if (volSlider) volSlider.value = '0';
        if (volSlider) volSlider.disabled = true;
        if (meterFill) meterFill.style.height = '0%';
      } else {
        const restore = typeof track._lastVolume === 'number' ? track._lastVolume : 0.85;
        track.volume = restore;
        if (volSlider) {
          volSlider.value = String(restore);
          volSlider.disabled = false;
        }
        if (meterFill) meterFill.style.height = `${restore * 100}%`;
      }
    });
  }

  if (soloBtn) {
    soloBtn.addEventListener('click', () => {
      track.soloed = !track.soloed;
      soloBtn.classList.toggle('active', track.soloed);
      soloBtn.textContent = track.soloed ? 'Soloed' : 'Solo';
      if (track.soloed && track.muted && muteBtn) {
        muteBtn.click();
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => removeTrack(idx));
  }

  if (volSlider) {
    volSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      track.volume = isFinite(value) ? value : 0;
      if (meterFill) meterFill.style.height = `${track.volume * 100}%`;
    });
  }

  if (dutySlider) {
    dutySlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      track.dutyCycle = clamp(isFinite(value) ? value : 0.5, 0.05, 0.95);
      if (dutyValue) dutyValue.textContent = track.dutyCycle.toFixed(2);
    });
  }

  stepperBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'register-down') {
        adjustTrackRegister(idx, -2);
      } else if (action === 'register-up') {
        adjustTrackRegister(idx, 2);
      }
      const valueEl = trackEl.querySelector('.stepper-value');
      if (valueEl) valueEl.textContent = getTrackRegisterLabel(track);
    });
  });
}

function buildPads() {
  const padsGrid = document.querySelector('.pads-grid');
  if (!padsGrid) return;
  padsGrid.innerHTML = '';

  state.tracks.forEach((track, idx) => {
    const pad = document.createElement('div');
    pad.className = 'pad';
    pad.dataset.track = String(idx);

    const label = track.name;
    const typeKey = track.category ? track.category.toLowerCase() : track.type;
    const soundLabel = SOUND_LABELS[typeKey] || SOUND_LABELS[track.type] || track.type.toUpperCase();

    pad.innerHTML = `
      <div class="pad-label">${label}</div>
      <div class="pad-sound">${soundLabel}</div>
      <div class="pad-key">${track.key || ''}</div>
    `;

    pad.addEventListener('mousedown', () => {
      pad.classList.add('active');
      playPad(idx);
    });
    pad.addEventListener('mouseup', () => pad.classList.remove('active'));
    pad.addEventListener('mouseleave', () => pad.classList.remove('active'));
    pad.addEventListener('click', () => playPad(idx));

    padsGrid.appendChild(pad);
  });
}

async function playPad(trackIdx) {
  const track = state.tracks[trackIdx];
  if (!track) return;
  await engine.resume();
  const pad = document.querySelector(`.pad[data-track="${trackIdx}"]`);
  if (pad) {
    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), 180);
  }

  const now = engine.currentTime();
  if (track.type === 'drum' || track.type === 'sample') {
    playTrack(track, now, { velocity: 3 });
  } else {
    const slice = getTrackScale(track);
    const noteIndex = clamp(track.previewNoteIndex || 0, 0, Math.max(0, slice.length - 1));
    playTrack(track, now, { noteIndex, velocity: 3 });
  }
}

function rebuildGrids() {
  state.tracks.forEach((track, idx) => {
    const grid = document.querySelector(`.grid[data-track="${idx}"]`);
    if (!grid) return;
    grid.innerHTML = '';
    grid.style.setProperty('--track-color', track.color || 'var(--accent-primary)');
    grid.style.setProperty('--steps', state.steps);

    for (let step = 0; step < state.steps; step++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.step = String(step);
      cell.dataset.track = String(idx);

      cell.addEventListener('click', (e) => {
        if (e.shiftKey) {
          bumpVelocity(idx, step);
        } else {
          cycleCell(idx, step);
        }
      });

      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        decreaseCell(idx, step);
      });

      grid.appendChild(cell);
    }

    updateTrackGrid(idx);
  });
}

function updateTrackGrid(trackIndex) {
  const track = state.tracks[trackIndex];
  if (!track) return;
  const grid = document.querySelector(`.grid[data-track="${trackIndex}"]`);
  if (!grid) return;

  const cells = grid.querySelectorAll('.cell');
  const slice = getTrackScale(track);

  cells.forEach((cell) => {
    const step = parseInt(cell.dataset.step, 10);
    cell.classList.remove('on', 'melody', 'vel-1', 'vel-2', 'vel-3', 'step');
    cell.innerHTML = '';

    if (track.type === 'drum' || track.type === 'sample') {
      const level = track.steps[step] || 0;
      if (level > 0) {
        cell.classList.add('on', `vel-${clamp(level, 1, 3)}`);
      }
    } else {
      const evt = track.steps[step];
      if (evt) {
        const vel = clamp(evt.velocity || 2, 1, 3);
        const note = slice[clamp(evt.noteIndex || 0, 0, Math.max(0, slice.length - 1))];
        cell.classList.add('on', 'melody', `vel-${vel}`);
        if (note) {
          cell.innerHTML = `<span class="note-label">${note.label}</span>`;
        }
      }
    }
  });
}

function cycleCell(trackIndex, step) {
  const track = state.tracks[trackIndex];
  if (!track) return;

  if (track.type === 'drum' || track.type === 'sample') {
    const current = track.steps[step] || 0;
    track.steps[step] = (current + 1) % 4;
  } else {
    const slice = getTrackScale(track);
    if (!slice.length) return;
    const current = track.steps[step];
    if (!current) {
      const noteIndex = clamp(track.previewNoteIndex || 0, 0, slice.length - 1);
      track.steps[step] = { noteIndex, velocity: 2 };
    } else if (current.noteIndex >= slice.length - 1) {
      track.steps[step] = null;
    } else {
      current.noteIndex += 1;
    }
  }

  updateTrackGrid(trackIndex);
}

function decreaseCell(trackIndex, step) {
  const track = state.tracks[trackIndex];
  if (!track) return;

  if (track.type === 'drum' || track.type === 'sample') {
    const current = track.steps[step] || 0;
    track.steps[step] = Math.max(0, current - 1);
  } else {
    const current = track.steps[step];
    if (!current) return;
    if (current.noteIndex <= 0) {
      track.steps[step] = null;
    } else {
      current.noteIndex -= 1;
    }
  }

  updateTrackGrid(trackIndex);
}

function bumpVelocity(trackIndex, step) {
  const track = state.tracks[trackIndex];
  if (!track) return;

  if (track.type === 'drum' || track.type === 'sample') {
    const current = track.steps[step] || 0;
    track.steps[step] = current ? ((current % 3) + 1) : 1;
  } else {
    const slice = getTrackScale(track);
    if (!slice.length) return;
    const current = track.steps[step];
    if (!current) {
      const noteIndex = clamp(track.previewNoteIndex || 0, 0, slice.length - 1);
      track.steps[step] = { noteIndex, velocity: 1 };
    } else {
      current.velocity = ((current.velocity || 1) % 3) + 1;
    }
  }

  updateTrackGrid(trackIndex);
}

function updateDisplay() {
  const bpmValEl = document.getElementById('bpmVal');
  const swingValEl = document.getElementById('swingVal');
  const driveValEl = document.getElementById('driveVal');
  const delayValEl = document.getElementById('delayVal');
  const stepCounter = document.getElementById('stepCounter');

  if (bpmValEl) bpmValEl.textContent = state.bpm;
  if (swingValEl) swingValEl.textContent = `${Math.round(state.swing * 100)}%`;

  const driveInput = document.getElementById('drive');
  const delayInput = document.getElementById('delayMix');
  if (driveValEl && driveInput) driveValEl.textContent = parseFloat(driveInput.value).toFixed(2);
  if (delayValEl && delayInput) delayValEl.textContent = parseFloat(delayInput.value).toFixed(2);

  if (stepCounter) {
    const step = state.playing ? (state.position % state.steps) + 1 : 0;
    stepCounter.textContent = step;
  }
}

function setupEventListeners() {
  const playBtn = document.getElementById('play');
  const stopBtn = document.getElementById('stop');
  const recordBtn = document.getElementById('recordBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const bpmSlider = document.getElementById('bpm');
  const stepsSelect = document.getElementById('steps');
  const swingSlider = document.getElementById('swing');
  const driveSlider = document.getElementById('drive');
  const delaySlider = document.getElementById('delayMix');
  const scaleRoot = document.getElementById('scaleRoot');
  const scaleMode = document.getElementById('scaleMode');
  const addTrackBtn = document.getElementById('addTrackBtn');
  const randomizeBtn = document.getElementById('randomizeBtn');
  const randomizeScaleBtn = document.getElementById('randomizeScaleBtn');
  const clearBtn = document.getElementById('clearBtn');
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const loadSampleFile = document.getElementById('loadSampleFile');
  const closeOverlayBtn = document.getElementById('closeOverlayBtn');
  const superRandomToggle = document.getElementById('superRandomToggle');
  const superRandomIntervalSlider = document.getElementById('superRandomInterval');
  const superRandomOptions = document.querySelectorAll('.super-randomizer-option input');

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

  if (bpmSlider) {
    bpmSlider.addEventListener('input', (e) => {
      state.bpm = parseInt(e.target.value, 10);
      updateDisplay();
    });
  }

  if (stepsSelect) {
    stepsSelect.addEventListener('change', (e) => {
      const value = parseInt(e.target.value, 10);
      setStepsPerTrack(value);
      buildTracks();
      buildPads();
      updateDisplay();
    });
  }

  if (swingSlider) {
    swingSlider.addEventListener('input', (e) => {
      state.swing = parseFloat(e.target.value) || 0;
      updateDisplay();
    });
  }

  if (driveSlider) {
    driveSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value) || 0;
      engine.setDrive(value);
      updateDisplay();
    });
  }

  if (delaySlider) {
    delaySlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value) || 0;
      engine.setDelayMix(value);
      updateDisplay();
    });
  }

  if (scaleRoot) {
    scaleRoot.addEventListener('change', () => {
      updateScale(scaleRoot.value, state.scale.mode);
      refreshScalePreview();
      updateScaleSummary();
      rebuildGrids();
    });
  }

  if (scaleMode) {
    scaleMode.addEventListener('change', () => {
      updateScale(state.scale.root, scaleMode.value);
      refreshScalePreview();
      updateScaleSummary();
      rebuildGrids();
    });
  }

  if (randomizeScaleBtn) {
    randomizeScaleBtn.addEventListener('click', randomizeScale);
  }

  if (addTrackBtn) {
    addTrackBtn.addEventListener('click', openInstrumentOverlay);
  }

  if (closeOverlayBtn) {
    closeOverlayBtn.addEventListener('click', closeInstrumentOverlay);
  }

  if (randomizeBtn) {
    randomizeBtn.addEventListener('click', randomizePattern);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearPattern);
  }

  if (loadSampleBtn && loadSampleFile) {
    loadSampleBtn.addEventListener('click', () => loadSampleFile.click());
    loadSampleFile.addEventListener('change', handleSampleLoad);
  }

  if (superRandomToggle) {
    superRandomToggle.addEventListener('click', () => {
      if (superRandomizerState.running) {
        stopSuperRandomizer();
      } else {
        startSuperRandomizer();
      }
    });
  }

  if (superRandomIntervalSlider) {
    const sliderValue = parseFloat(superRandomIntervalSlider.value);
    if (isFinite(sliderValue)) {
      superRandomizerState.baseInterval = sliderValue;
    }
    superRandomIntervalSlider.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!isFinite(value)) return;
      superRandomizerState.baseInterval = value;
      updateSuperRandomizerIntervalDisplay();
    });
    superRandomIntervalSlider.addEventListener('change', () => {
      if (superRandomizerState.running) {
        scheduleNextSuperRandomizer();
      }
    });
  }

  superRandomOptions.forEach((input) => {
    const feature = input.dataset.feature;
    if (!feature) return;
    if (Object.prototype.hasOwnProperty.call(superRandomizerState.toggles, feature)) {
      input.checked = Boolean(superRandomizerState.toggles[feature]);
    }
    input.addEventListener('change', () => {
      superRandomizerState.toggles[feature] = input.checked;
      if (feature === 'interval' && superRandomizerState.running) {
        scheduleNextSuperRandomizer();
      }
    });
  });

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);

  initializeSuperRandomizerUi();
}

function handleKeyDown(event) {
  if (event.repeat) return;
  const key = event.key?.toUpperCase();
  const track = state.tracks.find((t) => t.key === key);
  if (!track) return;
  const idx = state.tracks.indexOf(track);
  const pad = document.querySelector(`.pad[data-track="${idx}"]`);
  if (pad) pad.classList.add('active');
  playPad(idx);
}

function handleKeyUp(event) {
  const key = event.key?.toUpperCase();
  const track = state.tracks.find((t) => t.key === key);
  if (!track) return;
  const idx = state.tracks.indexOf(track);
  const pad = document.querySelector(`.pad[data-track="${idx}"]`);
  if (pad) pad.classList.remove('active');
}

function renderSoundboard() {
  const container = document.getElementById('soundboard');
  if (!container) return;
  container.innerHTML = '';

  state.soundboard.forEach((fx) => {
    const btn = document.createElement('button');
    btn.dataset.fx = fx.id;
    btn.innerHTML = `<strong>${fx.label}</strong><span>${fx.description}</span>`;
    if (fx.color) {
      btn.style.borderColor = `${fx.color}40`;
      btn.style.boxShadow = `0 0 0 1px ${fx.color}22`;
    }
    btn.addEventListener('click', async () => {
      await engine.resume();
      triggerSoundboardFx(fx.id);
    });
    container.appendChild(btn);
  });
}

function renderInstrumentOverlay() {
  const grid = document.getElementById('instrumentGrid');
  if (!grid) return;
  grid.innerHTML = '';

  trackLibrary.forEach((template) => {
    const card = document.createElement('div');
    card.className = 'instrument-card';
    card.dataset.template = template.id;
    card.style.borderColor = (template.color || '#ffffff10');
    card.innerHTML = `
      <span class="badge">${template.category || template.type}</span>
      <h3>${template.name}</h3>
      <p>${getInstrumentDescription(template)}</p>
    `;
    card.addEventListener('click', () => {
      addTrack(template.id);
      closeInstrumentOverlay();
    });
    grid.appendChild(card);
  });
}

function getInstrumentDescription(template) {
  switch (template.type) {
    case 'melody':
      return 'Expressive melodic lane for chip leads and motifs.';
    case 'arpeggio':
      return 'Automatic arpeggiator that follows the active scale.';
    case 'drum':
      return 'Percussion voice crafted for retro punch and rhythm.';
    case 'sample':
      return 'Drop in custom textures or vocal chops.';
    default:
      return 'Add a new voice to your arrangement.';
  }
}

function openInstrumentOverlay() {
  const overlay = document.getElementById('instrumentOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeInstrumentOverlay() {
  const overlay = document.getElementById('instrumentOverlay');
  if (overlay) overlay.classList.remove('open');
}

function addTrack(templateId) {
  const track = instantiateTrack(templateId);
  if (!track) return;
  state.tracks.push(track);
  state.selectedTrackIndex = state.tracks.length - 1;
  buildTracks();
  buildPads();
  updateDisplay();
}

function removeTrack(index) {
  if (index < 0 || index >= state.tracks.length) return;
  state.tracks.splice(index, 1);
  if (state.selectedTrackIndex >= state.tracks.length) {
    state.selectedTrackIndex = state.tracks.length - 1;
  }
  buildTracks();
  buildPads();
  updateDisplay();
}

function selectTrack(index) {
  if (index < 0 || index >= state.tracks.length) return;
  state.selectedTrackIndex = index;
  highlightSelectedTrack();
}

function highlightSelectedTrack() {
  const tracks = document.querySelectorAll('.track');
  tracks.forEach((trackEl, idx) => {
    trackEl.classList.toggle('selected', idx === state.selectedTrackIndex);
  });
}

function refreshScalePreview() {
  const preview = document.getElementById('scalePreview');
  if (!preview) return;
  preview.innerHTML = '';
  const notes = state.scale.notes || [];
  notes.forEach((note) => {
    const span = document.createElement('span');
    span.textContent = note.label;
    preview.appendChild(span);
  });
}

function updateScaleSummary() {
  const summary = document.getElementById('scaleSummary');
  if (!summary) return;
  const modeName = state.scale.mode.replace(/^(.)/, (m) => m.toUpperCase());
  summary.textContent = `${state.scale.root} ${modeName}`;
}

function randomizeScale() {
  const rootSelect = document.getElementById('scaleRoot');
  const modeSelect = document.getElementById('scaleMode');
  if (!rootSelect || !modeSelect) return;

  const rootOptions = Array.from(rootSelect.options || []);
  const modeOptions = Array.from(modeSelect.options || []);
  if (!rootOptions.length || !modeOptions.length) return;

  const randomRootOption = rootOptions[Math.floor(Math.random() * rootOptions.length)];
  const randomModeOption = modeOptions[Math.floor(Math.random() * modeOptions.length)];

  const nextRoot = randomRootOption?.value || randomRootOption?.text || state.scale.root;
  const nextMode = randomModeOption?.value || randomModeOption?.text || state.scale.mode;

  rootSelect.value = nextRoot;
  modeSelect.value = nextMode;

  updateScale(nextRoot, nextMode);
  refreshScalePreview();
  updateScaleSummary();
  rebuildGrids();
}

function adjustTrackRegister(index, delta) {
  const track = state.tracks[index];
  if (!track) return;
  const notes = state.scale.notes || [];
  const span = Math.max(1, track.noteSpan || notes.length);
  const maxOffset = Math.max(0, notes.length - span);
  const next = clamp((track.noteOffset || 0) + delta, 0, maxOffset);
  track.noteOffset = next;
  clampTrackToScale(track);
  updateTrackGrid(index);
  buildPads();
}

function randomizePattern() {
  state.tracks.forEach((track, idx) => {
    if (track.type === 'drum' || track.type === 'sample') {
      const density = track.drumType === 'hat' ? 0.45 : track.drumType === 'kick' ? 0.3 : 0.25;
      track.steps = track.steps.map(() => {
        if (Math.random() < density) {
          return 1 + Math.floor(Math.random() * 3);
        }
        return 0;
      });
    } else {
      const slice = getTrackScale(track);
      track.steps = track.steps.map(() => {
        if (!slice.length || Math.random() < 0.65) return null;
        const noteIndex = Math.floor(Math.random() * slice.length);
        const velocity = 1 + Math.floor(Math.random() * 3);
        return { noteIndex, velocity };
      });
    }
    updateTrackGrid(idx);
  });
}

function clearPattern() {
  state.tracks.forEach((track, idx) => {
    if (track.type === 'drum' || track.type === 'sample') {
      track.steps = new Array(state.steps).fill(0);
    } else {
      track.steps = new Array(state.steps).fill(null);
    }
    updateTrackGrid(idx);
  });
}

function initializeSuperRandomizerUi() {
  updateSuperRandomizerButton();
  updateSuperRandomizerIntervalDisplay();
  updateSuperRandomizerCountdown();
}

function updateSuperRandomizerButton() {
  const btn = document.getElementById('superRandomToggle');
  if (btn) {
    btn.textContent = superRandomizerState.running ? 'Stop Chaos' : 'Start Chaos';
    btn.setAttribute('aria-pressed', superRandomizerState.running ? 'true' : 'false');
    btn.classList.toggle('danger', superRandomizerState.running);
    btn.classList.toggle('primary', !superRandomizerState.running);
  }
  const container = document.getElementById('superRandomizer');
  if (container) {
    container.classList.toggle('running', superRandomizerState.running);
  }
}

function updateSuperRandomizerIntervalDisplay() {
  const slider = document.getElementById('superRandomInterval');
  const label = document.getElementById('superRandomIntervalVal');
  if (slider) {
    const min = parseFloat(slider.min) || 2;
    const max = parseFloat(slider.max) || 20;
    const value = clamp(superRandomizerState.baseInterval || min, min, max);
    superRandomizerState.baseInterval = value;
    slider.value = String(Math.round(value));
    if (label) label.textContent = `${Math.round(value)}s`;
  } else if (label) {
    label.textContent = `${Math.round(superRandomizerState.baseInterval)}s`;
  }
}

function updateSuperRandomizerCountdown() {
  const countdown = document.getElementById('superRandomCountdown');
  if (!countdown) return;
  if (!superRandomizerState.running || !superRandomizerState.nextTriggerTime) {
    countdown.textContent = '--';
    return;
  }
  const remaining = superRandomizerState.nextTriggerTime - Date.now();
  const seconds = Math.max(0, remaining / 1000);
  countdown.textContent = `${seconds.toFixed(1)}s`;
}

function startSuperRandomizer() {
  if (superRandomizerState.running) return;
  superRandomizerState.running = true;
  updateSuperRandomizerButton();
  performSuperRandomizer();
  scheduleNextSuperRandomizer();
  if (superRandomizerState.countdownId) {
    clearInterval(superRandomizerState.countdownId);
  }
  superRandomizerState.countdownId = setInterval(updateSuperRandomizerCountdown, 100);
  updateSuperRandomizerCountdown();
}

function stopSuperRandomizer() {
  if (!superRandomizerState.running) return;
  superRandomizerState.running = false;
  if (superRandomizerState.timerId) {
    clearTimeout(superRandomizerState.timerId);
    superRandomizerState.timerId = null;
  }
  if (superRandomizerState.countdownId) {
    clearInterval(superRandomizerState.countdownId);
    superRandomizerState.countdownId = null;
  }
  superRandomizerState.nextTriggerTime = 0;
  updateSuperRandomizerButton();
  updateSuperRandomizerCountdown();
}

function scheduleNextSuperRandomizer() {
  if (superRandomizerState.timerId) {
    clearTimeout(superRandomizerState.timerId);
    superRandomizerState.timerId = null;
  }
  if (!superRandomizerState.running) {
    superRandomizerState.nextTriggerTime = 0;
    updateSuperRandomizerCountdown();
    return;
  }
  const intervalSeconds = computeSuperRandomizerInterval();
  superRandomizerState.nextTriggerTime = Date.now() + intervalSeconds * 1000;
  superRandomizerState.timerId = setTimeout(() => {
    if (!superRandomizerState.running) return;
    performSuperRandomizer();
    scheduleNextSuperRandomizer();
  }, intervalSeconds * 1000);
  updateSuperRandomizerCountdown();
}

function computeSuperRandomizerInterval() {
  const slider = document.getElementById('superRandomInterval');
  const sliderMin = slider ? parseFloat(slider.min) || 2 : 2;
  const sliderMax = slider ? parseFloat(slider.max) || 20 : 20;
  const base = clamp(superRandomizerState.baseInterval || sliderMin, sliderMin, sliderMax);
  superRandomizerState.baseInterval = base;
  if (!superRandomizerState.toggles.interval) {
    return base;
  }
  const lower = clamp(base * 0.5, sliderMin, sliderMax);
  const upper = clamp(base * 1.5, sliderMin, sliderMax);
  const min = Math.min(lower, upper);
  const max = Math.max(lower, upper);
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

function performSuperRandomizer() {
  const toggles = superRandomizerState.toggles;
  let tracksChanged = false;

  if (toggles.tracks) {
    tracksChanged = randomizeTrackCount() || tracksChanged;
  }

  if (toggles.instruments) {
    tracksChanged = randomizeTrackInstruments() || tracksChanged;
  }

  if (toggles.key) {
    randomizeScale();
  }

  if (toggles.tempo) {
    randomizeTempo();
  }

  if (tracksChanged) {
    buildTracks();
    buildPads();
  }

  updateDisplay();
}

function randomizeTrackCount() {
  const maxTracks = Math.min(KEY_POOL.length, trackLibrary.length);
  if (maxTracks <= 0) return false;
  const minTracks = Math.min(4, maxTracks);
  const target = Math.floor(Math.random() * (maxTracks - minTracks + 1)) + minTracks;
  const current = state.tracks.length;
  if (target === current) return false;

  if (target > current) {
    const existingIds = new Set(state.tracks.map((track) => track.templateId));
    const unusedTemplates = shuffleArray(trackLibrary.filter((template) => !existingIds.has(template.id)));
    while (state.tracks.length < target && unusedTemplates.length) {
      const template = unusedTemplates.shift();
      const track = instantiateTrack(template.id);
      if (track) state.tracks.push(track);
    }
    while (state.tracks.length < target) {
      const template = trackLibrary[Math.floor(Math.random() * trackLibrary.length)];
      const track = instantiateTrack(template.id);
      if (track) state.tracks.push(track);
    }
  } else {
    while (state.tracks.length > target) {
      const removeIndex = Math.floor(Math.random() * state.tracks.length);
      state.tracks.splice(removeIndex, 1);
    }
    if (state.tracks.length) {
      state.selectedTrackIndex = clamp(state.selectedTrackIndex, 0, state.tracks.length - 1);
    } else {
      state.selectedTrackIndex = 0;
    }
  }

  return true;
}

function randomizeTrackInstruments() {
  if (!state.tracks.length) return false;
  const shuffledTemplates = shuffleArray(trackLibrary);
  let pointer = 0;
  const nextTracks = state.tracks.map((track) => {
    if (pointer >= shuffledTemplates.length) {
      pointer = 0;
    }
    const template = shuffledTemplates[pointer++];
    const next = instantiateTrack(template.id);
    if (!next) return track;
    next.key = track.key;
    return next;
  });
  state.tracks = nextTracks;
  if (state.tracks.length) {
    state.selectedTrackIndex = clamp(state.selectedTrackIndex, 0, state.tracks.length - 1);
  } else {
    state.selectedTrackIndex = 0;
  }
  return true;
}

function randomizeTempo() {
  const slider = document.getElementById('bpm');
  const min = slider ? parseInt(slider.min, 10) || 40 : 40;
  const max = slider ? parseInt(slider.max, 10) || 220 : 220;
  const next = Math.floor(Math.random() * (max - min + 1)) + min;
  state.bpm = next;
  if (slider) slider.value = String(next);
}

function shuffleArray(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function handleSampleLoad(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await engine.decodeSample(arrayBuffer);
    if (!buffer) return;

    let targetIndex = state.selectedTrackIndex;
    let track = state.tracks[targetIndex];
    if (!track || track.type !== 'sample') {
      track = state.tracks.find((t) => t.type === 'sample');
      if (!track) {
        const newTrack = instantiateTrack('samplePad');
        if (newTrack) {
          newTrack.sample = buffer;
          newTrack.name = file.name.replace(/\.[^/.]+$/, '');
          state.tracks.push(newTrack);
          state.selectedTrackIndex = state.tracks.length - 1;
          buildTracks();
          buildPads();
          return;
        }
        return;
      }
      targetIndex = state.tracks.indexOf(track);
    }

    track.sample = buffer;
    track.name = file.name.replace(/\.[^/.]+$/, '');
    state.selectedTrackIndex = targetIndex;
    buildTracks();
    buildPads();
  } catch (err) {
    console.warn('Failed to load sample', err);
  }
}

window.buildInterface = buildInterface;
window.buildTracks = buildTracks;
window.buildPads = buildPads;
window.rebuildGrids = rebuildGrids;
window.updateTrackGrid = updateTrackGrid;
window.updateDisplay = updateDisplay;
window.setupEventListeners = setupEventListeners;
window.handleSampleLoad = handleSampleLoad;
window.refreshScalePreview = refreshScalePreview;
window.updateScaleSummary = updateScaleSummary;
window.randomizeScale = randomizeScale;
window.randomizePattern = randomizePattern;
window.clearPattern = clearPattern;
