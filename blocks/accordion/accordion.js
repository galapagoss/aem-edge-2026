import {
  buildBlock,
  decorateBlock,
  loadBlock,
} from '../../scripts/lib-franklin.js';
import { createElement } from '../../scripts/scripts.js';

const toggle = (item) => {
  const trigger = item.querySelector('.accordion-trigger');
  const panel = item.querySelector('.accordion-panel');
  const isOpen = trigger.getAttribute('aria-expanded') === 'true';
  trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  if (isOpen) {
    panel.setAttribute('hidden', '');
  } else {
    panel.removeAttribute('hidden');
  }
};

const buildSubAccordion = async (parentPanel, blockTable) => {
  const block = buildBlock('accordion', blockTable);
  block.classList.add('sub-accordion');
  parentPanel.append(block);
  decorateBlock(block);
  await loadBlock(block);
};

const buildSubAccordions = async (parentPanel) => {
  const blockTable = [];
  let row;
  [...parentPanel.children].forEach((child) => {
    if (child.nodeName === 'H3') {
      if (row) {
        blockTable.push([{ elems: row }]);
      }
      row = [];
    }

    if (row) {
      row.push(child);
    }
  });
  // add last row
  if (row) {
    blockTable.push([{ elems: row }]);
    await buildSubAccordion(parentPanel, blockTable);
  }
};

let accordionIndex = 0;
export default async function decorate(block) {
  block.dataset.accordionIndex = accordionIndex;
  accordionIndex += 1;
  const rows = [...block.children];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    row.classList.add('accordion-item');
    const panel = row.children[0];
    const buttonSelector = block.classList.contains('sub-accordion') ? 'h3' : 'h2';
    const header = panel.querySelector(buttonSelector);
    row.prepend(header);
    const headerText = header.textContent;
    header.innerHTML = '';
    const button = createElement('button', 'accordion-trigger', {
      'aria-expanded': 'false',
      'aria-controls': `accordion-panel-${block.dataset.accordionIndex}-${i}`,
      id: `accordion-${block.dataset.accordionIndex}-${i}`,
    }, createElement('span', 'accordion-title', {}, headerText));
    header.append(button);
    panel.classList.add('accordion-panel');
    panel.setAttribute('id', `accordion-panel-${block.dataset.accordionIndex}-${i}`);
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', `accordion-${block.dataset.accordionIndex}-${i}`);
    panel.setAttribute('hidden', '');
    // auto open first panel
    if (i === 0) toggle(row);

    button.addEventListener('click', () => {
      toggle(row);
    });

    // build sub-accordions from panel
    if (panel.querySelector(':scope > h3')) {
      // eslint-disable-next-line no-await-in-loop
      await buildSubAccordions(panel);
    }
  }
}