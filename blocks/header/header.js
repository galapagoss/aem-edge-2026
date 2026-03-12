import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// ─── Breakpoints ─────────────────────────────────────────────────────────────
const isDesktop = window.matchMedia('(min-width: 1072px)');
const isTablet = window.matchMedia('(max-width: 1071px) and (min-width: 801px)');
const isMobile = window.matchMedia('(max-width: 800px)');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collapse every .menu-item-label that has a nav-drop open. */
const toggleAllNavSections = (sections, expanded = false) => {
  sections
    .querySelectorAll('.nav-sections .default-content-wrapper > ul > li')
    .forEach((s) => s.setAttribute('aria-expanded', expanded));
};

/** Close dropdowns when Escape is pressed. */
const closeOnEscape = (e) => {
  if (e.code !== 'Escape') return;
  const nav = document.getElementById('nav');
  const navSections = nav.querySelector('.nav-sections');
  const open = navSections?.querySelector('[aria-expanded="true"]');
  if (open && isDesktop.matches) {
    toggleAllNavSections(navSections);
    open.focus();
  } else if (!isDesktop.matches) {
    // eslint-disable-next-line no-use-before-define
    toggleMenu(nav, navSections);
    nav.querySelector('button')?.focus();
  }
};

/** Strip button-decoration classes AEM adds to plain links. */
const cleanButtons = (scope) => {
  scope.querySelectorAll('p.button-container').forEach((p) => {
    const a = p.querySelector('a');
    if (a) {
      a.classList.remove('button');
      p.replaceWith(a);
    }
  });
};

/** Toggle the mobile hamburger / full-nav drawer. */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const btn = nav.querySelector('.nav-hamburger button');
  document.documentElement.style.overflow = expanded || isDesktop.matches ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
  btn?.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');

  const drops = navSections.querySelectorAll('.nav-drop');
  if (isDesktop.matches) {
    drops.forEach((drop) => {
      if (!drop.hasAttribute('tabindex')) {
        drop.setAttribute('tabindex', 0);
        drop.addEventListener('focus', () => {
          drop.addEventListener('keydown', (ev) => {
            if ((ev.code === 'Enter' || ev.code === 'Space') && document.activeElement === drop) {
              const dropExpanded = drop.getAttribute('aria-expanded') === 'true';
              toggleAllNavSections(drop.closest('.nav-sections'));
              drop.setAttribute('aria-expanded', String(!dropExpanded));
            }
          });
        });
      }
    });
  } else {
    if (expanded) {
      navSections.querySelectorAll('.menu-item-label[aria-expanded="true"]').forEach((label) => {
        label.setAttribute('aria-expanded', 'false');
      });
    }
    drops.forEach((drop) => drop.removeAttribute('tabindex'));
  }

  if (!expanded || isDesktop.matches) {
    window.addEventListener('keydown', closeOnEscape);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
  }
}

// ─── Close desktop dropdowns when clicking outside ───────────────────────────
document.addEventListener('click', (e) => {
  if (!isDesktop.matches) return;

  const openLabel = document.querySelector('.menu-item-label[aria-expanded="true"]');
  const clickedLabel = e.target.closest('.menu-item-label');

  if (
    (!clickedLabel && openLabel && !e.target.closest('.nav-drop'))
    || (clickedLabel && openLabel && clickedLabel !== openLabel)
  ) {
    openLabel.setAttribute('aria-expanded', 'false');
  }

  // close tools dropdowns
  const openTools = document.querySelectorAll('.nav-tools li[aria-expanded="true"]');
  const insideTools = Array.from(openTools).some((li) => li.contains(e.target));
  if (!insideTools) openTools.forEach((li) => li.setAttribute('aria-expanded', 'false'));
});

// ─── Mobile back-button inside a nav-drop ────────────────────────────────────
function addMobileHelpers(navDrop, label) {
  if (!label) return;
  navDrop.querySelector('.mobile-navdrop-heading')?.remove();
  navDrop.querySelector('.back-button')?.remove();
  if (!isMobile.matches && !isTablet.matches) return;

  const backBtn = document.createElement('button');
  backBtn.className = 'back-button';
  backBtn.type = 'button';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    label.setAttribute('aria-expanded', 'false');
  });
  navDrop.prepend(backBtn);

  if (isMobile.matches) {
    const firstP = label.querySelector('p');
    if (firstP) {
      const cloned = firstP.cloneNode(true);
      cloned.classList.add('mobile-navdrop-heading');
      backBtn.after(cloned);
    }
  }
}

// ─── Build mega-menu dropdowns from `menu` blocks ────────────────────────────
/**
 * Each top-level nav section is authored as a `menu` block in the fragment.
 * The block's first child becomes the label (`.menu-item-label`).
 * Remaining children are moved into a `.nav-drop` wrapper.
 *
 * Modifier classes on the block drive layout:
 *   three-column | four-column   – number of content columns in desktop grid
 *   has-bottom-row               – last content col is the promo footer bar
 *   card-image-top               – promo card: image on top
 *   card-image-bottom            – promo card: image on bottom
 *   stacked-image-cards          – promo col: stacked mini-card tiles
 *   no-promo-card                – no promotional image column at all
 */
function initDropdownSections(navSections) {
  if (!navSections) return;

  navSections.querySelectorAll(':scope .menu.block').forEach((menu) => {
    // ── Stand-alone link (no submenu) ──────────────────────────────────────
    if (menu.children.length <= 1) {
      const standAlone = menu.querySelector(':scope > div');
      if (!standAlone) return;
      standAlone.classList.add('menu-item-label');
      const nested = standAlone.querySelector(':scope > div');
      if (nested) {
        nested.classList.remove('button-container');
        const a = nested.querySelector(':scope a');
        a?.classList.remove('button');
        a?.classList.add('stand-alone-link');
      }
      return;
    }

    // ── Build .nav-drop wrapper ────────────────────────────────────────────
    const navDrop = document.createElement('div');
    navDrop.className = 'nav-drop';
    const children = Array.from(menu.children).slice(1);
    children.forEach((c) => navDrop.appendChild(c));
    menu.appendChild(navDrop);

    const cols = Array.from(navDrop.children);
    const hasBottomRow = menu.classList.contains('has-bottom-row');

    if (menu.classList.contains('three-column')) {
      navDrop.classList.add('three-col');
      if (hasBottomRow && cols[2]) cols[2].classList.add('bottom-row');
    } else if (menu.classList.contains('four-column')) {
      navDrop.classList.add('four-col');
      if (hasBottomRow && cols[3]) cols[3].classList.add('bottom-row');
    }

    // ── Promo / image column ───────────────────────────────────────────────
    if (!menu.classList.contains('no-promo-card')) {
      const imageCol = cols[cols.length - 1];

      if (menu.classList.contains('stacked-image-cards')) {
        // Convert picture+text+link triplets into .stacked-card tiles
        const wrapper = imageCol.querySelector('div');
        if (wrapper) {
          const kids = Array.from(wrapper.children);
          const newCards = [];
          for (let i = 0; i < kids.length; i += 3) {
            const [pic, text, link] = [kids[i], kids[i + 1], kids[i + 2]];
            if (pic && text && link) {
              const card = document.createElement('div');
              card.className = 'stacked-card';
              const content = document.createElement('div');
              content.className = 'card-content';
              content.append(text, link);
              card.append(pic, content);
              newCards.push(card);
            }
          }
          wrapper.remove();
          newCards.forEach((c) => imageCol.appendChild(c));
        }
      } else {
        // Wrap image-col content in a single anchor
        const divWrapper = imageCol.querySelector('div');
        if (divWrapper) {
          const link = divWrapper.querySelector('a');
          if (link) {
            const wrapperLink = document.createElement('a');
            wrapperLink.href = link.getAttribute('href');
            wrapperLink.title = link.getAttribute('title') || '';
            wrapperLink.className = 'image-col-link';
            while (divWrapper.firstChild) wrapperLink.appendChild(divWrapper.firstChild);
            divWrapper.appendChild(wrapperLink);
          }
        }
      }

      imageCol.classList.add('image-col');
    }

    cols.forEach((c) => c.classList.add('dropdown-col'));

    // ── List items → .dropdown-item-wrapper ──────────────────────────────
    menu.querySelectorAll('li').forEach((li) => {
      const ul = li.querySelector('ul');
      if (!ul) return;
      li.classList.add('dropdown-item-wrapper');
      const [labelEl, descEl] = Array.from(ul.children);
      if (labelEl) labelEl.classList.add('dropdown-item-label');
      if (descEl) descEl.classList.add('dropdown-item-description');
    });

    // Unwrap unnecessary inner divs in dropdown columns
    children.forEach((wrapper, i) => {
      const inner = wrapper.querySelector('div');
      if (inner && i > 0 && !wrapper.classList.contains('image-col')) {
        inner.replaceWith(...inner.childNodes);
      }
    });

    // ── Label (first child of the menu block) ─────────────────────────────
    const firstChild = menu.children[0];
    if (firstChild) {
      firstChild.classList.add('menu-item-label');
      firstChild.setAttribute('aria-expanded', 'false');
      firstChild.setAttribute('tabindex', '0');

      firstChild.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isDesktop.matches) {
          // Desktop: click pins/unpins the dropdown (hover already opened it)
          const isPinned = firstChild.dataset.clickOpen === 'true';
          const isOpen = firstChild.getAttribute('aria-expanded') === 'true';
          if (isOpen && isPinned) {
            firstChild.dataset.clickOpen = 'false';
            firstChild.setAttribute('aria-expanded', 'false');
          } else {
            firstChild.dataset.clickOpen = 'true';
            firstChild.setAttribute('aria-expanded', 'true');
          }
        } else {
          // Mobile: simple toggle
          const isOpen = firstChild.getAttribute('aria-expanded') === 'true';
          firstChild.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        }
      });
    }

    addMobileHelpers(navDrop, firstChild);
  });

  cleanButtons(navSections);
}

// ─── Desktop hover-with-delay ─────────────────────────────────────────────────
/**
 * Opens dropdown on mouseenter with a 200 ms close-delay so the
 * cursor can travel from the label into the dropdown without it closing.
 */
function initDesktopNavDropBehavior(navSections) {
  if (!navSections) return;

  navSections.querySelectorAll('.menu-item-label').forEach((label) => {
    const dropdown = label.nextElementSibling;
    if (!dropdown?.classList.contains('nav-drop')) return;

    const closeOthers = () => {
      navSections.querySelectorAll('.menu-item-label').forEach((l) => {
        if (l !== label) l.setAttribute('aria-expanded', 'false');
      });
    };

    const timer = { id: null };
    const cancelTimer = () => { if (timer.id) { clearTimeout(timer.id); timer.id = null; } };
    const startTimer = () => {
      timer.id = setTimeout(() => {
        if (label.dataset.clickOpen !== 'true') label.setAttribute('aria-expanded', 'false');
      }, 200);
    };

    label.addEventListener('mouseenter', () => {
      if (!isDesktop.matches) return;
      cancelTimer();
      closeOthers();
      label.setAttribute('aria-expanded', 'true');
    });

    dropdown.addEventListener('mouseenter', () => {
      if (!isDesktop.matches) return;
      cancelTimer();
      label.setAttribute('aria-expanded', 'true');
    });

    label.addEventListener('mouseleave', startTimer);
    dropdown.addEventListener('mouseleave', startTimer);
    label.addEventListener('mouseenter', cancelTimer);
    dropdown.addEventListener('mouseenter', cancelTimer);
  });
}

// ─── Tools menu (Support, Log In, icons) ─────────────────────────────────────
function initToolsMenu(navTools) {
  if (!navTools) return;

  const closeAllExcept = (exceptLi) => {
    navTools.querySelectorAll('li').forEach((li) => {
      if (li !== exceptLi) li.setAttribute('aria-expanded', 'false');
    });
  };

  navTools.querySelectorAll('li').forEach((li) => {
    const ul = li.querySelector('ul');
    if (!ul) return;

    ul.classList.add('tools-dropdown');
    li.setAttribute('aria-expanded', 'false');

    // Click: toggle (ignore clicks on child links)
    li.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      e.preventDefault();
      const isOpen = li.getAttribute('aria-expanded') === 'true';
      closeAllExcept(li);
      li.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });

    // Desktop hover
    li.addEventListener('mouseenter', () => {
      if (!isDesktop.matches) return;
      closeAllExcept(li);
      li.setAttribute('aria-expanded', 'true');
    });

    li.addEventListener('mouseleave', () => {
      if (!isDesktop.matches) return;
      li.setAttribute('aria-expanded', 'false');
    });
  });

  // Mark last <a> as the primary CTA button
  const allLinks = navTools.querySelectorAll('a');
  if (allLinks.length) {
    const cta = allLinks[allLinks.length - 1];
    if (!cta.classList.contains('button')) cta.classList.add('button', 'nav-cta');
  }
}

// ─── Hamburger ────────────────────────────────────────────────────────────────
function initHamburger(nav, navSections) {
  const hamburger = document.createElement('div');
  hamburger.className = 'nav-hamburger';
  hamburger.innerHTML = `
    <button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));
  nav.prepend(hamburger);
  nav.setAttribute('aria-expanded', 'false');
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));
}

// ─── Scroll shadow ────────────────────────────────────────────────────────────
function initScrollShadow(navWrapper) {
  const onScroll = () => navWrapper.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ─── Fragment path resolution ─────────────────────────────────────────────────
/**
 * Builds an ordered list of nav-fragment paths to try, walking the URL tree
 * upward from the current page to the site root.
 *
 * Given /en/products/cloud/detail:
 *   1. meta[header] / meta[nav]                    (explicit override)
 *   2. /en/products/cloud/detail/fragments/header
 *   3. /en/products/cloud/fragments/header
 *   4. /en/products/fragments/header
 *   5. /en/fragments/header
 *   6. /fragments/header
 *   7. /nav                                        (legacy fallback)
 */
function buildNavCandidates() {
  const navMeta = getMetadata('header') || getMetadata('nav');
  if (navMeta) return [new URL(navMeta, window.location).pathname];

  const segments = window.location.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  const candidates = [];

  for (let i = segments.length; i >= 0; i -= 1) {
    const base = segments.slice(0, i).join('/');
    candidates.push(`/${base ? `${base}/` : ''}fragments/header`);
  }
  candidates.push('/nav');
  return [...new Set(candidates)];
}

// ─── Main decorate ────────────────────────────────────────────────────────────
export default async function decorate(block) {
  const tryLoad = async (path) => {
    try { return (await loadFragment(path)) || null; } catch { return null; }
  };

  // Resolve nav fragment (most-specific path first)
  let fragment = null;
  // eslint-disable-next-line no-restricted-syntax
  for (const path of buildNavCandidates()) {
    // eslint-disable-next-line no-await-in-loop
    fragment = await tryLoad(path);
    if (fragment) break;
  }
  if (!fragment) return;

  // ── Build nav DOM ──────────────────────────────────────────────────────────
  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  // The fragment expects exactly 3 top-level sections:
  //   0 → brand   (logo)
  //   1 → sections (menu blocks with mega-menus)
  //   2 → tools   (support / login / CTA)
  ['brand', 'sections', 'tools'].forEach((cls, i) => {
    const s = nav.children[i];
    if (s) s.classList.add(`nav-${cls}`);
  });

  // ── Brand: remove AEM button decoration ───────────────────────────────────
  const navBrand = nav.querySelector('.nav-brand');
  if (navBrand) {
    const brandLink = navBrand.querySelector('.button');
    if (brandLink) {
      brandLink.className = '';
      brandLink.closest('.button-container')?.classList.remove('button-container');
    }
    const logoImg = navBrand.querySelector('img');
    if (logoImg && !logoImg.getAttribute('alt')) logoImg.setAttribute('alt', 'logo');
  }

  // ── Sections ──────────────────────────────────────────────────────────────
  const navSections = nav.querySelector('.nav-sections');
  if (!navSections) return;

  initDropdownSections(navSections);
  initDesktopNavDropBehavior(navSections);

  // ── Tools ──────────────────────────────────────────────────────────────────
  initToolsMenu(nav.querySelector('.nav-tools'));

  // ── Wrap & append ──────────────────────────────────────────────────────────
  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  // ── Hamburger + keyboard nav ───────────────────────────────────────────────
  initHamburger(nav, navSections);

  // ── Scroll shadow ──────────────────────────────────────────────────────────
  initScrollShadow(navWrapper);
}
