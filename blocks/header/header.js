import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const isDesktop = window.matchMedia('(min-width: 900px)');

// ─── Menu DOM builders ────────────────────────────────────────────────────────

function buildDropdownItem(li) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dropdown-item-wrapper';

  const iconEl = li.querySelector(':scope > p > .icon');
  if (iconEl) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'icon';
    iconWrap.append(iconEl);
    wrapper.append(iconWrap);
  }

  const subItems = [...(li.querySelector(':scope > ul')?.children ?? [])];
  if (subItems.length) {
    const text = document.createElement('div');

    const labelDiv = document.createElement('div');
    labelDiv.className = 'dropdown-item-label';
    while (subItems[0].firstChild) labelDiv.append(subItems[0].firstChild);
    text.append(labelDiv);

    if (subItems[1]) {
      const desc = document.createElement('div');
      desc.className = 'dropdown-item-description';
      desc.textContent = subItems[1].textContent.trim();
      text.append(desc);
    }

    wrapper.append(text);
  }

  return wrapper;
}

function buildColumn(cell, extraClass = '') {
  const col = document.createElement('div');
  col.className = ['dropdown-col', extraClass].filter(Boolean).join(' ');

  [...cell.children].forEach((child) => {
    if (child.tagName === 'UL') {
      [...child.children].forEach((li) => col.append(buildDropdownItem(li)));
    } else {
      col.append(child);
    }
  });

  return col;
}

function buildStackedImageCol(cells) {
  const col = document.createElement('div');
  col.className = 'dropdown-col image-col';

  cells.forEach((cell) => {
    const children = [...cell.children];
    let i = 0;
    while (i < children.length) {
      if (children[i]?.querySelector('picture')) {
        const card = document.createElement('div');
        card.className = 'stacked-card';

        const imgWrap = document.createElement('div');
        imgWrap.className = 'stacked-card-image';
        imgWrap.append(children[i]);

        const content = document.createElement('div');
        content.className = 'card-content';
        if (children[i + 1]) content.append(children[i + 1]);
        if (children[i + 2]) content.append(children[i + 2]);

        card.append(imgWrap, content);
        col.append(card);
        i += 3;
      } else {
        col.append(children[i]);
        i += 1;
      }
    }
  });

  return col;
}

/**
 * Transforms a raw .menu block (table rows) into .menu-item-label + .nav-drop.
 * @param {Element} block
 */
function decorateMenuBlock(block) {
  const hasBottomRow = block.classList.contains('has-bottom-row');
  const isStacked = block.classList.contains('stacked-image-cards');
  const hasImageCol = block.classList.contains('card-image-top')
    || block.classList.contains('card-image-bottom')
    || isStacked;

  const rows = [...block.children];

  // Row 0 — label
  const labelCell = rows[0]?.querySelector(':scope > div');
  const label = document.createElement('div');
  label.className = 'menu-item-label';
  label.setAttribute('aria-expanded', 'false');

  const labelLink = labelCell?.querySelector('a');
  if (labelLink && rows.length === 1) {
    label.classList.add('stand-alone-link');
    label.append(labelLink);
  } else {
    label.textContent = labelCell?.textContent.trim() ?? '';
  }
  rows[0].remove();

  block.classList.add('menu-item');

  if (rows.length <= 1) {
    block.append(label);
    return;
  }

  // Remaining rows — split by position
  const remaining = [...block.children];
  let imageRows = [];
  let bottomRow = null;
  const contentRows = [...remaining];

  if (hasImageCol && isStacked) {
    // last row(s) = stacked cards — take all that have pictures or are after content
    imageRows = contentRows.splice(hasBottomRow ? contentRows.length - 2 : contentRows.length - 1);
    if (hasBottomRow) bottomRow = imageRows.shift();
  } else {
    if (hasImageCol) imageRows = [contentRows.pop()];
    if (hasBottomRow) bottomRow = contentRows.pop();
  }

  // Build nav-drop
  const drop = document.createElement('div');
  drop.className = 'nav-drop';

  ['two-column', 'three-column', 'four-column'].forEach((cls) => {
    if (block.classList.contains(cls)) drop.classList.add(cls.replace('column', 'col'));
  });

  contentRows.forEach((row) => {
    const cell = row.querySelector(':scope > div');
    if (cell) drop.append(buildColumn(cell));
    row.remove();
  });

  if (bottomRow) {
    const cell = bottomRow.querySelector(':scope > div');
    if (cell) drop.append(buildColumn(cell, 'bottom-row'));
    bottomRow.remove();
  }

  if (isStacked) {
    const cells = imageRows.map((r) => r.querySelector(':scope > div')).filter(Boolean);
    if (cells.length) drop.append(buildStackedImageCol(cells));
    imageRows.forEach((r) => r.remove());
  } else if (imageRows[0]) {
    const cell = imageRows[0].querySelector(':scope > div');
    if (cell) drop.append(buildColumn(cell, 'image-col'));
    imageRows[0].remove();
  }

  block.append(label, drop);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

function closeAllMenus(navSections) {
  navSections.querySelectorAll('.menu-item-label[aria-expanded="true"]').forEach((l) => {
    l.setAttribute('aria-expanded', 'false');
  });
}

function closeAllTools(navTools) {
  navTools?.querySelectorAll('li[aria-expanded="true"]').forEach((li) => {
    li.setAttribute('aria-expanded', 'false');
  });
}

function initMenuItems(navSections) {
  let closeTimer = null;

  navSections.querySelectorAll('.menu-item').forEach((item) => {
    const label = item.querySelector('.menu-item-label');
    const drop = item.querySelector('.nav-drop');
    if (!label || !drop) return;

    label.addEventListener('click', () => {
      const expanded = label.getAttribute('aria-expanded') === 'true';
      closeAllMenus(navSections);
      label.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });

    item.addEventListener('mouseenter', () => {
      if (!isDesktop.matches) return;
      clearTimeout(closeTimer);
      closeAllMenus(navSections);
      label.setAttribute('aria-expanded', 'true');
    });

    item.addEventListener('mouseleave', () => {
      if (!isDesktop.matches) return;
      closeTimer = setTimeout(() => label.setAttribute('aria-expanded', 'false'), 180);
    });

    drop.addEventListener('mouseenter', () => { if (isDesktop.matches) clearTimeout(closeTimer); });
    drop.addEventListener('mouseleave', () => {
      if (!isDesktop.matches) return;
      closeTimer = setTimeout(() => label.setAttribute('aria-expanded', 'false'), 180);
    });
  });
}

function initToolsMenu(navTools) {
  const allLinks = [...navTools.querySelectorAll(':scope > .default-content-wrapper > p > a')];
  const ctaLink = allLinks[allLinks.length - 1];
  if (ctaLink) {
    ctaLink.closest('p')?.classList.add('nav-cta-wrapper');
    ctaLink.classList.add('nav-cta');
  }

  navTools.querySelectorAll(':scope li').forEach((li) => {
    const subList = li.querySelector('ul');
    if (!subList) return;
    subList.classList.add('tools-dropdown');

    li.addEventListener('click', (e) => {
      if (isDesktop.matches) return;
      e.stopPropagation();
      const expanded = li.getAttribute('aria-expanded') === 'true';
      li.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });

    li.addEventListener('mouseenter', () => {
      if (!isDesktop.matches) return;
      closeAllTools(navTools);
      li.setAttribute('aria-expanded', 'true');
    });

    li.addEventListener('mouseleave', () => {
      if (!isDesktop.matches) return;
      li.setAttribute('aria-expanded', 'false');
    });
  });
}

function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null
    ? !forceExpanded
    : nav.getAttribute('aria-expanded') === 'true';

  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  document.body.style.overflowY = (!expanded && !isDesktop.matches) ? 'hidden' : '';

  const button = nav.querySelector('.nav-hamburger button');
  if (button) button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  if (expanded) closeAllMenus(navSections);
}

// ─── Main decorator ───────────────────────────────────────────────────────────

export default async function decorate(block) {
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);
  if (!fragment) return;

  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  // Assign brand / sections / tools
  ['brand', 'sections', 'tools'].forEach((c, i) => {
    if (nav.children[i]) nav.children[i].classList.add(`nav-${c}`);
  });

  // Clean brand button styling
  nav.querySelector('.nav-brand')?.querySelectorAll('.button').forEach((btn) => {
    btn.className = '';
    btn.closest('.button-container')?.classList.remove('button-container');
  });

  // Decorate each .menu block in nav-sections
  const navSections = nav.querySelector('.nav-sections');
  if (navSections) {
    navSections.querySelectorAll('.menu').forEach(decorateMenuBlock);
    initMenuItems(navSections);
  }

  // Wire tools
  const navTools = nav.querySelector('.nav-tools');
  if (navTools) initToolsMenu(navTools);

  // Hamburger
  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
    <span class="nav-hamburger-icon"></span>
  </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));
  nav.prepend(hamburger);

  nav.setAttribute('aria-expanded', 'false');
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) {
      closeAllMenus(navSections);
      closeAllTools(navTools);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      closeAllMenus(navSections);
      closeAllTools(navTools);
    }
  });

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  window.addEventListener('scroll', () => {
    navWrapper.classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });
}
