// src/lib/marcelle/components/dashboard.js
import { dashboard, datasetBrowser } from '@marcellejs/core';
import {
  mic,
  labelInput,
  recordExample,
  trainingSet,
  contextSelector,
  sensitivitySlider,
  startListening,
  stopListening,
} from '..';
import { ClassManager } from './ClassManager';
import { AlertWidget } from './AlertWidget';
import { LiveMonitor } from './LiveMonitor';

const dash = dashboard({
  title: 'Context-Aware Personalized Sound Classifier',
  author: 'Your Name',
  closable: false,
});

const trainingSetView = datasetBrowser(trainingSet);

/* Page 1: data + classes */
dash
  .page('Data & Classes')
  .sidebar(mic, contextSelector, sensitivitySlider)
  .use([ClassManager()], [labelInput, recordExample, trainingSetView]);

/* Page 2: live alerts */
dash
  .page('Live Alerts')
  .sidebar(startListening, stopListening)
  .use([LiveMonitor()], AlertWidget());

export function showDashboard() {
  dash.show();
}
