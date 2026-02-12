import { createElement } from '../../scripts/scripts.js';
import { loadCSS } from '../../scripts/aem.js';

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

/**
 * Loads JS and CSS for a block.
 * @param {Element} block The block element
 */
const loadBlock = async (block) => {
  const status = block.dataset.blockStatus;
  if (status !== 'loading' && status !== 'loaded') {
    block.dataset.blockStatus = 'loading';
    const { blockName } = block.dataset;
    try {
      const cssLoaded = new Promise((resolve) => {
        loadCSS(`${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`, resolve);
      });
      const decorationComplete = new Promise((resolve) => {
        (async () => {
          try {
            const mod = await import(`../blocks/${blockName}/${blockName}.js`);
            if (mod.default) {
              await mod.default(block);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log(`failed to load module for ${blockName}`, error);
          }
          resolve();
        })();
      });
      await Promise.all([cssLoaded, decorationComplete]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(`failed to load block ${blockName}`, error);
    }
    block.dataset.blockStatus = 'loaded';
  }
};

/**
 * Builds a block DOM Element from a two dimensional array, string, or object
 * @param {string} blockName name of the block
 * @param {*} content two dimensional array or string or object of content
 */
const buildBlock = (blockName, content) => {
  const table = Array.isArray(content) ? content : [[content]];
  const blockEl = document.createElement('div');
  // build image block nested div structure
  blockEl.classList.add(blockName);
  table.forEach((row) => {
    const rowEl = document.createElement('div');
    row.forEach((col) => {
      const colEl = document.createElement('div');
      const vals = col.elems ? col.elems : [col];
      vals.forEach((val) => {
        if (val) {
          if (typeof val === 'string') {
            colEl.innerHTML += val;
          } else {
            colEl.appendChild(val);
          }
        }
      });
      rowEl.appendChild(colEl);
    });
    blockEl.appendChild(rowEl);
  });
  return (blockEl);
};

const buildSubAccordion = async (parentPanel, blockTable) => {
  const block = buildBlock('accordion', blockTable);
  block.classList.add('sub-accordion');
  parentPanel.append(block);
  const shortBlockName = block.classList[0];
  if (shortBlockName) {
    block.classList.add('block');
    block.dataset.blockName = shortBlockName;
    block.dataset.blockStatus = 'initialized';
    const blockWrapper = block.parentElement;
    blockWrapper.classList.add(`${shortBlockName}-wrapper`);
    const section = block.closest('.section');
    if (section) section.classList.add(`${shortBlockName}-container`);
  }
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
