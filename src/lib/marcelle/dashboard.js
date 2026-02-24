// import { dashboard } from '@marcellejs/core';
// import { capture, input, label, trainingSetBrowser } from '.';

// const dash = dashboard({
// 	title: 'Marcelle Example - Dashboard',
// 	author: 'Marcelle Pirates Crew',
// 	closable: true
// });

// dash.page('Data Management').sidebar(input).use([label, capture], trainingSetBrowser);

// export function showDashboard() {
// 	dash.show();
// }
// dashboard.js
import { dashboard } from '@marcellejs/core';
import { capture, input, label, trainingSetBrowser } from '.';

const dash = dashboard({
  title: 'Personalized Sound Dashboard',
  author: 'Your Name',
  closable: true,
});

dash
  .page('Data Management')
  .sidebar(input)              // microphone widget
  .use([label, capture], trainingSetBrowser);

export function showDashboard() {
  dash.show();
}
