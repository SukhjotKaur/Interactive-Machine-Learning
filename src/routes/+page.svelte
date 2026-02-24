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
  let samples = []; // each: { x: number[], y: string, validator: string }
  $: sampleCount = samples.length;

  let k = 3;
  let modelTrained = false;
  let trainStatus = 'Model not trained yet';

  function trainModel() {
    if (samples.length < 2) {
      modelTrained = false;
      trainStatus = '❌ Need at least 2 samples';
      return;
    }
    modelTrained = true;
    trainStatus = `✅ Model ready with ${samples.length} samples`;
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

  function knnPredict(x) {
    if (!modelTrained || samples.length === 0) {
      return { label: null, confidences: {} };
    }

    const dists = samples.map((s, idx) => ({
      idx,
      dist: euclideanDistance(x, s.x),
    }));
    dists.sort((a, b) => a.dist - b.dist);

    const kUsed = Math.min(k, dists.length);
    const votes = {};
    for (let i = 0; i < kUsed; i++) {
      const label = samples[dists[i].idx].y;
      votes[label] = (votes[label] || 0) + 1;
    }

    let bestLabel = null;
    let bestVotes = -1;
    for (const [lab, v] of Object.entries(votes)) {
      if (v > bestVotes) {
        bestVotes = v;
        bestLabel = lab;
      }
    }

    const confidences = {};
    for (const [lab, v] of Object.entries(votes)) {
      confidences[lab] = v / kUsed;
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

  async function startMic() {
    if (micActive) {
      // Turn off
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      if (audioContext) await audioContext.close();
      micStream = null;
      audioContext = null;
      analyser = null;
      micActive = false;
      micStatus = 'Microphone is OFF';
      return;
    }

    // Turn on
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(micStream);
      source.connect(analyser);
      micActive = true;
      micStatus = '✅ Microphone is ON';
    } catch (err) {
      console.error(err);
      micStatus = '❌ Microphone access denied';
    }
  }

  function getAudioFeatures() {
    if (!analyser) return null;
    const data = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(data);
    return Array.from(data.slice(0, 40));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // D. CLASSES, PERSONALIZATION & VALIDATOR ROLES
  // ──────────────────────────────────────────────────────────────────────────
  let classes = ['door_knock', 'alarm', 'baby_cry', 'name_call'];
  let selectedLabel = 'door_knock';
  let lastSaved = '';

  // validator roles
  let validators = ['friend', 'family', 'colleague', 'self'];
  let selectedValidator = 'friend';

  let contexts = ['home', 'university', 'night', 'with_baby'];
  let currentContext = 'home';

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
    if (!micActive) {
      alert('Please start the microphone first!');
      return;
    }

    const features = getAudioFeatures();
    if (!features) {
      alert('Could not read audio features!');
      return;
    }

    samples = [
      ...samples,
      {
        x: features,
        y: selectedLabel,
        validator: selectedValidator,
      },
    ];
    lastSaved = `✅ Saved sample for: ${selectedLabel} (${selectedValidator})`;

    /*
    // TODO when backend works: replace with shared dataset
    await initStore();
    const instance = {
      x: { features },
      y: selectedLabel,
      team,
      public: true,
      validator: selectedValidator,
    };
    await trainingSet.create(instance);
    lastSaved = `✅ Saved sample for: ${selectedLabel} (${selectedValidator}) (team ${team})`;
    */
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F. LIVE PREDICTION
  // ──────────────────────────────────────────────────────────────────────────
  let listening = false;
  let predictionInterval = null;
  let currentPrediction = '';
  let currentConfidence = 0;

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

      const result = knnPredict(features);
      const label = result.label;
      if (!label) {
        currentPrediction = '';
        currentConfidence = 0;
        return;
      }
      const conf = (result.confidences[label] ?? 0) * 100;

      const active = isClassActiveInContext(currentContext, label);
      const passesThreshold = conf >= sensitivity;

      if (active && passesThreshold) {
        currentPrediction = label;
        currentConfidence = Math.round(conf);
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
      <select bind:value={selectedValidator}>
        {#each validators as v}
          <option value={v}>{v.toUpperCase()}</option>
        {/each}
      </select>
    </label>

    <br /><br />
    <button on:click={recordSample}>⏺ Record Sample</button>
    <p>{lastSaved}</p>
    <p>Total samples saved (local): <strong>{sampleCount}</strong></p>
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

    {#if currentPrediction}
      <div class="prediction-box">
        <div class="pred-label">{currentPrediction.replace(/_/g, ' ').toUpperCase()}</div>
        <div class="pred-confidence">Confidence: {currentConfidence}%</div>
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
