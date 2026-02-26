# ~TODO~

> A [Marcelle](https://marcelle.dev) Application

## Available Scripts

### npm run dev

Runs the app in the development mode.
Open http://localhost:5173 to view it in the browser.

The page will reload if you make edits.

### npm run build

Builds a static copy of your site to the `dist/` folder.
Your app is ready to be deployed!

How to run the app
Install Node.js

Install a recent LTS version of Node.js from https://nodejs.org.
​

Download the project

Put all project files (including package.json, src, etc.) in a folder, for example sound-classifier.

Install dependencies

Open a terminal in that folder and run:

bash
npm install
This installs all packages listed in package.json.
​

Start the development server

In the same folder, run:

bash
npm run dev -- --open
or, if --open isn’t configured:

bash
npm run dev
Then open the URL printed in the terminal (usually http://localhost:5173 or http://localhost:8080) in a browser.

Use the interface

Step 1: Click “Start Microphone” and allow mic access in the browser.

Step 2: Choose a sound class and validator, enter the validator code, then click “Start Recording” / “Stop Recording” to record examples.

Step 3: Click “🧠 Prepare Model” to train on your recorded samples.

Step 4: Click “Start Listening” to enable live predictions.

When an alarm appears, use the Correct / Wrong label / False alarm buttons to give feedback.

Stop the app

In the terminal, press Ctrl + C to stop the dev server.
