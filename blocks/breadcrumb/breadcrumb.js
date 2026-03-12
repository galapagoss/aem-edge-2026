import indexCache from '../../scripts/index-cache.js';

const buildCrumbs = (pathname, titles) => {
  const segments = pathname.replace(/^\/|\/$/g, '').split('/');
  const crumbs = [];

  segments.forEach((segment, i) => {
    const path = `/${segments.slice(0, i + 1).join('/')}`;
    const isCurrent = i === segments.length - 1;
    const label = isCurrent
      ? document.querySelector('title')?.innerText || segment
      : titles.get(path) || segment;

    crumbs.push({ path, label, current: isCurrent });
  });

  return crumbs;
};

export default async function decorate(block) {
  block.innerHTML = '';

  // indexCache usa ffetch + index-path internamente,
  // maneja deduplicación, race conditions y cache automáticamente
  const data = await indexCache.fetch('breadcrumb');
  const titles = new Map(data.map(({ path, title }) => [path, title]));

  const crumbs = buildCrumbs(window.location.pathname, titles);

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Breadcrumb');
  const ol = document.createElement('ol');

  crumbs.forEach(({ path, label, current }) => {
    const li = document.createElement('li');
    if (current) {
      const span = document.createElement('span');
      span.setAttribute('aria-current', 'page');
      span.textContent = label.replace(/\s*\|.*$/, ''); // strip " | EDS POC" suffix if present... This comes from tittle:suffix metadata
      li.append(span);
    } else {
      const a = document.createElement('a');
      a.href = path;
      a.textContent = label.replace(/\s*\|.*$/, ''); // strip " | EDS POC" suffix if present.... This comes from tittle:suffix metadata
      li.append(a);
    }
    ol.append(li);
  });

  nav.append(ol);
  block.append(nav);
}
