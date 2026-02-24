// src/lib/marcelle/components/AlertWidget.js
import { component } from '@marcellejs/core';
import { alertsStore } from '..';

export function AlertWidget() {
  const cmp = component('alert-widget');

  cmp.mount = (el) => {
    el.innerHTML = '';
    el.style.border = '4px solid #f00';
    el.style.padding = '1rem';
    el.style.minHeight = '150px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';

    const text = document.createElement('div');
    text.style.fontSize = '2rem';
    text.style.fontWeight = 'bold';
    text.textContent = 'No alert';
    el.appendChild(text);

    const render = () => {
      const [latest] = alertsStore.value;
      if (!latest) {
        text.textContent = 'No alert';
        el.style.background = '#fff';
      } else {
        text.textContent = `${latest.label} (${Math.round(
          latest.confidence * 100,
        )}%)`;
        el.style.background = '#ffdddd';
      }
    };

    render();
    alertsStore.subscribe(render);
  };

  return cmp;
}
