// src/lib/marcelle/components/LiveMonitor.js
import { component } from '@marcellejs/core';
import { alertsStore } from '..';

export function LiveMonitor() {
  const cmp = component('live-monitor');

  cmp.mount = (el) => {
    el.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = 'Recent alerts';
    el.appendChild(title);

    const list = document.createElement('ul');
    el.appendChild(list);

    const render = () => {
      list.innerHTML = '';
      alertsStore.value.forEach((a) => {
        const li = document.createElement('li');
        li.textContent = `${new Date(a.time).toLocaleTimeString()} - ${a.context} - ${
          a.label
        } (${Math.round(a.confidence * 100)}%)`;
        list.appendChild(li);
      });
    };

    render();
    alertsStore.subscribe(render);
  };

  return cmp;
}
