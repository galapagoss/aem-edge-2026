// Unified Article List Block
// AEM Sites (Universal Editor) version — reads config from positional rows,
// NOT from readBlockConfig (document-based pattern).
//
// Row order MUST match _article-list.json field order:
//   0  displayMode            (select)
//   1  title                  (text)
//   2  filter                 (select)
//   3  tags                   (text)      ← comma-separated
//   4  authorUrl              (aem-content)
//   5  paths                  (aem-content, multi)
//   6  sort                   (select)
//   7  sortCategoryShuffleOrder (select)
//   8  limit                  (select)
//   9  blogLimit              (select)
//  10  descriptionWordLimit   (select)
//  11  showImagesOnMobile     (select)
//  12  hidePagination         (select)
//  13  classes                (select)   ← auto-applied as CSS class, just remove

import indexCache from '../../scripts/index-cache.js';
import { getMetadata, createOptimizedPicture } from '../../scripts/aem.js';

// ---------------------------------------------------------------------------
// DOM helpers (inline — project has no dom-helpers.js)
// ---------------------------------------------------------------------------
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  children.forEach((child) => {
    if (typeof child === 'string') node.insertAdjacentHTML('beforeend', child);
    else if (child) node.append(child);
  });
  return node;
};
const div = (attrs, ...c) => el('div', attrs, ...c);
const h3 = (attrs, ...c) => el('h3', attrs, ...c);
const a = (attrs, ...c) => el('a', attrs, ...c);
const ul = (attrs, ...c) => el('ul', attrs, ...c);
const li = (attrs, ...c) => el('li', attrs, ...c);
const nav = (attrs, ...c) => el('nav', attrs, ...c);
const btnEl = (attrs, ...c) => el('button', attrs, ...c);

// ---------------------------------------------------------------------------
// Util helpers (inline — project has no util.js)
// ---------------------------------------------------------------------------

/** Converts a string to a URL-safe slug */
const slug = (str) => str
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

/** Returns the blog home path based on the current locale */
const getBlogHomePath = () => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // convention: /{locale}/blog or just /blog
  const blogIdx = parts.indexOf('blog');
  if (blogIdx >= 0) return `/${parts.slice(0, blogIdx + 1).join('/')}`;
  return '/blog';
};

/** Returns true when .html extension should be appended for this host */
const shouldMutateLinksForHost = (hostname) => !['aem.live', 'aem.page', 'localhost'].some((h) => hostname.includes(h));

const PAGES_BEFORE_ELLIPSIS = 3;
const PREVIEW_ELLIPSIS_KEY = 'preview';
const NEXT_ELLIPSIS_KEY = 'next';
const PAGE_PARAM = 'p';

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/**
 * Gets trimmed textContent from the first inner div of a row.
 * @param {Element|undefined} row
 * @returns {string}
 */
const getRowText = (row) => row?.querySelector(':scope > div')?.textContent?.trim() ?? '';

/**
 * Gets the href of the first <a> inside a row (aem-content field).
 * @param {Element|undefined} row
 * @returns {string}
 */
const getRowHref = (row) => row?.querySelector('a')?.getAttribute('href')?.trim() ?? '';

/**
 * Gets all hrefs from <a> elements inside a row (aem-content multi field).
 * @param {Element|undefined} row
 * @returns {string[]}
 */
const getRowHrefs = (row) => {
  if (!row) return [];
  return [...row.querySelectorAll('a')]
    .map((anchor) => anchor.getAttribute('href')?.trim())
    .filter(Boolean);
};

// ---------------------------------------------------------------------------
// General helpers (unchanged from original)
// ---------------------------------------------------------------------------

const blogHome = getBlogHomePath();
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

const toArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.filter(Boolean).map((v) => `${v}`.trim()).filter(Boolean);
  }
  return `${val}`.split(',').map((v) => v.trim()).filter(Boolean);
};

const stripTrailingSlash = (value) => {
  if (!value) return '';
  if (value === '/') return '/';
  return value.replace(/\/+$/, '');
};

const stripHtmlExtension = (value) => {
  if (!value) return value;
  return value.replace(/\.html?$/i, '');
};

const appendHtmlExtension = (value) => {
  if (!value) return value;
  if (typeof window !== 'undefined' && !shouldMutateLinksForHost(window.location.hostname)) {
    return value;
  }
  if (/\.html?$/i.test(value) || value.endsWith('/') || value === '/blog') return value;
  const pathOnly = value.split(/[?#]/)[0];
  if (/\.html?$/i.test(pathOnly)) return value;
  return `${value}.html`;
};

const normalizePathname = (pathname) => {
  const stripped = stripTrailingSlash(pathname || '');
  return stripped.toLowerCase();
};

const toComparablePath = (value) => {
  if (!value) return '';
  const trimmed = `${value}`.trim();
  if (!trimmed) return '';
  const sanitized = trimmed.split(/[?#]/)[0];
  const absolutePattern = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
  if (absolutePattern.test(sanitized)) {
    try {
      const parsed = new URL(sanitized);
      return stripHtmlExtension(normalizePathname(parsed.pathname || '/'));
    } catch (error) {
      // fall through
    }
  }
  const withLeadingSlash = sanitized.startsWith('/') ? sanitized : `/${sanitized}`;
  return stripHtmlExtension(normalizePathname(withLeadingSlash));
};

const normalizeAuthorUrlEntry = (value, baseOrigin) => {
  if (value === undefined || value === null) return null;
  const str = `${value}`.trim();
  if (!str) return null;
  const origin = baseOrigin || (typeof window !== 'undefined' && window.location ? window.location.origin : undefined);
  let href = '';
  let pathname = '';
  try {
    const parsed = origin ? new URL(str, origin) : new URL(str);
    pathname = normalizePathname(parsed.pathname);
    if (parsed.origin) href = `${parsed.origin}${pathname}`.toLowerCase();
  } catch (error) {
    const fallbackPath = str.startsWith('/') ? str : `/${str}`;
    pathname = normalizePathname(fallbackPath);
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        href = `${parsedOrigin.origin}${pathname}`.toLowerCase();
      } catch (originError) {
        href = '';
      }
    }
  }
  let normalizedPath = toComparablePath(str);
  if (!normalizedPath && origin) {
    try {
      const resolved = new URL(str, origin);
      normalizedPath = toComparablePath(resolved.pathname || '');
    } catch (resolveError) {
      normalizedPath = '';
    }
  }
  if (!normalizedPath) normalizedPath = pathname;
  if (!href && !pathname && !normalizedPath) return null;
  return { href, pathname: normalizedPath, path: normalizedPath };
};

const normalizeAuthorUrlList = (value, baseOrigin) => {
  if (!value) return [];
  const values = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => {
      if (typeof entry === 'string' || typeof entry === 'number') return toArray(entry);
      if (entry && typeof entry === 'object') return [entry];
      return [];
    })
    .filter(Boolean);
  return values
    .map((entry) => (entry && typeof entry === 'object' ? entry : normalizeAuthorUrlEntry(entry, baseOrigin)))
    .filter((entry) => entry && (entry.href || entry.pathname || entry.path));
};

const authorUrlMatches = (needle, candidates) => {
  if (!needle) return false;
  const resolvePath = (entry) => {
    if (!entry) return '';
    if (entry.path) return entry.path;
    if (entry.pathname) return toComparablePath(entry.pathname);
    return toComparablePath(entry.href);
  };
  const needlePath = resolvePath(needle);
  return candidates.some((candidate) => {
    if (!candidate) return false;
    if (needle.href && candidate.href && needle.href === candidate.href) return true;
    const candidatePath = resolvePath(candidate);
    return needlePath && candidatePath && needlePath === candidatePath;
  });
};

// ---------------------------------------------------------------------------
// Config normalizer
// Receives a plain object built from positional rows (not readBlockConfig).
// Key names match what normalizeConfig already reads so no further changes needed.
// ---------------------------------------------------------------------------
const normalizeConfig = (raw) => {
  const cfg = raw || {};
  let { paths } = cfg;
  if (!Array.isArray(paths)) paths = paths ? [paths] : [];
  paths = paths.map((p) => toComparablePath(p)).filter(Boolean);

  return {
    displayMode: (cfg.displaymode || cfg.mode || 'paginated').toLowerCase(),
    title: (cfg.title || '').trim(),
    tags: toArray(cfg.tags),
    author: '', // not exposed in UE model — filter by authorUrl only
    authorUrl: (cfg.authorurl || '').trim(),
    category: '', // resolved from page metadata at runtime
    paths,
    filter: (cfg.filter || '').trim().toLowerCase(),
    sort: (cfg.sort || 'date-desc').trim().toLowerCase(),
    sortCategoryOrder: [], // not exposed in UE model — hardcode if needed
    sortCategoryShuffleOrder: ['true', 'yes', '1', 'on'].includes(
      (cfg['sort-category-shuffle-order'] || '').toLowerCase(),
    ),
    limit: parseInt(cfg.limit || '9', 10) || 9,
    blogLimit: parseInt(cfg['blog-limit'] || '0', 10),
    showImagesOnMobile: !['false', 'no', '0', 'off'].includes((cfg.showimagesonmobile || '').toLowerCase()),
    prevText: 'Prev',
    nextText: 'Next',
    descriptionWordLimit: parseInt(cfg.descriptionwordlimit || '0', 10) || 0,
    hidePagination: ['true', 'yes', '1', 'on'].includes((cfg.hidepagination || '').toLowerCase()),
  };
};

// ---------------------------------------------------------------------------
// Index fetch
// ---------------------------------------------------------------------------
const fetchIndex = async () => {
  try {
    return await indexCache.fetch('article');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('article-list: index fetch failed', e);
    return [];
  }
};

const isArticleTemplate = (entry) => {
  if (!entry || typeof entry !== 'object') return false;
  let template = entry.template ?? entry.Template ?? '';
  if (Array.isArray(template)) [template] = template;
  return `${template || ''}`.trim().toLowerCase() === 'article';
};

// ---------------------------------------------------------------------------
// Filtering & Sorting
// ---------------------------------------------------------------------------
const filterArticles = (all, cfg) => {
  let base = all;
  if (cfg.paths.length) {
    const configuredPaths = new Set(cfg.paths);
    base = base.filter((article) => {
      const candidates = [];
      if (article.path) candidates.push(article.path);
      if (article.url) candidates.push(article.url);
      return candidates
        .map((candidate) => toComparablePath(candidate))
        .filter(Boolean)
        .some((candidate) => configuredPaths.has(candidate));
    });
  }
  if (cfg.filter === 'paths') return base;

  if (cfg.tags.length && cfg.sortCategoryShuffleOrder) {
    const blogCategory = (getMetadata('category') || '').trim().toLowerCase();
    base = base.filter((article) => {
      const category = (article.category || '').toString().toLowerCase();
      return blogCategory.match(category);
    });
  } else if (cfg.tags.length) {
    const needles = cfg.tags.map((t) => t.toLowerCase());
    base = base.filter((article) => {
      const tags = (article.tags || article.tag || '')
        .toString().split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      return tags.some((t) => needles.includes(t));
    });
  }

  if (cfg.authorUrl) {
    const needleAuthorUrl = normalizeAuthorUrlEntry(cfg.authorUrl);
    base = base.filter((article) => {
      const articleAuthorUrls = normalizeAuthorUrlList(article.authorUrl || article.authorurl);
      return authorUrlMatches(needleAuthorUrl, articleAuthorUrls);
    });
  }

  if (cfg.filter.toLowerCase() === 'category') {
    const blogCategory = getMetadata('category') || '';
    const targetCategory = blogCategory || cfg.category;
    const currentPath = window.location.pathname;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 24);
    const cutoffTime = cutoffDate.getTime();
    base = base.filter((article) => {
      if (article.path === currentPath || article.template?.toLowerCase() !== 'article') return false;
      if (article.publishDate && new Date(article.publishDate).getTime() < cutoffTime) return false;
      return (article.category || '').toLowerCase() === targetCategory.trim().toLowerCase();
    });
  } else if (cfg.category) {
    base = base.filter((article) => (article.category || '').toLowerCase() === cfg.category.toLowerCase());
  }
  return base;
};

const shuffleArray = (array) => {
  if (array.length <= 1) return [...array];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    if (i !== j) [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const sortArticles = (list, cfg) => {
  if (!list || list.length <= 1) return [...list];
  const byDate = (itemA, itemB) => {
    const da = new Date(itemA.publishDate || itemA.date || 0).getTime();
    const db = new Date(itemB.publishDate || itemB.date || 0).getTime();
    return cfg.sort === 'date-asc' ? da - db : db - da;
  };
  if (cfg.sortCategoryShuffleOrder) return list.length > 1 ? shuffleArray(list) : [...list];
  return [...list].sort(byDate);
};

const truncate = (text, wordLimit = 0) => {
  if (!text || !wordLimit) return text || '';
  const words = text.split(/\s+/);
  return words.length <= wordLimit ? text : `${words.slice(0, wordLimit).join(' ')}…`;
};

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
function buildCard(article, eager, cfg) {
  const {
    path, title, description, image, category, readTime,
  } = article;
  const link = path;
  const cleanTitle = (title || '').replace(/\s*\|\s*Splunk$/, '');
  const card = div({ class: 'article-list-card' });
  if (image && !image.includes('default-meta-image.png')) {
    const picture = createOptimizedPicture(image, cleanTitle, eager, [
      { media: '(min-width: 900px)', width: '400' },
      { width: '300' },
    ]);
    const imageContainer = div({ class: 'article-card-image' });
    if (link) {
      imageContainer.append(a({ href: appendHtmlExtension(link) }, picture));
    } else {
      imageContainer.append(picture);
    }
    card.append(imageContainer);
  }
  const content = div({ class: 'article-card-content' });
  const meta = div({ class: 'article-card-meta' });
  if (category) {
    const categoryHref = appendHtmlExtension(`${blogHome}/${slug(category)}`);
    meta.append(a({ class: 'article-card-category', href: categoryHref }, category));
  }
  if (readTime) meta.append(div({ class: 'article-card-read-time' }, readTime));
  if (meta.children.length) content.append(meta);
  if (cleanTitle) {
    content.append(h3({ class: 'article-card-title' }, a({ href: appendHtmlExtension(link) }, cleanTitle)));
  }
  if (description) {
    content.append(div({ class: 'article-card-description' }, truncate(description, cfg.descriptionWordLimit)));
  }
  card.append(content);
  return card;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
function updatePageParam(pageIdx) {
  const params = new URLSearchParams(window.location.search);
  if (pageIdx <= 0) params.delete(PAGE_PARAM);
  else params.set(PAGE_PARAM, (pageIdx + 1).toString());
  const qs = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  document.dispatchEvent(new CustomEvent('article-list:page-change', {
    detail: {
      pageIndex: pageIdx,
      pageNumber: pageIdx + 1,
      paramName: PAGE_PARAM,
      paramPresent: params.has(PAGE_PARAM),
    },
  }));
}

function buildPaginationSequence(currentIndex, totalPages) {
  const total = Math.max(totalPages, 1);
  if (total <= 1) return [];
  const currentIdx = clamp(currentIndex, 0, total - 1);
  const currentPage = currentIdx + 1;
  const sequence = [];
  let lastInsertedPage = 0;
  const hasPage = (page) => sequence.some((entry) => entry.type === 'page' && entry.page === page);
  const addPage = (page) => {
    if (page < 1 || page > total || hasPage(page)) return;
    sequence.push({ type: 'page', page, index: page - 1 });
    lastInsertedPage = Math.max(lastInsertedPage, page);
  };
  const addEllipsis = (key) => {
    if (sequence.some((entry) => entry.type === 'ellipsis' && entry.key === key)) return;
    sequence.push({ type: 'ellipsis', key });
  };
  const pushRange = (start, end) => {
    for (let page = start; page <= end; page += 1) {
      if (page > total) break;
      if (page > 1) addPage(page);
    }
  };
  if (currentPage > 1) sequence.push({ type: 'prev', target: currentIdx - 1 });
  addPage(1);
  if (total > PAGES_BEFORE_ELLIPSIS) {
    if (currentPage > 4) addEllipsis(PREVIEW_ELLIPSIS_KEY);
    if (currentPage <= 4) {
      pushRange(2, currentPage === 1 ? currentPage + 2 : currentPage + 1);
    } else if (currentPage + 4 > total) {
      const rangeStart = currentPage === total ? currentPage - 2 : currentPage - 1;
      pushRange(rangeStart, currentPage + PAGES_BEFORE_ELLIPSIS);
    } else {
      pushRange(currentPage, currentPage + PAGES_BEFORE_ELLIPSIS);
    }
    if (lastInsertedPage + 1 < total) addEllipsis(NEXT_ELLIPSIS_KEY);
  } else {
    pushRange(2, total);
  }
  addPage(total);
  if (currentPage < total) sequence.push({ type: 'next', target: currentIdx + 1 });
  return sequence;
}

function renderPage(state) {
  const {
    pagedRoot, currentPage, pageSize, articles, config,
  } = state;
  pagedRoot.innerHTML = '';
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, articles.length);
  for (let i = start; i < end; i += 1) {
    pagedRoot.append(buildCard(articles[i], currentPage === 0 && i === start, config));
  }
  updatePageParam(currentPage);
}

function buildPagination(block, state, placeholders) {
  const { totalPages, currentPage, config } = state;
  block.querySelector('.article-list-pagination')?.remove();
  if (totalPages <= 1 || config.hidePagination) return;
  const navEl = nav({ class: 'article-list-pagination', 'aria-label': placeholders.pagination || 'Pagination' });
  const list = ul({ class: 'pagination-pages' });
  const buildHref = (pageIndex) => {
    const params = new URLSearchParams(window.location.search);
    if (pageIndex === 0) params.delete(PAGE_PARAM);
    else params.set(PAGE_PARAM, pageIndex + 1);
    const qs = params.toString();
    return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  };
  const goTo = (pageIndex) => {
    state.currentPage = pageIndex;
    renderPage(state);
    buildPagination(block, state, placeholders);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  buildPaginationSequence(currentPage, totalPages).forEach((item) => {
    if (item.type === 'prev' || item.type === 'next') {
      const ariaLabel = item.type === 'prev' ? placeholders.previousPage || 'Previous Page' : placeholders.nextPage || 'Next Page';
      const visibleText = item.type === 'prev' ? config.prevText || 'Prev' : config.nextText || 'Next';
      const link = a({ class: `pagination-${item.type}`, 'aria-label': ariaLabel }, visibleText);
      link.href = buildHref(item.target);
      link.addEventListener('click', (e) => { e.preventDefault(); goTo(item.target); });
      list.append(li(link));
      return;
    }
    if (item.type === 'ellipsis') {
      list.append(li({ class: 'pagination-ellipsis', 'aria-hidden': 'true' }, '...'));
      return;
    }
    if (item.type === 'page') {
      const pageNum = item.page;
      const pageLink = a(
        { class: 'pagination-page', 'aria-label': `${placeholders.page || 'Page'} ${pageNum}` },
        `${pageNum}`,
      );
      if (item.index === currentPage) {
        pageLink.setAttribute('aria-current', 'page');
      } else {
        pageLink.href = buildHref(item.index);
        pageLink.addEventListener('click', (e) => { e.preventDefault(); goTo(item.index); });
      }
      list.append(li(pageLink));
    }
  });
  navEl.append(list);
  block.append(navEl);
}

// ---------------------------------------------------------------------------
// Carousel
// ---------------------------------------------------------------------------
function initCarouselInteractions(region) {
  const slidesContainer = region.querySelector('.carousel-slides');
  if (!slidesContainer) return;
  const slides = [...slidesContainer.querySelectorAll('.carousel-slide')];
  const indicatorButtons = [...region.querySelectorAll('.carousel-slide-indicator button')];
  function updateActive(newIdx, opts = { scroll: true }) {
    const idx = Math.max(0, Math.min(newIdx, slides.length - 1));
    region.dataset.activeSlide = String(idx);
    indicatorButtons.forEach((b, i) => {
      if (i === idx) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    slides.forEach((slide, i) => {
      const hidden = i !== idx;
      slide.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      slide.querySelectorAll('a').forEach((link) => {
        if (hidden) link.setAttribute('tabindex', '-1');
        else link.removeAttribute('tabindex');
      });
    });
    if (opts.scroll) {
      slidesContainer.scrollTo({ left: slides[idx].offsetLeft, top: 0, behavior: 'smooth' });
    }
  }
  function showSlide(reqIdx) { updateActive((reqIdx + slides.length) % slides.length); }
  indicatorButtons.forEach((b, i) => b.addEventListener('click', () => showSlide(i)));
  region.querySelector('.slide-prev')?.addEventListener('click', () => showSlide(parseInt(region.dataset.activeSlide, 10) - 1));
  region.querySelector('.slide-next')?.addEventListener('click', () => showSlide(parseInt(region.dataset.activeSlide, 10) + 1));
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        updateActive(parseInt(entry.target.dataset.slideIndex, 10), { scroll: false });
      }
    }),
    { root: slidesContainer, threshold: 0.6 },
  );
  slides.forEach((s) => observer.observe(s));
  updateActive(parseInt(region.dataset.activeSlide, 10) || 0, { scroll: false });
}

function buildCarousel(block, articles, config, placeholders) {
  const region = div({
    class: 'article-list-carousel',
    role: 'region',
    'aria-roledescription': placeholders.carousel || 'Carousel',
    'data-active-slide': '0',
  });
  const slidesWrapper = ul({ class: 'carousel-slides' });
  const indicators = ul({ class: 'carousel-slide-indicators' });
  articles.forEach((article, i) => {
    const slide = li({ class: 'carousel-slide', 'data-slide-index': i });
    slide.append(buildCard(article, i === 0, config));
    slidesWrapper.append(slide);
    const indicatorBtn = btnEl({
      type: 'button',
      'aria-label': `${placeholders.showSlide || 'Show Slide'} ${i + 1} ${placeholders.of || 'of'} ${articles.length}`,
    });
    indicators.append(li({ class: 'carousel-slide-indicator', 'data-target-slide': i }, indicatorBtn));
  });
  region.append(slidesWrapper);
  if (articles.length > 1) region.append(indicators);
  if (articles.length > 3) {
    region.append(
      div(
        { class: 'carousel-navigation-buttons' },
        btnEl({ type: 'button', class: 'slide-prev', 'aria-label': placeholders.previousSlide || 'Previous Slide' }),
        btnEl({ type: 'button', class: 'slide-next', 'aria-label': placeholders.nextSlide || 'Next Slide' }),
      ),
    );
  }
  block.append(region);
  if (articles.length > 1) initCarouselInteractions(region);
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------
async function renderArticleList(block, config) {
  // Hardcoded UI strings — no fetchPlaceholders in this project
  const placeholders = {
    pagination: 'Pagination',
    previousPage: 'Previous Page',
    nextPage: 'Next Page',
    page: 'Page',
    noResults: 'No results',
    carousel: 'Carousel',
    showSlide: 'Show Slide',
    of: 'of',
    previousSlide: 'Previous Slide',
    nextSlide: 'Next Slide',
  };
  block.innerHTML = '';
  if (config.title) block.append(h3({ class: 'article-list-title' }, config.title));
  const all = (await fetchIndex()).filter((entry) => isArticleTemplate(entry));
  let filtered = filterArticles(all, config);
  filtered = sortArticles(filtered, config);
  if (config.blogLimit > 0) filtered = filtered.slice(0, config.blogLimit);
  if (!filtered.length) {
    block.append(div({ class: 'article-list-empty' }, placeholders.noResults || 'No results'));
    block.classList.add('loaded');
    return;
  }
  const isCarousel = config.displayMode === 'carousel';
  block.classList.toggle('mode-carousel', isCarousel);
  block.classList.toggle('mode-paginated', !isCarousel);
  if (!config.showImagesOnMobile && !isCarousel) block.classList.add('hide-mobile-images');
  if (isCarousel) {
    buildCarousel(block, filtered, config, placeholders);
    block.classList.add('loaded');
    return;
  }
  const grid = div({ class: 'article-list-grid' });
  block.append(grid);
  const totalPages = Math.ceil(filtered.length / config.limit);
  const params = new URLSearchParams(window.location.search);
  const pParam = parseInt(params.get(PAGE_PARAM) || '1', 10);
  const isValidPage = !Number.isNaN(pParam) && pParam > 0;
  const currentPage = isValidPage ? clamp(pParam - 1, 0, totalPages - 1) : 0;
  const state = {
    currentPage, pageSize: config.limit, totalPages, articles: filtered, config, pagedRoot: grid,
  };
  renderPage(state);
  buildPagination(block, state, placeholders);
  block.classList.add('loaded');
}

// ---------------------------------------------------------------------------
// Lazy loading helper
// ---------------------------------------------------------------------------
function isBlockEager(block) {
  const section = block.closest('.section');
  if (!section) return true;
  const allSections = [...document.querySelectorAll('.section')];
  return allSections.indexOf(section) < 1;
}

// ---------------------------------------------------------------------------
// Decorate — reads rows positionally, matches _article-list.json field order
// ---------------------------------------------------------------------------
export default async function decorate(block) {
  const rows = [...block.children];

  // Destructure positionally — order must match _article-list.json exactly
  const [
    displayModeRow, // 0  displayMode            (select)
    titleRow, // 1  title                  (text)
    filterRow, // 2  filter                 (select)
    tagsRow, // 3  tags                   (text, comma-separated)
    authorUrlRow, // 4  authorUrl              (aem-content)
    pathsRow, // 5  paths                  (aem-content, multi)
    sortRow, // 6  sort                   (select)
    shuffleRow, // 7  sortCategoryShuffleOrder (select)
    limitRow, // 8  limit                  (select)
    blogLimitRow, // 9  blogLimit              (select)
    descriptionWordLimitRow, // 10 descriptionWordLimit   (select)
    showImagesRow, // 11 showImagesOnMobile     (select)
    hidePaginationRow, // 12 hidePagination         (select)
    // classesRow (13) is auto-applied as CSS class by the framework — no need to read it
  ] = rows;

  // Build raw config object from rows
  // Key names match what normalizeConfig reads (lowercase, no camelCase)
  const rawConfig = {
    displaymode: getRowText(displayModeRow),
    title: getRowText(titleRow),
    filter: getRowText(filterRow),
    tags: getRowText(tagsRow), // comma-separated string → toArray() in normalizeConfig
    authorurl: getRowHref(authorUrlRow),
    paths: getRowHrefs(pathsRow), // string[] from multi aem-content
    sort: getRowText(sortRow),
    'sort-category-shuffle-order': getRowText(shuffleRow),
    limit: getRowText(limitRow),
    'blog-limit': getRowText(blogLimitRow),
    descriptionwordlimit: getRowText(descriptionWordLimitRow),
    showimagesonmobile: getRowText(showImagesRow),
    hidepagination: getRowText(hidePaginationRow),
    // classesRow is auto-applied by the framework — no need to read it
  };

  // Remove all rows — the decorator builds its own DOM
  rows.forEach((row) => row.remove());

  const config = normalizeConfig(rawConfig);
  block.classList.add('article-list');

  if (isBlockEager(block)) {
    await renderArticleList(block, config);
  } else {
    block.style.minHeight = '400px';
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            obs.unobserve(entry.target);
            renderArticleList(block, config).catch((error) => {
              // eslint-disable-next-line no-console
              console.error('article-list: lazy load failed', error);
              block.textContent = 'Failed to load articles';
            });
          }
        });
      },
      { rootMargin: '500px', threshold: 0.01 },
    );
    observer.observe(block);
  }
}
