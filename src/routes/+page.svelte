<script>
  import * as marcelle from '@marcellejs/core';
  import '@marcellejs/core/dist/marcelle.css';

  // ──────────────────────────────────────────────────────────────────────────
  // TABS
  // ──────────────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'personalization', label: 'Personalization' },
    { id: 'recording', label: 'Microphone & Samples' },
    { id: 'classes', label: 'Class Manager' },
    { id: 'model', label: 'Model & Live Prediction' },
  ];
  let activeTab = 'personalization';

  // ──────────────────────────────────────────────────────────────────────────
  // A. UNIVERSITY SHARED DATASTORE (DISABLED WHILE BACKEND IS DOWN)
  // ──────────────────────────────────────────────────────────────────────────
  /*
  const store = marcelle.dataStore('https://marcelle.lisn.upsaclay.fr/iml2026/api');

  let team = 'A'; // default; will be overwritten by store.user.team if available
  let storeReady = false;
  let lastFeedbackType = null; // 'correct' | 'wrong_label' | 'false_alarm' | null

  async function initStore() {
    if (storeReady) return;
    try {
      await store.connect();
    } catch (error) {
      // opens login UI in a popup
      await store.loginWithUI();
    }
    team = store.user?.team || 'A';
    storeReady = true;
    console.log('Connected as team', team);
  }

  initStore();

  // Shared dataset on the server
  const trainingSet = marcelle.dataset('sound-training-shared', store);
  const count = trainingSet.$count; // reactive sample count
  */

  // While the server is unreachable, we keep data local:
  let team = 'A';
  let storeReady = false;
  function initStore() {
    storeReady = true;
  } // dummy so code compiles
  let count = { subscribe: (fn) => fn(0) }; // dummy Svelte store for UI text

  // ──────────────────────────────────────────────────────────────────────────
  // B. SIMPLE MANUAL KNN
  // ──────────────────────────────────────────────────────────────────────────
  let samples = []; // each: { id, x: number[], y: string, validator: string, audioBlob?: Blob }
  let nextSampleId = 1;
  $: sampleCount = samples.length;

  let k = 3;
  let modelTrained = false;
  let trainStatus = 'Model not trained yet';
  let prototypes = {}; // { className: { mean, variance, count } }
  let globalNorm = null; // { mean, variance } over all samples

  function computeGlobalNorm(samples) {
    if (!samples.length) return null;
    const dim = samples[0].x.length;
    const mean = new Array(dim).fill(0);
    const variance = new Array(dim).fill(0);

    // mean
    for (const s of samples) {
      const x = s.x;
      for (let i = 0; i < dim; i++) {
        mean[i] += x[i];
      }
    }
    for (let i = 0; i < dim; i++) {
      mean[i] /= samples.length;
    }

    // variance
    for (const s of samples) {
      const x = s.x;
      for (let i = 0; i < dim; i++) {
        const d = x[i] - mean[i];
        variance[i] += d * d;
      }
    }
    for (let i = 0; i < dim; i++) {
      variance[i] = variance[i] / samples.length || 1e-6;
    }

    return { mean, variance };
  }

  function applyGlobalNorm(vec, norm) {
    const { mean, variance } = norm;
    const dim = Math.min(vec.length, mean.length);
    const out = new Array(dim);
    for (let i = 0; i < dim; i++) {
      const std = Math.sqrt(variance[i]) || 1e-3;
      out[i] = (vec[i] - mean[i]) / std;
    }
    return out;
  }

  function trainModel() {
    if (samples.length < 2) {
      modelTrained = false;
      trainStatus = '❌ Need at least 2 samples';
      return;
    }

    // 1) compute global normalization over all samples
    globalNorm = computeGlobalNorm(samples);
    const normalizedSamples = samples.map((s) => ({
      ...s,
      x: applyGlobalNorm(s.x, globalNorm),
    }));

    // group by class using normalized features
    const byClass = {};
    for (const s of normalizedSamples) {
      if (!byClass[s.y]) byClass[s.y] = [];
      byClass[s.y].push(s.x);
    }

    prototypes = {};
    for (const [label, vecs] of Object.entries(byClass)) {
      const dim = vecs[0].length;
      const mean = new Array(dim).fill(0);
      vecs.forEach((v) => v.forEach((x, i) => (mean[i] += x)));
      for (let i = 0; i < dim; i++) mean[i] /= vecs.length;

      const variance = new Array(dim).fill(0);
      vecs.forEach((v) =>
        v.forEach((x, i) => {
          const d = x - mean[i];
          variance[i] += d * d;
        }),
      );
      for (let i = 0; i < dim; i++) {
        variance[i] = variance[i] / vecs.length || 1e-3;
      }

      prototypes[label] = { mean, variance, count: vecs.length };
    }

    modelTrained = true;
    trainStatus = `✅ Prototype model with ${samples.length} samples`;
  }

  function protoPredict(x) {
    if (!modelTrained || !Object.keys(prototypes).length) {
      return { label: null, confidences: {} };
    }
    if (!globalNorm) {
      return { label: null, confidences: {} };
    }

    const xNorm = applyGlobalNorm(x, globalNorm);

    const scores = {};
    let bestLabel = null;
    let bestScore = Infinity;

    for (const [label, { mean, variance }] of Object.entries(prototypes)) {
      let s = 0;
      const dim = Math.min(xNorm.length, mean.length);
      for (let i = 0; i < dim; i++) {
        const d = xNorm[i] - mean[i];
        s += (d * d) / variance[i];
      }
      scores[label] = s;
      if (s < bestScore) {
        bestScore = s;
        bestLabel = label;
      }
    }

    // convert distances to pseudo‑confidences
    const confidences = {};
    const invScores = Object.fromEntries(
      Object.entries(scores).map(([lab, s]) => [lab, 1 / (1 + s)]),
    );
    const sumInv = Object.values(invScores).reduce((a, b) => a + b, 0);
    for (const [lab, v] of Object.entries(invScores)) {
      confidences[lab] = v / sumInv;
    }

    return { label: bestLabel, confidences, distance: bestScore };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // C. AUDIO ENGINE WITH MIC TOGGLE
  // ──────────────────────────────────────────────────────────────────────────
  let audioContext = null;
  let analyser = null;
  let micActive = false;
  let micStatus = 'Microphone is OFF';
  let micStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let isUploading = false;

  async function addSampleFromBlob(audioBlob) {
    // --- authentication, same as in recordSample ---
    const v = currentValidator();
    if (useValidators) {
      if (!v) {
        alert('Please choose a validator');
        return;
      }
      if (typedPin !== v.pin) {
        validatorError = `Wrong code for ${v.name}`;
        return;
      }
    }
    validatorError = '';

    if (!audioContext) {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
    }

    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    source.start();

    await new Promise((resolve) => setTimeout(resolve, 300));

    const features = getAudioFeatures();
    source.stop();

    if (!features) {
      alert('Could not extract features from uploaded audio');
      return;
    }

    const id = nextSampleId++;

    samples = [
      ...samples,
      {
        id,
        x: features,
        y: selectedLabel,
        validatorId: v.id,
        audioBlob,
      },
    ];
    lastSaved = `✅ Uploaded sample for: ${selectedLabel} by ${v.name} (${v.role})`;
  }

  async function startMic() {
    if (micActive) {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      recordedChunks = [];
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      if (audioContext) await audioContext.close();
      micStream = null;
      audioContext = null;
      analyser = null;
      micActive = false;
      micStatus = 'Microphone is OFF';
      mediaRecorder = null;
      return;
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(micStream);
      source.connect(analyser);
      micActive = true;
      micStatus = '✅ Microphone is ON';

      // MediaRecorder for saving audio snippets
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(micStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };
    } catch (err) {
      console.error(err);
      micStatus = '❌ Microphone access denied';
    }
  }

  function getAudioFeatures() {
    if (!analyser) return null;
    const frames = [];
    const frameCount = 8; // 8 frames over ~1 s

    for (let i = 0; i < frameCount; i++) {
      const data = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(data);
      let slice = Array.from(data.slice(0, 40));

      // 1) convert to magnitudes and compress
      slice = slice.map((v) => {
        const mag = Math.pow(10, v / 20);
        return Math.log1p(mag);
      });

      // 1a) simple energy-based silence filtering
      const energy =
        slice.reduce((sum, v) => sum + Math.abs(v), 0) / slice.length;
      if (energy < 0.01) {
        // likely silence / very low energy; abort feature extraction
        return null;
      }

      // 2) normalize per frame (zero mean, unit variance)
      const mean =
        slice.reduce((sum, v) => sum + v, 0) / slice.length;
      let varSum = 0;
      for (const v of slice) {
        const d = v - mean;
        varSum += d * d;
      }
      const std = Math.sqrt(varSum / slice.length) || 1e-6;
      slice = slice.map((v) => (v - mean) / std);

      frames.push(slice);
    }

    // 3) average frames to get one feature vector
    const feat = new Array(frames[0].length).fill(0);
    frames.forEach((f) => f.forEach((v, i) => (feat[i] += v)));
    for (let i = 0; i < feat.length; i++) feat[i] /= frames.length;

    return feat;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // D. CLASSES, PERSONALIZATION & VALIDATOR ROLES
  // ──────────────────────────────────────────────────────────────────────────
  let classes = ['door_knock', 'alarm', 'baby_cry', 'name_call'];
  let selectedLabel = 'door_knock';
  let lastSaved = '';

  // validator accounts: who is labeling for the user
  let validators = [
    { id: 1, name: 'Friend 1', role: 'friend', pin: '1111' },
    { id: 2, name: 'Family 1', role: 'family', pin: '2222' },
  ];

  let selectedValidatorId = 1;
  let typedPin = '';
  let validatorError = '';

  let useValidators = true;

  function currentValidator() {
    return validators.find((v) => v.id === selectedValidatorId) || null;
  }

  // NEW: derived auth flag
  let isAuthenticated = false;
  $: {
    if (!useValidators) {
      isAuthenticated = true;
    } else {
      const v = currentValidator();
      isAuthenticated = !!v && typedPin === v?.pin;
    }
  }

  let contexts = ['home', 'university', 'night', 'with_baby'];
  let currentContext = 'home';

  function validatorLabel(id) {
    const v = validators.find((vv) => vv.id === id);
    return v ? `${v.name} (${v.role})` : 'unknown';
  }

  let activeByContext = {
    home: { door_knock: true, alarm: true, baby_cry: true, name_call: true },
    university: { door_knock: true, alarm: false, baby_cry: false, name_call: true },
    night: { door_knock: false, alarm: true, baby_cry: true, name_call: false },
    with_baby: { door_knock: true, alarm: true, baby_cry: true, name_call: false },
  };

  let sensitivity = 60; // percent

  function toggleClassActive(ctx, cls) {
    activeByContext = {
      ...activeByContext,
      [ctx]: {
        ...activeByContext[ctx],
        [cls]: !activeByContext[ctx][cls],
      },
    };
  }

  function isClassActiveInContext(ctx, cls) {
    return activeByContext[ctx]?.[cls] ?? false;
  }

  // class editor state
  let newClassName = '';
  let classToRename = '';
  let renameTo = '';

  function addClass() {
    const name = newClassName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name || classes.includes(name)) return;
    classes = [...classes, name];

    activeByContext = {
      ...activeByContext,
      home: { ...activeByContext.home, [name]: true },
      university: { ...activeByContext.university, [name]: true },
      night: { ...activeByContext.night, [name]: true },
      with_baby: { ...activeByContext.with_baby, [name]: true },
    };
    newClassName = '';
  }

  function deleteClass(name) {
    if (!confirm(`Delete class "${name}" and its samples?`)) return;
    classes = classes.filter((c) => c !== name);

    const ctxs = ['home', 'university', 'night', 'with_baby'];
    const updated = { ...activeByContext };
    ctxs.forEach((ctx) => {
      const { [name]: _, ...rest } = updated[ctx];
      updated[ctx] = rest;
    });
    activeByContext = updated;

    samples = samples.filter((s) => s.y !== name);
    if (selectedLabel === name) selectedLabel = classes[0] || '';
  }

  function renameClass() {
    const from = classToRename;
    const to = renameTo.trim().toLowerCase().replace(/\s+/g, '_');
    if (!from || !to || from === to) return;
    if (classes.includes(to)) {
      alert('Class with this name already exists');
      return;
    }
    classes = classes.map((c) => (c === from ? to : c));

    const ctxs = ['home', 'university', 'night', 'with_baby'];
    const updated = { ...activeByContext };
    ctxs.forEach((ctx) => {
      const value = updated[ctx][from];
      const { [from]: _, ...rest } = updated[ctx];
      updated[ctx] = { ...rest, [to]: value };
    });
    activeByContext = updated;

    samples = samples.map((s) => (s.y === from ? { ...s, y: to } : s));
    if (selectedLabel === from) selectedLabel = to;
    classToRename = '';
    renameTo = '';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // E. LABEL + RECORDING  (LOCAL FOR NOW)
  // ──────────────────────────────────────────────────────────────────────────
  async function recordSample() {
    const v = currentValidator();
    if (!v) {
      alert('Please choose a validator');
      return;
    }
    if (typedPin !== v.pin) {
      validatorError = `Wrong code for ${v.name}`;
      return;
    }
    validatorError = '';

    if (!micActive) {
      alert('Please start the microphone first!');
      return;
    }
    if (!mediaRecorder) {
      alert('Recorder not ready');
      return;
    }

    // If already recording, stop and save the sample
    if (isRecording) {
      mediaRecorder.stop();
      isRecording = false;

      await new Promise((resolve) => {
        mediaRecorder.onstop = () => resolve();
      });

      const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });

      const features = getAudioFeatures();
      if (!features) {
        alert('Could not read audio features!');
        return;
      }

      const id = nextSampleId++;

      samples = [
        ...samples,
        {
          id,
          x: features,
          y: selectedLabel,
          validatorId: currentValidator()?.id ?? null,
          audioBlob,
        },
      ];

      const v2 = currentValidator();
      lastSaved = v2
        ? `✅ Saved sample for: ${selectedLabel} by ${v2.name} (${v2.role})`
        : `✅ Saved sample for: ${selectedLabel}`;

      return;
    }

    // If not recording yet, start
    recordedChunks = [];
    mediaRecorder.start();
    isRecording = true;
    lastSaved = '🎙️ Recording... click again to stop';
  }

  function deleteSample(id) {
    samples = samples.filter((s) => s.id !== id);
  }

  function changeSampleLabel(id, newLabel) {
    samples = samples.map((s) => (s.id === id ? { ...s, y: newLabel } : s));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F. LIVE PREDICTION
  // ──────────────────────────────────────────────────────────────────────────
  let listening = false;
  let predictionInterval = null;
  let currentPrediction = '';
  let currentConfidence = 0;
  let currentDetections = []; // each: { label, confidence }

  let lastEvent = null; // { id, label, confidence, timestamp }
  let feedbackLog = []; // array of feedback objects
  let feedbackMode = null; // 'relabel' | null
  let relabelClass = classes[0];
  let lastFeedbackType = null; // 'correct' | 'wrong_label' | 'false_alarm' | null
  let feedbackStatus = ''; // short text shown after feedback

  let predictionHistory = [];
  const HISTORY_SIZE = 5;

  // minimum confidence (%) for any label to be considered
  const MIN_CONFIDENCE = 40;
  // minimum difference (%) between best and second-best to trust a label
  const MARGIN = 40;

  function startListening() {
    if (!modelTrained) {
      alert('Please prepare/train the model first!');
      return;
    }
    if (!micActive) {
      alert('Please start the microphone first!');
      return;
    }
    if (listening) return;
    listening = true;

    predictionInterval = setInterval(() => {
      const features = getAudioFeatures();
      if (!features) return;

      const result = protoPredict(features);
      if (!result.label) {
        currentDetections = [];
        currentPrediction = '';
        currentConfidence = 0;
        return;
      }

      const confs = result.confidences || {};
      const entries = Object.entries(confs);
      if (entries.length === 0) {
        currentDetections = [];
        currentPrediction = '';
        currentConfidence = 0;
        return;
      }

      // sort by confidence descending
      entries.sort((a, b) => b[1] - a[1]);
      const [bestLabelRaw, bestProb] = entries[0];
      const bestConf = bestProb * 100;
      const secondProb = entries[1]?.[1] ?? 0;
      const secondConf = secondProb * 100;
      const margin = bestConf - secondConf;

      // If best is too low or not clearly ahead, treat as uncertain
      if (bestConf < MIN_CONFIDENCE || margin < MARGIN) {
        currentDetections = [];
        currentPrediction = '';
        currentConfidence = 0;
        return;
      }

      const detected = Object.entries(confs)
        .filter(([lab, p]) => {
          const pct = p * 100;
          return isClassActiveInContext(currentContext, lab) && pct >= sensitivity;
        })
        .map(([lab, p]) => ({
          label: lab,
          confidence: Math.round(p * 100),
        }));

      currentDetections = detected;

      feedbackStatus = '';

      // keep old single-output vars for compatibility (highest one)
      if (detected.length > 0) {
        const best = detected.reduce((a, b) =>
          b.confidence > a.confidence ? b : a,
        );

        // --- temporal smoothing over recent labels ---
        predictionHistory.push(best.label);
        if (predictionHistory.length > HISTORY_SIZE) {
          predictionHistory.shift();
        }
        const counts = {};
        predictionHistory.forEach((lab) => {
          counts[lab] = (counts[lab] || 0) + 1;
        });
        const [smoothedLabel] = Object.entries(counts).sort(
          (a, b) => b[1] - a[1],
        )[0];

        currentPrediction = smoothedLabel;
        currentConfidence = best.confidence; // keep latest confidence

        const now = Date.now();
        lastEvent = {
          id: now,
          label: smoothedLabel,
          confidence: best.confidence,
          timestamp: now,
          features,
        };
      } else {
        currentPrediction = '';
        currentConfidence = 0;
        currentDetections = [];
        lastEvent = null;
        predictionHistory = [];
      }
    }, 1000);
  }

  function stopListening() {
    listening = false;
    clearInterval(predictionInterval);
    currentPrediction = '';
    currentConfidence = 0;
    currentDetections = [];
  }

  function giveFeedback(type) {
    if (!lastEvent) return;

    lastFeedbackType = type;

    if (type === 'correct') {
      feedbackLog = [...feedbackLog, { ...lastEvent, feedback: 'correct' }];
      feedbackMode = null;
      feedbackStatus = '✅ Marked as correct';
      return;
    }
    if (type === 'false_alarm') {
      feedbackLog = [...feedbackLog, { ...lastEvent, feedback: 'false_alarm' }];
      feedbackMode = null;
      feedbackStatus = '🚫 Marked as false alarm';
      return;
    }
    if (type === 'wrong_label') {
      feedbackMode = 'relabel';
      relabelClass = classes[0];
      feedbackStatus = '❌ Please choose the correct class';
    }
  }

  function submitRelabel() {
    if (!lastEvent || !relabelClass) return;

    // 1) log feedback
    feedbackLog = [
      ...feedbackLog,
      { ...lastEvent, feedback: 'relabel', actual: relabelClass },
    ];
    feedbackMode = null;
    lastFeedbackType = 'wrong_label';

    // 2) add a corrected training sample (if we have features)
    if (lastEvent.features) {
      const id = nextSampleId++;
      samples = [
        ...samples,
        {
          id,
          x: lastEvent.features,
          y: relabelClass,
          validatorId: currentValidator()?.id ?? null,
          audioBlob: null,
        },
      ];
      lastSaved = `✅ Added corrected sample as ${relabelClass.replace(/_/g, ' ')}`;
      feedbackStatus = `✅ Saved relabel as ${relabelClass.replace(/_/g, ' ')}`;
    }
  }
</script>

<main>
  <h1>Context-Aware Personalized Sound Classifier</h1>

  <!-- Tabs -->
  <div class="tabs">
  {#each tabs as tab}
    <button
      class:active={activeTab === tab.id}
      on:click={() => (activeTab = tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

  <!-- TAB 1: Personalization -->
  {#if activeTab === 'personalization'}
    <section class="card">
      <h2>Select your current context and how sensitive alerts should be.</h2>
       <div class="personalization-row">
    <div class="personalization-labels">
      <div>Context:</div>
      
      <div>Sensitivity (alert threshold):</div>
    </div>
    

    <div class="personalization-controls">
      <div>
        <select bind:value={currentContext}>
          {#each contexts as ctx}
            <option value={ctx}>{ctx.replace('_', ' ').toUpperCase()}</option>
          {/each}
        </select>
      </div>

      <div class="sensitivity-control">
        
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          bind:value={sensitivity}
        />
        <span>{sensitivity}%</span>
      </div>
    </div>
  </div>

 
      
    </section>
  {/if}

  <!-- TAB 2: Microphone & Samples -->
  {#if activeTab === 'recording'}
    <section class="card">
      <h2>1. To start catching signal turn on the Microphone</h2>
      <div class="mic-row">
  <span class="mic-label">Microphone</span>

  <button
    class="mic-toggle"
    class:on={micActive}
    on:click={startMic}
    aria-pressed={micActive}
  >
    <span class="mic-knob"></span>
  </button>

  <span class="mic-status-text">
    {micActive ? 'ON' : 'OFF'}
  </span>
</div>


    </section>

 <section class="card">
  <h2>2. Record Sound Samples</h2>
  



  <div class="record-top-row">
    <div class="record-field">
      <span class="record-label"> Sound class</span>
      <select bind:value={selectedLabel}>
        {#each classes as cls}
          <option value={cls}>{cls.replace(/_/g, ' ')}</option>
        {/each}
      </select>
    </div>

    <div class="record-field">
      <span class="record-label"> Validator</span>
      <select bind:value={selectedValidatorId} disabled={!useValidators}>
        {#each validators as v}
          <option value={v.id}>
            {v.name} ({v.role})
          </option>
        {/each}
      </select>
    </div>
  </div>
<div style="margin-top:2rem;">
    <label>
      <input
        type="checkbox"
        bind:checked={useValidators}
        style="margin-right:0.4rem;"
      />
      Enable validators (friends / family label sounds)
    </label>
  </div>
  {#if useValidators}

    <div class="record-code-row">
    
      <span class="record-label">Enter a valid validator code to enable upload</span>
      <input
        type="password"
        bind:value={typedPin}
        class="record-code-input"
      />
    </div>
    {#if validatorError}
      <p class="record-error">
        {validatorError}
      </p>
    {/if}
  {/if}

  <div class="record-actions-row">
  <p>Start the recording</p>
    <button class="record-button" on:click={recordSample}>
      {isRecording ? '⏹ Stop Recording' : '⏺ Start Recording'}
    </button>
    
  </div>

  <div class="upload-row">
    <div class="upload-left">
      <span class="upload-label">Or upload a sound file</span>
      <label class="upload-input">
        <span class="upload-button">Browse…</span>
        <input
          type="file"
          accept="audio/*"
          disabled={useValidators && !isAuthenticated}
          on:change={(event) => {
            const input = event.currentTarget;
            if (!input) return;

            const file = input.files && input.files[0];
            if (!file) return;

            isUploading = true;

            addSampleFromBlob(file)
              .catch((err) => {
                console.error(err);
                alert('Error while processing uploaded audio');
              })
              .finally(() => {
                isUploading = false;
                try {
                  input.value = '';
                } catch (e) {
                  // ignore if already detached
                }
              });
          }}
        />
      </label>
      <span class="upload-filename">No file selected</span>
    </div>

    <div class="upload-right">
      {#if !isAuthenticated}
        
      {:else if isUploading}
        <span class="upload-hint">
          Processing upload…
        </span>
      {/if}
    </div>
  </div>

  <p>{lastSaved}</p>
  <p>Total samples saved (locally): <strong>{sampleCount}</strong></p>
</section>


    <section class="card">
      <h2>2a. Recorded Samples</h2>
      {#if samples.length === 0}
        <p>No samples recorded yet.</p>
      {:else}
        <table border="1" cellpadding="4" cellspacing="0">
          <thead>
            <tr>
              <th>ID</th>
              <th>Class</th>
              <th>Validator</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each samples as s}
              <tr>
                <td>{s.id}</td>
                <td>{s.y.replace(/_/g, ' ')}</td>
                <td>{validatorLabel(s.validatorId)}</td>
                <td>
                  {#if s.audioBlob}
                    <audio
                      src={URL.createObjectURL(s.audioBlob)}
                      controls
                      style="max-width:200px; display:block; margin-bottom:0.3rem;"
                    ></audio>
                  {/if}
                  <button on:click={() => deleteSample(s.id)}>
                    Delete
                  </button>
                  <select
                    on:change={(e) =>
                      changeSampleLabel(s.id, e.target.value)
                    }
                    style="margin-left:0.5rem;"
                  >
                    {#each classes as cls}
                      <option value={cls} selected={cls === s.y}>
                        {cls.replace(/_/g, ' ')}
                      </option>
                    {/each}
                  </select>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}

  <!-- TAB 3: Class Manager -->
  {#if activeTab === 'classes'}
    <section class="card">
      <h2>Class Manager (per context)</h2>
      <p>
        Activate or deactivate sound classes for each context. You can also add,
        rename, or delete classes.
      </p>

      <!-- Add new class -->
      <div style="margin-bottom:0.5rem;">
        <input
          placeholder="New class name (e.g., kettle)"
          bind:value={newClassName}
          style="padding:0.3rem; width:60%;"
        />
        <button on:click={addClass} style="margin-left:0.5rem;">
          Add Class
        </button>
      </div>

      <!-- Rename class -->
      <div style="margin-bottom:0.5rem;">
        <label>
          Rename:
          <select bind:value={classToRename}>
            <option value=''>-- choose class --</option>
            {#each classes as cls}
              <option value={cls}>{cls.replace(/_/g, ' ')}</option>
            {/each}
          </select>
        </label>
        <input
          placeholder="New name"
          bind:value={renameTo}
          style="padding:0.3rem; margin-left:0.5rem;"
        />
        <button on:click={renameClass} style="margin-left:0.5rem;">
          Rename
        </button>
      </div>

      <table border="1" cellpadding="4" cellspacing="0">
        <thead>
          <tr>
            <th>Class</th>
            {#each contexts as ctx}
              <th>{ctx.replace('_', ' ')}</th>
            {/each}
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {#each classes as cls}
            <tr>
              <td>{cls.replace('_', ' ')}</td>

              {#each contexts as ctx}
                <td style="text-align:center;">
                  <input
                    type="checkbox"
                    checked={isClassActiveInContext(ctx, cls)}
                    on:change={() => toggleClassActive(ctx, cls)}
                  />
                </td>
              {/each}

              <td style="text-align:center;">
                <button
                  on:click={() => deleteClass(cls)}
                  title="Delete this class"
                  class="delete-btn"
                >
                  🗑
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <!-- TAB 4: Model & Live Prediction -->
  {#if activeTab === 'model'}
    <section class="card">
      <h2>Prepare the Model</h2>
      <p>This uses your locally recorded samples to build the KNN model.</p>
      <button on:click={trainModel}>Prepare Model</button>
      <p>{trainStatus}</p>
    </section>

    <section class="card">
      <h2>Live Prediction</h2>
      <p>
        Start listening to see what the system detects, filtered by your
        context and sensitivity.
      </p>

      {#if !listening}
        <button on:click={startListening}>▶ Start Listening</button>
      {:else}
        <button on:click={stopListening} style="background:#dc2626">
          ⏹ Stop Listening
        </button>
      {/if}

      {#if currentDetections.length}
        <div class="prediction-box">
          <h3>Detected sounds</h3>
          <ul>
            {#each currentDetections as d}
              <li>
                {d.label.replace(/_/g, ' ').toUpperCase()} – {d.confidence}%
              </li>
            {/each}
          </ul>
          <div class="pred-context">
            Context: {currentContext.replace('_', ' ').toUpperCase()}
          </div>
        </div>
      {/if}

      {#if lastEvent}
        <div style="margin-top:1rem;">
          <p>
            Was this alarm correct for
            <strong>{lastEvent.label.replace(/_/g, ' ')}</strong>?
          </p>
          <button on:click={() => giveFeedback('correct')}>
            ✅ Correct
          </button>
          <button
            on:click={() => giveFeedback('wrong_label')}
            style="margin-left:0.5rem;"
          >
            ❌ Wrong label
          </button>
          <button
            on:click={() => giveFeedback('false_alarm')}
            style="margin-left:0.5rem;"
          >
            🚫 False alarm
          </button>

          {#if feedbackMode === 'relabel'}
            <div style="margin-top:0.5rem;">
              <label>
                Actual class:
                <select bind:value={relabelClass} style="margin-left:0.5rem;">
                  {#each classes as cls}
                    <option value={cls}>{cls.replace(/_/g, ' ')}</option>
                  {/each}
                </select>
              </label>
              <button on:click={submitRelabel} style="margin-left:0.5rem;">
                Save feedback
              </button>
            </div>
          {/if}

          {#if feedbackStatus}
            <p style="margin-top:0.5rem; color:#16a34a;">
              {feedbackStatus}
            </p>
          {/if}
        </div>
      {/if}
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 900px;
    margin: 2rem auto;
    font-family: sans-serif;
    padding: 1rem 1.5rem 2.5rem;
  
  }

  h1 {
    margin-bottom: 5rem;
    font-size:24px;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 1rem;
  }

  .tabs button {
    border: none;
    background: transparent;
    padding: 0.5rem 0.9rem;
    font-weight: 300;
    cursor: pointer;
    border-radius: 0.5rem 0.5rem 0 0;
    color: #4b5563;
  }
  .tabs button:hover {
    color: #45546b;
	background: #cae6f9;
}

  .tabs button.active {
    background: transparent;
    border: 1px solid #e5e7eb;
    border-bottom-color: #ffffff;
    font-weight: 600;
    color: #111827;
  }

  .card {
    background: #ffffff;
    border-radius: 0.75rem;
    padding: 1.25rem 1.5rem;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.06);
    border: 1px solid rgba(148, 163, 184, 0.3);
    margin-bottom: 1rem;
  }

  button {
    padding: 0.5rem 1.2rem;
    margin: 0.3rem 0;
    cursor: pointer;
    background: #4f46e5;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
  }

  select {
    padding: 0.4rem;
    font-size: 1rem;
    margin-left: 0.5rem;
  }

  input[type='range'] {
    vertical-align: middle;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.5rem;
  }

  th,
  td {
    padding: 0.3rem 0.4rem;
  }

  th {
    background: #f3f4f6;
  }

  .prediction-box {
    margin-top: 1rem;
    padding: 1.5rem;
    background: #f0fdf4;
    border: 2px solid #16a34a;
    border-radius: 10px;
    text-align: center;
  }

  .pred-context {
    color: #1f2937;
    margin-top: 0.3rem;
  }

  .delete-btn {
    background: #dc2626;
    border: none;
    border-radius: 50%;
    width: 2rem;
    height: 2rem;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: white;
    cursor: pointer;
  }

  .delete-btn:hover {
    background: #b91c1c;
  }
</style>
