<script>
  import * as marcelle from '@marcellejs/core';
  import '@marcellejs/core/dist/marcelle.css';

  // ──────────────────────────────────────────────────────────────────────────
  // A. UNIVERSITY SHARED DATASTORE (DISABLED WHILE BACKEND IS DOWN)
  // ──────────────────────────────────────────────────────────────────────────
  /*
  const store = marcelle.dataStore('https://marcelle.lisn.upsaclay.fr/iml2026/api');

  let team = 'A'; // default; will be overwritten by store.user.team if available
  let storeReady = false;


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
  // B. SIMPLE MANUAL KNN (NO TF, LOCAL DATA)
  // ──────────────────────────────────────────────────────────────────────────
  let samples = []; // each: { id, x: number[], y: string, validator: string, audioBlob?: Blob }
  let nextSampleId = 1;
  $: sampleCount = samples.length;



  let k = 4;
  let modelTrained = false;
  let trainStatus = 'Model not trained yet';
  let prototypes = {}; // { className: { mean: number[], var: number[] , count: number } }

  function trainModel() {
    if (samples.length < 2) {
      modelTrained = false;
      trainStatus = '❌ Need at least 2 samples';
      return;
    }

    // group by class
    const byClass = {};
    for (const s of samples) {
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
        variance[i] = variance[i] / vecs.length || 1e-3; // avoid zero
      }

      prototypes[label] = { mean, variance, count: vecs.length };
    }

    modelTrained = true;
    trainStatus = `✅ Prototype model with ${samples.length} samples`;
  }

  function euclideanDistance(a, b) {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  function protoPredict(x) {
    if (!modelTrained || !Object.keys(prototypes).length) {
      return { label: null, confidences: {} };
    }

    const scores = {};
    let bestLabel = null;
    let bestScore = Infinity;

    for (const [label, { mean, variance }] of Object.entries(prototypes)) {
      let s = 0;
      const dim = Math.min(x.length, mean.length);
      for (let i = 0; i < dim; i++) {
        const d = x[i] - mean[i];
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

    return { label: bestLabel, confidences };
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
    if (!v) {
      alert('Please choose a validator');
      return;
    }
    if (typedPin !== v.pin) {
      validatorError = `Wrong code for ${v.name}`;
      return;
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
      analyser.getFloatFrequencyData(data); // values in dB (negative)
      let slice = Array.from(data.slice(0, 40));

      // 1) convert to magnitudes and compress (reduce effect of loudness)
      slice = slice.map((v) => {
        const mag = Math.pow(10, v / 20); // dB -> linear magnitude
        return Math.log1p(mag);          // log(1 + mag)
      });

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

  function currentValidator() {
    return validators.find((v) => v.id === selectedValidatorId) || null;
  }

  // NEW: derived auth flag
  let isAuthenticated = false;
  $: {
    const v = currentValidator();
    isAuthenticated = !!v && typedPin === v?.pin;
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
  //let samples = []; // each: { id, x: number[], y: string, validatorId: number, audioBlob?: Blob }
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
      
      const v = currentValidator();
      lastSaved = v
        ? `✅ Saved sample for: ${selectedLabel} by ${v.name} (${v.role})`
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
    samples = samples.map((s) =>
      s.id === id ? { ...s, y: newLabel } : s,
    );
  }


  // ──────────────────────────────────────────────────────────────────────────
  // F. LIVE PREDICTION
  // ──────────────────────────────────────────────────────────────────────────
  let listening = false;
  let predictionInterval = null;
  // old single-output state (kept for now but no longer used in UI)
  let currentPrediction = '';
  let currentConfidence = 0;
  // NEW: list of all detected sounds above threshold
  let currentDetections = []; // each: { label, confidence }
  // minimum confidence (%) for any label to be considered
  const MIN_CONFIDENCE = 40;
  // minimum difference (%) between best and second-best to trust a label
  const MARGIN = 20;


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

      // keep old single-output vars for compatibility (highest one)
      if (detected.length > 0) {
        const best = detected.reduce((a, b) =>
          b.confidence > a.confidence ? b : a,
        );
        currentPrediction = best.label;
        currentConfidence = best.confidence;
      } else {
        currentPrediction = '';
        currentConfidence = 0;
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

</script>

<main>
  <h1>🔊 Context-Aware Personalized Sound Classifier (Local)</h1>

  <!-- 0. Personalization -->
  <section>
    <h2>0. Personalization</h2>
    <p>Select your current context and how sensitive alerts should be.</p>

    <div style="margin-bottom:0.5rem;">
      <label>
        Context:
        <select bind:value={currentContext}>
          {#each contexts as ctx}
            <option value={ctx}>{ctx.replace('_', ' ').toUpperCase()}</option>
          {/each}
        </select>
      </label>
    </div>

    <div>
      <label>
        Sensitivity (alert threshold): {sensitivity}%
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          bind:value={sensitivity}
          style="margin-left:0.5rem;"
        />
      </label>
    </div>
  </section>

  <!-- 1. Microphone -->
  <section>
    <h2>1. Start Microphone</h2>
    <p>{micStatus}</p>
    <button on:click={startMic}>{micActive ? 'Stop Microphone' : 'Start Microphone'}</button>
  </section>

  <!-- 2. Record samples -->
  <section>
    <h2>2. Record Sound Samples</h2>
    <p>Make the sound, then click Record.</p>

    <label>
      Sound class:
      <select bind:value={selectedLabel}>
        {#each classes as cls}
          <option value={cls}>{cls.replace(/_/g, ' ')}</option>
        {/each}
      </select>
    </label>

    <label style="margin-left:1rem;">
      Validator:
      <select bind:value={selectedValidatorId}>
        {#each validators as v}
          <option value={v.id}>
            {v.name} ({v.role})
          </option>
        {/each}
      </select>
    </label>

    <div style="margin-top:0.5rem;">
      <label>
        Validator code:
        <input
          type="password"
          bind:value={typedPin}
          style="margin-left:0.5rem; width:6rem;"
        />
      </label>
      {#if validatorError}
        <p style="color:#dc2626; margin:0.2rem 0 0 0;">
          {validatorError}
        </p>
      {/if}
    </div>

    <br /><br />
    <button on:click={recordSample}>
      {isRecording ? '⏹ Stop Recording' : '⏺ Start Recording'}
    </button>

    <div style="margin-top:0.5rem;">
      <label>
        Or upload a sound file:
        <input
          type="file"
          accept="audio/*"
          disabled={!isAuthenticated}
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
          style="margin-left:0.5rem;"
        />

        {#if !isAuthenticated}
          <span style="margin-left:0.5rem; font-size:0.9rem; color:#6b7280;">
            Enter a valid validator code to enable upload
          </span>
        {:else if isUploading}
          <span style="margin-left:0.5rem; font-size:0.9rem;">Processing upload…</span>
        {/if}

    </div>

    <p>{lastSaved}</p>
    <p>Total samples saved (local): <strong>{sampleCount}</strong></p>
  </section>

  <!-- 2a. Recorded samples -->
  <section>
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
                  on:change={(e) => changeSampleLabel(s.id, e.target.value)}
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


  <!-- 2b. Class Manager -->
  <section>
    <h2>Class Manager (per context)</h2>
    <p>Activate or deactivate sound classes for each context. You can also add, rename, or delete classes.</p>

    <!-- Add new class -->
    <div style="margin-bottom:0.5rem;">
      <input
        placeholder="New class name (e.g., kettle)"
        bind:value={newClassName}
        style="padding:0.3rem; width:60%;"
      />
      <button on:click={addClass} style="margin-left:0.5rem;">Add Class</button>
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
      <button on:click={renameClass} style="margin-left:0.5rem;">Rename</button>
    </div>

    <table border="1" cellpadding="4" cellspacing="0">
      <thead>
        <tr>
          <th>Class</th>
          {#each contexts as ctx}
            <th>{ctx.replace('_', ' ')}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each classes as cls}
          <tr>
            <td>
              {cls.replace('_', ' ')}
              <button
                on:click={() => deleteClass(cls)}
                style="margin-left:0.5rem; background:#dc2626;"
              >
                ✖
              </button>
            </td>
            {#each contexts as ctx}
              <td style="text-align:center;">
                <input
                  type="checkbox"
                  checked={isClassActiveInContext(ctx, cls)}
                  on:change={() => toggleClassActive(ctx, cls)}
                />
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <!-- 3. "Train" -->
  <section>
    <h2>3. Prepare the Model</h2>
    <p>This uses your locally recorded samples to build the KNN model.</p>
    <button on:click={trainModel}>🧠 Prepare Model</button>
    <p>{trainStatus}</p>
  </section>

  <!-- 4. Live prediction -->
  <section>
    <h2>4. Live Prediction</h2>
    <p>Start listening to see what the system detects, filtered by your context and sensitivity.</p>

    {#if !listening}
      <button on:click={startListening}>▶ Start Listening</button>
    {:else}
      <button on:click={stopListening} style="background:#dc2626">⏹ Stop Listening</button>
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

  </section>
</main>

<style>
  main {
    max-width: 700px;
    margin: 2rem auto;
    font-family: sans-serif;
    padding: 1rem;
  }
  section {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }
  h2 {
    margin-top: 0;
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
  .prediction-box {
    margin-top: 1rem;
    padding: 1.5rem;
    background: #f0fdf4;
    border: 2px solid #16a34a;
    border-radius: 10px;
    text-align: center;
  }
  .pred-label {
    font-size: 2rem;
    font-weight: bold;
    color: #15803d;
  }
  .pred-confidence {
    color: #166534;
    margin-top: 0.5rem;
  }
  .pred-context {
    color: #1f2937;
    margin-top: 0.3rem;
  }
</style>
