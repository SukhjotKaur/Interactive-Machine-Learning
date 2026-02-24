// src/lib/marcelle/components/ClassManager.js
import { component, checkbox, text } from '@marcellejs/core';
import { classesStore, contexts } from '..';

export function ClassManager() {
  const cmp = component('class-manager');

  cmp.mount = (el) => {
    el.innerHTML = ''; // simple manual DOM for now

    const title = document.createElement('h3');
    title.textContent = 'Class Manager';
    el.appendChild(title);

    const table = document.createElement('table');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th')).textContent = 'Class';

    contexts.forEach((ctx) => {
      const th = document.createElement('th');
      th.textContent = ctx;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    const renderRows = () => {
      // clear old rows
      while (table.rows.length > 1) table.deleteRow(1);

      classesStore.value.forEach((cls, idx) => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = cls.name;
        row.appendChild(nameCell);

        contexts.forEach((ctx) => {
          const cell = document.createElement('td');
          const cb = checkbox();
          cb.$checked.set(cls.activeByContext[ctx]);
          cb.title = `${cls.name} active in ${ctx}`;
          cb.$checked.subscribe((v) => {
            const all = [...classesStore.value];
            all[idx] = {
              ...all[idx],
              activeByContext: { ...all[idx].activeByContext, [ctx]: v },
            };
            classesStore.set(all);
          });
          cb.mount(cell);
          row.appendChild(cell);
        });

        table.appendChild(row);
      });
    };

    renderRows();
    classesStore.subscribe(renderRows);

    el.appendChild(table);
  };

  return cmp;
}
