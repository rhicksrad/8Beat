// Sequencer Module - Playback, scheduling, and audio generation

// Playback functions
function play() {
  if (state.playing) return;
  
  engine.resume().then(() => {
    state.playing = true;
    state.position = 0;
    state.nextTime = engine.currentTime();
    
    const playBtn = document.getElementById('play');
    if (playBtn) playBtn.textContent = 'Stop';
    
    scheduler();
  });
}

function stop() {
  state.playing = false;
  state.position = 0;
  
  const playBtn = document.getElementById('play');
  if (playBtn) playBtn.textContent = 'Play';
  
  if (schedulerId) {
    clearTimeout(schedulerId);
    schedulerId = null;
  }
  
  // Clear step indicators
  document.querySelectorAll('.cell.step').forEach(cell => {
    cell.classList.remove('step');
  });
  
  // Clear track step indicators
  document.querySelectorAll('.track.current-step').forEach(track => {
    track.classList.remove('current-step');
  });
  
  // Reset display
  updateDisplay();
}

// Main scheduler
function scheduler() {
  if (!state.playing) return;
  
  const now = engine.currentTime();
  
  while (state.nextTime < now + state.scheduleAhead) {
    schedule(state.nextTime);
    nextStep();
  }
  
  // Update display more frequently
  updateDisplay();
  
  schedulerId = setTimeout(scheduler, state.lookahead * 1000);
}

// Schedule events for a specific time
function schedule(time) {
  const stepTime = 60 / state.bpm / 4; // 16th note duration
  
  // Play metronome on beat 1
  if (state.position % 4 === 0) {
    engine.tick(time, true);
  } else {
    engine.tick(time, false);
  }
  
  // Schedule track events
  state.tracks.forEach((track, trackIdx) => {
    if (track.muted) return;
    
    const step = state.position % state.steps;
    const velocity = track.steps[step] || 0;
    
    if (velocity > 0) {
      // Apply swing
      let swingOffset = 0;
      if (state.swing > 0 && step % 2 === 1) {
        swingOffset = stepTime * state.swing;
      }
      
      const playTime = time + swingOffset;
      playTrack(track, playTime, velocity);
    }
  });
  
  // Update step indicator
  updateStepIndicator(state.position % state.steps);
}

// Move to next step
function nextStep() {
  state.position++;
  state.nextTime += 60 / state.bpm / 4;
}

// Update step indicator
function updateStepIndicator(step) {
  // Remove previous step indicators
  document.querySelectorAll('.cell.step').forEach(cell => {
    cell.classList.remove('step');
  });
  
  // Add current step indicator to all tracks
  document.querySelectorAll(`[data-step="${step}"]`).forEach(cell => {
    cell.classList.add('step');
  });
  
  // Also add a visual indicator to the track headers
  document.querySelectorAll('.track').forEach((track, idx) => {
    track.classList.toggle('current-step', step === (state.position % state.steps));
  });
}

// Play a track at a specific time
function playTrack(track, time, velocity = 1) {
  if (!track || track.muted) return;
  
  const gain = (track.volume || 1) * (0.3 + velocity * 0.2);
  
  switch (track.type) {
    case 'kick':
      engine.playSine808({
        time,
        gain,
        ...track.params
      });
      break;
      
    case 'snare':
      engine.playNoise({
        time,
        gain,
        type: 'white',
        ...track.params
      });
      break;
      
    case 'clap':
      engine.playNoise({
        time,
        gain,
        type: 'white',
        ...track.params
      });
      break;
      
    case 'hat':
      engine.playNoise({
        time,
        gain,
        type: 'white',
        ...track.params
      });
      break;
      
    case 'square':
      const freq = track.baseNote ? noteToFreq(track.baseNote) : 440;
      engine.playSquare({
        time,
        freq,
        gain,
        ...track.params
      });
      break;
      
    case 'triangle':
      const triFreq = track.baseNote ? noteToFreq(track.baseNote) : 440;
      engine.playTriangle({
        time,
        freq: triFreq,
        gain,
        ...track.params
      });
      break;
      
    case 'noise':
      engine.playNoise({
        time,
        gain,
        ...track.params
      });
      break;
      
    case 'sample':
      if (track.sample) {
        engine.playSample({
          time,
          buffer: track.sample,
          gain,
          ...track.params
        });
      }
      break;
  }
}

// Recording functions
function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (!engine) return;
  
  const recorder = engine.createRecorder();
  if (!recorder) {
    console.warn('Recording not supported');
    return;
  }
  
  mediaRecorder = recorder;
  recordedChunks = [];
  recStartTs = Date.now();
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };
  
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `808-beat-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    a.click();
    
    URL.revokeObjectURL(url);
  };
  
  mediaRecorder.start(1000); // Collect data every second
  
  // Update UI
  const recordBtn = document.getElementById('recordBtn');
  if (recordBtn) {
    recordBtn.textContent = 'Stop Rec';
    recordBtn.classList.add('danger');
  }
  
  // Start recording timer
  updateRecordingTime();
  recTimerId = setInterval(updateRecordingTime, 100);
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  
  mediaRecorder.stop();
  
  // Update UI
  const recordBtn = document.getElementById('recordBtn');
  if (recordBtn) {
    recordBtn.textContent = 'Record';
    recordBtn.classList.remove('danger');
  }
  
  // Stop recording timer
  if (recTimerId) {
    clearInterval(recTimerId);
    recTimerId = null;
  }
  
  const recordTime = document.getElementById('recordTime');
  if (recordTime) {
    recordTime.textContent = '';
  }
}

function updateRecordingTime() {
  const recordTime = document.getElementById('recordTime');
  if (!recordTime) return;
  
  const elapsed = Date.now() - recStartTs;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  recordTime.textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function downloadRecording() {
  if (recordedChunks.length === 0) {
    console.warn('No recording available');
    return;
  }
  
  const blob = new Blob(recordedChunks, { type: 'audio/webm' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `808-beat-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
  a.click();
  
  URL.revokeObjectURL(url);
}

// Export functions
window.play = play;
window.stop = stop;
window.scheduler = scheduler;
window.schedule = schedule;
window.nextStep = nextStep;
window.updateStepIndicator = updateStepIndicator;
window.playTrack = playTrack;
window.toggleRecording = toggleRecording;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.updateRecordingTime = updateRecordingTime;
window.downloadRecording = downloadRecording;
