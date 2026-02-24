// src/lib/marcelle/index.js
import '@marcellejs/core/dist/marcelle.css';
import {
  microphone,
  mediaRecorder,
  dataset,
  dataStore,
  textInput,
  button,
  slider,
  select,
  store,
} from '@marcellejs/core';

/* 1. DATA SOURCES */

export const mic = microphone();            // main input for all audio
export const recorder = mediaRecorder();    // used for recording training examples
recorder.$mediaStream = mic.$mediastream;  // connect mic to recorder

/* 2. CONTROLS FOR LABELLED EXAMPLES */

export const labelInput = textInput();
labelInput.title = 'Sound class name';

export const recordExample = button('Hold to record example');
recordExample.title = 'Press and hold while the sound is happening';

const storeBackend = dataStore('localStorage');
export const trainingSet = dataset('training-set-sounds', storeBackend);

/* Record when button is pressed */
recordExample.$pressed.subscribe((pressed) => {
  recorder.$active.set(pressed);
});

/* Save finished recordings into dataset */
recorder.$recordings
  .map((rec) => ({
    x: {
      blob: rec.blob,
      duration: rec.duration,
      type: rec.type,
    },
    y: labelInput.$value.value || 'unlabeled',
    thumbnail: rec.thumbnail || null,
  }))
  .subscribe(trainingSet.create);

/* 3. CONTEXT + SENSITIVITY STATE */

export const contexts = ['Home', 'University', 'Night', 'With Baby'];

export const contextSelector = select(contexts);
contextSelector.title = 'Context';
contextSelector.$value.set('Home');

export const sensitivitySlider = slider({
  min: 0,
  max: 1,
  step: 0.05,
  initial: 0.6,
});
sensitivitySlider.title = 'Sensitivity (threshold)';

/* 4. CLASS MANAGER STATE */

export const classesStore = store([
  {
    id: 'alarm',
    name: 'Alarm',
    activeByContext: { Home: true, University: false, Night: true, 'With Baby': true },
  },
  {
    id: 'baby',
    name: 'Baby Cry',
    activeByContext: { Home: false, University: false, Night: true, 'With Baby': true },
  },
]);

export function isClassActive(classId, context) {
  const cls = classesStore.value.find((c) => c.id === classId || c.name === classId);
  return cls ? cls.activeByContext[context] : false;
}

/* 5. LIVE LISTENING (placeholder – classifier later) */

export const liveRecorder = mediaRecorder();
liveRecorder.$mediaStream = mic.$mediastream;

export const startListening = button('Start listening');
export const stopListening = button('Stop listening');

startListening.title = 'Start continuous listening';
stopListening.title = 'Stop continuous listening';

startListening.$click.subscribe(() => liveRecorder.$active.set(true));
stopListening.$click.subscribe(() => liveRecorder.$active.set(false));

export const alertsStore = store([]); // we will push alerts here later
