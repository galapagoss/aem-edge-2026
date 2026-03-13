import { getMetadata, createOptimizedPicture } from '../../../scripts/aem.js';
import {
  formatDate, toTitleCase, slug, getBlogHomePath,
} from '../../../scripts/util.js';
import {
  div, a, h1, span, domEl,
} from '../../../scripts/dom-helpers.js';

export default async function decorate(block) {
  const title = getMetadata('og:title') || document.title || '';
  let imageUrl = getMetadata('og:image') || '';

  if (imageUrl && imageUrl.includes('default-meta-image.png')) imageUrl = '';

  const hideImageMeta = getMetadata('hideimage') || getMetadata('hide-image') || '';
  if (hideImageMeta) imageUrl = '';

  const publishRaw = getMetadata('publishdate') || getMetadata('published') || '';
  const readTime = getMetadata('readtime') || getMetadata('read-time') || '';
  const category = (getMetadata('category') || '').trim();
  const publishDateFormatted = formatDate(publishRaw);

  block.textContent = '';

  // eyebrow row — category, date, read time
  const metaRow = div({ class: 'article-hero-meta' });

  if (category) {
    const blogHome = getBlogHomePath();
    const catLink = a(
      {
        class: 'article-hero-category',
        href: `${blogHome}/${slug(category)}`,
      },
      toTitleCase(category),
    );
    metaRow.appendChild(div({ class: 'article-hero-category-wrap' }, catLink));
  }

  if (publishDateFormatted) {
    metaRow.appendChild(
      domEl('time', { class: 'article-hero-date', datetime: publishRaw || publishDateFormatted }, publishDateFormatted),
    );
  }

  if (readTime) {
    if (publishDateFormatted || category) {
      metaRow.appendChild(span({ class: 'article-hero-sep' }, '|'));
    }
    metaRow.appendChild(span({ class: 'article-hero-readtime' }, readTime.toUpperCase()));
  }

  if (metaRow.childElementCount) block.appendChild(metaRow);

  // title
  const content = div({ class: 'article-hero-content' });
  if (title) {
    // strip " | EDS POC" suffix if present
    content.appendChild(h1({ class: 'article-hero-title' }, title.replace(/\s*\|.*$/, '')));
  }
  block.appendChild(content);

  // image
  if (imageUrl) {
    const picture = createOptimizedPicture(imageUrl, title, true, [
      { media: '(min-width: 1600px)', width: '2400' },
      { media: '(min-width: 1200px)', width: '2000' },
      { media: '(min-width: 900px)', width: '1400' },
      { media: '(min-width: 600px)', width: '1000' },
      { width: '700' },
    ]);
    picture.classList.add('article-hero-image');
    block.appendChild(picture);
  } else {
    block.classList.add('no-image');
  }

  block.classList.add('article-hero-loaded');
}
