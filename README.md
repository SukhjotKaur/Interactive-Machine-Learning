Context-Aware Personalized Sound Classifier

An interactive sound recognition prototype built with Marcelle and Svelte.

This application is designed specifically for Deaf or Hard-of-Hearing (DHH) users and their close circles. It allows users to define custom sound classes, record environmental examples, train a prototype-based model directly in the browser, and provide real-time feedback to refine predictions.
🚀 Quick Start
1. Prerequisites

Ensure you have a recent LTS version of Node.js installed.
Bash
node -v
npm -v

2. Installation

Clone the repository and install the dependencies:
Bash

cd sound-classifier
npm install

3. Run Development Server
Bash

npm run dev

Open http://localhost:5173 in your browser. The page will hot-reload as you make edits.
🛠 Features & Workflow
Step 1: Personalization

    Context Selection: Define your environment (e.g., Home, University, Night, With Baby).

    Sensitivity Control: Adjust the slider to determine how "cautious" the alerting system should be.

Step 2: Audio Capture & Management

    Live Recording: Toggle the microphone to capture real-world sounds (e.g., door knocks, alarms).

    Validation: Supports a "Validator" mode requiring a PIN code for verified sample entry.

    Sample Management: Play back, re-label, or delete recordings within the interface.

    File Upload: Supports importing existing audio files.

Step 3: In-Browser Training

    Model Preparation: Trains a prototype-based classifier using your local samples.

    Privacy First: All training happens locally in the browser; no audio data is sent to a server.

Step 4: Live Prediction & Feedback

    Real-time Recognition: Visual alerts appear when relevant sounds are detected.

    Active Learning: Refine the model on the fly:

        Correct: Validates the current model.

        Wrong Label: Allows you to re-assign the sound and add it to training data.

        False Alarm: Helps the model learn to ignore background noise.

🏗 Technology Stack

    Marcelle: For interactive Machine Learning components and pipeline management.

    Svelte + Vite: For a high-performance, reactive user interface.

    Web Audio API: Utilizes AudioContext, AnalyserNode, and MediaRecorder for client-side signal processing.

📝 Roadmap / TODO

    [ ] Robustness: Improve audio feature extraction for noisy environments/low-quality mics.

    [ ] Benchmarking: Compare the current prototype classifier against a KNN baseline.

    [ ] Persistence: Implement storage (IndexedDB/LocalStorage) for saved samples and trained models.

    [ ] Accessibility: Conduct a deep dive into ARIA labels, keyboard navigation, and screen reader compatibility.

    [ ] Evaluation: Execute planned human-centered trials with DHH users and validators.

Commands'	Description
npm run dev	Starts the local dev server at port 5173.
npm run build	Creates a production-ready static bundle in /dist.
npm run preview	Previews the production build locally.
