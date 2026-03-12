import { div, iframe } from './dom-helpers.js';

// Session Storage utilities
export const getSessionStorageItem = (prop) => window.sessionStorage.getItem(prop);
export const setSessionStorageItem = (prop, value) => window.sessionStorage.setItem(prop, value);

export const getPropFromSessionStorageObj = (prop, key) => {
  const obj = JSON.parse(sessionStorage.getItem(prop));
  return obj && obj[key] ? obj[key] : '';
};

// Environment detection utilities
export const isAEMPreview = () => window.location.host.includes('aem.page');

export const isAEMProd = () => window.location.host.includes('aem.live');

export function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  return parts.map((p) => (p.type === 'month' ? p.value.toUpperCase() : p.value)).join('');
}

export function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slug(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const HTML_EXTENSION = '.html';
const PROTOCOL_PATTERN = /^[a-zA-Z][\w+.-]*:/;

export function shouldMutateLinksForHost(hostname) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.live') || host.endsWith('.page')) return false;
  if (host === '127.0.0.1' || host === '::1') return false;
  return true;
}

/**
 * Convert absolute URL to relative URL based on current domain.
 * On non-splunk.com domains (localhost, .page, .live), uses the path parameter if provided.
 * Otherwise extracts the pathname from the URL.
 * @param {string} url - The absolute or relative URL to convert
 * @param {string} path - Optional path to use for non-splunk.com domains
 * @returns {string} The converted relative URL
 */
export function toRelativeUrl(url, path) {
  if (!url) return '';

  try {
    const currentHost = window.location.hostname?.toLowerCase();
    const isSplunkDomain = currentHost === 'splunk.com' || currentHost.endsWith('.splunk.com');

    // On non-splunk domains, use path if provided
    if (!isSplunkDomain && path) {
      return path;
    }

    // Parse URL and extract pathname
    const urlObj = new URL(url, window.location.origin);
    return urlObj.pathname;
  } catch (e) {
    // If URL parsing fails, return the original value
    return url;
  }
}

const allowHtmlExtensionUpdate = typeof window !== 'undefined' && shouldMutateLinksForHost(window.location.hostname);

function appendHtmlExtensionIfNeeded(link) {
  if (!allowHtmlExtensionUpdate) return;

  const rawHref = link.getAttribute('href');
  if (!rawHref || rawHref.startsWith('#')) return;
  if (/^(mailto|tel|javascript):/i.test(rawHref)) return;

  const isProtocolRelative = rawHref.startsWith('//');
  const isAbsolute = PROTOCOL_PATTERN.test(rawHref) || isProtocolRelative;

  let url;
  try {
    url = new URL(rawHref, window.location.href);
  } catch (error) {
    return;
  }

  const currentHost = window.location.hostname?.toLowerCase();
  const targetHost = url.hostname?.toLowerCase();
  if (targetHost && currentHost && targetHost !== currentHost) return;

  const { pathname } = url;
  if (!pathname || pathname === '/' || pathname.endsWith('/')) return;

  const lastSegment = pathname.split('/').pop();
  if (!lastSegment || lastSegment.includes('.')) return;

  if (lastSegment === 'blog') return;

  url.pathname = `${pathname}${HTML_EXTENSION}`;

  let nextHref;
  if (!isAbsolute && !rawHref.startsWith('/')) {
    const queryIndex = rawHref.indexOf('?');
    const hashIndex = rawHref.indexOf('#');
    let boundary = -1;
    if (queryIndex !== -1 && hashIndex !== -1) {
      boundary = Math.min(queryIndex, hashIndex);
    } else if (queryIndex !== -1) {
      boundary = queryIndex;
    } else if (hashIndex !== -1) {
      boundary = hashIndex;
    }

    const prefix = boundary === -1 ? rawHref : rawHref.slice(0, boundary);
    const suffix = boundary === -1 ? '' : rawHref.slice(boundary);
    if (!prefix || prefix.endsWith('/')) return;

    const prefixSegment = prefix.split('/').pop();
    if (!prefixSegment || prefixSegment === '.' || prefixSegment === '..' || prefixSegment.includes('.')) return;

    nextHref = `${prefix}${HTML_EXTENSION}${suffix}`;
  } else if (rawHref.startsWith('//')) {
    nextHref = `//${url.host}${url.pathname}${url.search}${url.hash}`;
  } else if (PROTOCOL_PATTERN.test(rawHref)) {
    nextHref = url.href;
  } else {
    nextHref = `${url.pathname}${url.search}${url.hash}`;
  }

  link.setAttribute('href', nextHref);
}

// new: return the blog home path (everything before /blog) e.g. "/prod/en-us/blog"
export function getBlogHomePath() {
  if (typeof window === 'undefined' || !window.location) return '/';
  const { pathname } = window.location;
  const blogIndex = pathname.indexOf('/blog');
  if (blogIndex === -1) return '/';
  return `${pathname.substring(0, blogIndex)}/blog`;
}

/**
 * Decorate links within the provided root (defaults to document).
 * External links (non-splunk domains) open in a new tab and get 'external-link' class.
 * PDF links (including relative/internal) also open in a new tab but are not marked external.
 * @param {ParentNode|Document|Element} root container to scope link selection.
 */
export function decorateLinks(root = document) {
  if (!root) return;
  const links = root.querySelectorAll('a[href]');
  links.forEach((link) => {
    const { href } = link;
    if (!href || href.startsWith('#')) return;

    appendHtmlExtensionIfNeeded(link);

    const hrefAttr = link.getAttribute('href');
    // If href is relative (starts with /), treat it as internal
    const isRelative = hrefAttr.startsWith('/');

    const url = new URL(hrefAttr, window.location.href);
    const host = url.hostname.toLowerCase();
    // Treat anything NOT in splunk.com (incl. subdomains) as external.
    const isSplunkDomain = host === 'splunk.com' || host.endsWith('.splunk.com');
    // Open PDF links in a new tab even if they are internal/relative.
    const isPdf = url.pathname.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      link.target = '_blank';
      // Intentionally do NOT add 'external-link' class for internal PDFs.
      return;
    }
    // Only mark as external if it's not relative and not a Splunk domain
    if (host && !isRelative && !isSplunkDomain) {
      link.target = '_blank';
      link.classList.add('external-link');
    }
  });
}

// NEW: derive parent path prefix for placeholders
export function getPlaceholdersPrefix() {
  if (typeof window === 'undefined' || !window.location) return 'default';
  let path = window.location.pathname.replace(/\/$/, '');
  // remove filename with extension
  const last = path.split('/').pop();
  if (/\.[a-z0-9]+$/i.test(last)) {
    path = path.split('/').slice(0, -1).join('/');
  }
  const segments = path.split('/').filter(Boolean);
  if (!segments.length) return 'default';
  // drop current leaf to get parent
  segments.pop();
  if (!segments.length) return 'default';
  return `/${segments.join('/')}`;
}

/**
 * Find the nearest block container (parent element with a block class)
 * @param {Element} element - The element to start searching from
 * @returns {string} The block name or 'page' if not found
 */
export function findNearestBlockContainer(element) {
  if (!element) return 'page';

  let current = element;
  while (current && current !== document.body && current !== document.documentElement) {
    if (!current.parentElement) break;

    // Check for header or footer at tag level (highest priority)
    const tagName = current.tagName?.toLowerCase();
    if (tagName === 'header') return 'header';
    if (tagName === 'footer') return 'footer';

    if (current.classList) {
      // Check for form-content with formName (thank-you page after form submission)
      if (current.classList.contains('form-content') && current.dataset.formName) {
        // Return in format: SplunkForm (capitalized first letter + "Form")
        const { formName } = current.dataset;
        const capitalized = formName.charAt(0).toUpperCase() + formName.slice(1);
        return `${capitalized}Form`;
      }

      // Check for block wrapper pattern (e.g., article-list-wrapper, hero-wrapper)
      const wrapperClass = Array.from(current.classList).find((cls) => cls.endsWith('-wrapper'));
      if (wrapperClass) {
        const cleanName = wrapperClass.replace('-wrapper', '');
        // Don't return generic wrapper names
        if (cleanName !== 'content' && cleanName !== 'default-content' && cleanName !== 'btn') {
          return cleanName;
        }
      }

      // Check for direct block class
      if (current.classList.contains('block')) {
        // Try to find a more specific block name from sibling classes
        // Prioritize specific block names over generic ones
        const blockClass = Array.from(current.classList).find(
          (cls) => cls !== 'block'
            && !cls.startsWith('section')
            && cls !== 'appear'
            // Exclude generic block type names
            && cls !== 'columns',
        );
        if (blockClass) return blockClass;

        // If no specific class found, fall back to data-block-name
        const blockName = current.getAttribute('data-block-name');
        if (blockName) return blockName;
      }
    }
    current = current.parentElement;
  }
  return 'page';
}

/**
 * Get additional container context (e.g., nav items, sections)
 * @param {Element} element - The link element
 * @returns {string} Additional container context
 */
export function getLinkContainer(element) {
  if (!element) return '';

  let current = element;
  while (current && current !== document.body) {
    if (current.classList) {
      // Check if we're in a nav-drop within nav-sections
      if (current.classList.contains('nav-drop')) {
        // Look for the menu-item-label sibling to determine which menu this is
        const menuWrapper = current.closest('.menu-wrapper');
        if (menuWrapper) {
          const menuLabel = menuWrapper.querySelector('.menu-item-label');
          if (menuLabel) {
            const labelText = menuLabel.textContent?.trim().toLowerCase();
            // Return just the menu name, removing any "flyout" prefix
            if (labelText) {
              return labelText.replace(/^flyout[- ]*/i, '');
            }
          }
        }
      }

      // Check for navigation items
      if (current.classList.contains('nav-sections')) return 'GlobalHeader';
      if (current.classList.contains('nav-tools')) return 'UtilityNav';

      // Check for specific containers
      if (current.classList.contains('hero-content')) return 'Hero';
      if (current.classList.contains('cards-container')) return 'Cards';
      if (current.classList.contains('article-list-container')) return 'ArticleList';

      // Check for section containers
      if (current.classList.contains('section')) {
        const sectionClasses = Array.from(current.classList).find((cls) => cls !== 'section' && cls !== 'appear');
        if (sectionClasses) return sectionClasses;
      }
    }
    current = current.parentElement;
  }
  return '';
}

/**
 * Get article position within article-list block
 * @param {Element} link - The link element
 * @returns {string} Position string (e.g., "Related Articles1") or empty string
 */
function getArticleListPosition(link) {
  if (!link) return '';

  // Check if link is within an article-list block
  const articleListBlock = link.closest('.article-list.block');
  if (!articleListBlock) return '';

  // Find the section title - check multiple locations
  let sectionTitle = '';

  // 1. Check for h3.article-list-title inside the block (first child, not nested in cards)
  const h3Title = articleListBlock.querySelector(':scope > .article-list-title');
  if (h3Title) {
    sectionTitle = h3Title.textContent?.trim() || '';
  }

  // 2. Look in the parent section container for headings
  if (!sectionTitle) {
    // Find the section container (e.g., .article-list-container or .section)
    const sectionContainer = articleListBlock.closest('.article-list-container, .section');
    if (sectionContainer) {
      // Look for h2 or h3 in the section container that comes before the article list
      const allHeadings = Array.from(sectionContainer.querySelectorAll('h2, h3'));
      const validHeading = allHeadings.find((heading) => {
        // Exclude headings inside article cards
        if (heading.closest('.article-list-card') || heading.closest('.article-card-content')) {
          return false;
        }
        // Check if this heading comes before the article-list block
        const position = heading.compareDocumentPosition(articleListBlock);
        // eslint-disable-next-line no-bitwise
        return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
      if (validHeading) {
        sectionTitle = validHeading.textContent?.trim() || '';
      }
    }
  }

  // 3. Check for h2/h3 as previous sibling of the block or its wrapper
  if (!sectionTitle) {
    let current = articleListBlock;
    // Walk up to find a heading, checking previous siblings at each level
    while (current && current !== document.body) {
      let sibling = current.previousElementSibling;
      let count = 0;
      while (sibling && count < 5) {
        const tagName = sibling.tagName?.toUpperCase();
        if (tagName === 'H2' || tagName === 'H3') {
          sectionTitle = sibling.textContent?.trim() || '';
          break;
        }
        // Also check inside sibling wrappers (e.g., default-content-wrapper)
        if (!sectionTitle) {
          const headingInSibling = sibling.querySelector('h2, h3');
          if (headingInSibling) {
            sectionTitle = headingInSibling.textContent?.trim() || '';
            break;
          }
        }
        sibling = sibling.previousElementSibling;
        count += 1;
      }
      if (sectionTitle) break;
      current = current.parentElement;
      // Stop at section or article-list-container level
      if (current?.classList?.contains('section') || current?.classList?.contains('article-list-container')) {
        break;
      }
    }
  }

  // Check if we're on an author bio page (takes precedence)
  if (window.location.pathname.includes('/author/')) {
    return 'Articles List - Author Bio Page';
  }

  // If we found a section title, return it with "Articles List" prefix
  if (sectionTitle) {
    let position = `Articles List - ${sectionTitle}`;

    // Check if the article-list has "curated" class
    if (articleListBlock.classList.contains('curated')) {
      position += ' - Curated';
    }

    return position;
  }

  // If no section title found, don't track position
  return '';
}

/**
 * Track link click and push to dataLayer
 * @param {Element} link - The link element that was clicked
 */
export function trackLinkClick(link) {
  if (!link || !window.dataLayer) return;

  try {
    const url = new URL(link.href, window.location.href);
    const linkText = link.textContent?.trim() || link.getAttribute('aria-label') || '';
    const linkDomain = url.hostname || window.location.hostname;
    // Use relative path (pathname + search + hash) for link_url
    const linkUrl = `${url.pathname}${url.search}${url.hash}`;
    let linkPosition = findNearestBlockContainer(link);
    const linkContainer = getLinkContainer(link);
    let linkClasses = Array.from(link.classList).join(' ');
    const linkId = link.id || '';

    if (linkPosition === 'fragment') {
      linkPosition = linkContainer;
    }

    if (linkPosition === 'nav') {
      linkPosition = 'GlobalHeader';
    }

    // If link is within nav-sections (GlobalHeader), set link_position to GlobalHeader
    if (link.closest('.nav-sections')) {
      linkPosition = 'GlobalHeader';
    }

    // If link is within nav-blogs section, set link_position to subnav or Subnav
    if (link.closest('.nav-blogs')) {
      // Check if link is within a dropdown (blogs-nav-drop submenu or mobile-blogs-dropdown)
      const isInDropdown = link.closest('.blogs-nav-drop ul') || link.closest('.mobile-blogs-dropdown');
      linkPosition = isInDropdown ? 'Subnav' : 'subnav';

      // Set link_classes to empty string for Subnav dropdown links
      if (linkPosition === 'Subnav') {
        linkClasses = '';
      }
    }

    // If link is within footer tag, set link_position to GlobalFooter
    if (link.closest('footer') || linkPosition === 'footer') {
      linkPosition = 'GlobalFooter';
    }

    // Check if link is within article-list and get position
    const articlePosition = getArticleListPosition(link);
    if (articlePosition) {
      linkPosition = articlePosition;
    }

    // Build dataLayer object with only meaningful values
    const dataLayerEvent = {
      event: 'link_click',
      link_text: linkText,
      link_domain: linkDomain,
      link_url: linkUrl,
      link_position: linkPosition,
    };

    // Only add optional properties if they have meaningful values
    if (linkContainer) {
      dataLayerEvent.link_container = linkContainer;
    }
    // Always add link_classes for Subnav (even if empty), otherwise only if it has a value
    if (linkPosition === 'Subnav' || linkClasses) {
      dataLayerEvent.link_classes = linkClasses;
    }
    if (linkId) {
      dataLayerEvent.link_id = linkId;
    }

    // Push to dataLayer
    window.dataLayer.push(dataLayerEvent);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error tracking link click:', error);
  }
}

/**
 * Parse comma or newline separated values from metadata
 * @param {string} value The metadata value to parse
 * @param {string} separator Primary separator (',' or '\n')
 * @returns {Array} Array of parsed values
 */
export function parseMetadataList(value, separator = ',') {
  if (!value) return [];
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item);
}

/**
 * Get social share configuration for different platforms
 * @param {string} url The URL to share (encoded)
 * @param {string} title The title to share (encoded)
 * @returns {Array} Array of social platform configurations
 */
export function getSocialShareConfig(url, title) {
  const shareText = encodeURIComponent('Found this useful link for you. #splunk');
  const summary = encodeURIComponent('Found this useful link for you.');

  return [
    {
      platform: 'twitter',
      title: 'Share on X',
      icon: '/icons/x-social.svg',
      url: `https://twitter.com/intent/tweet?text=${shareText}&url=${url}`,
      class: 'icon-x',
    },
    {
      platform: 'facebook',
      title: 'Share on Facebook',
      icon: '/icons/facebook-social.svg',
      url: `https://www.facebook.com/sharer/sharer.php?u=${url}&title=${title}`,
      class: 'icon-facebook',
    },
    {
      platform: 'linkedin',
      title: 'Share on LinkedIn',
      icon: '/icons/linkedin-social.svg',
      url: `http://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${title}&summary=${summary}`,
      class: 'icon-linkedin',
    },
  ];
}

// Video tracking utilities
/**
 * Push a video event to GTM dataLayer
 * @param {string} eventName - video_start, video_stop, video_complete, video_progress
 * @param {Object} videoData - Video metadata
 * @param {Object} additionalData - Additional data (cumulative_watch_sec, video_threshold)
 */
export function pushVideoEvent(eventName, videoData, additionalData = {}) {
  if (!window.dataLayer) {
    return;
  }

  const eventPayload = {
    event: eventName,
    video_duration: videoData.duration,
    video_provider: videoData.provider || 'vidyard',
    video_url: videoData.url,
    video_title: videoData.title,
    video_type: videoData.type || 'on demand',
    video_player_type: videoData.player_type || 'inline',
    ...additionalData,
  };

  window.dataLayer.push(eventPayload);
}

/**
 * Calculate video progress percentage
 * @param {number} currentTime - Current playback time in seconds
 * @param {number} duration - Total video duration in seconds
 * @returns {number} Progress percentage (0-100)
 */
export function calculateVideoProgress(currentTime, duration) {
  if (!duration || duration === 0) return 0;
  return (currentTime / duration) * 100;
}

/**
 * Check if a progress threshold has been reached
 * @param {number} percentWatched - Current progress percentage
 * @param {number} threshold - Threshold to check (25, 50, 75, 100)
 * @returns {boolean} True if threshold is reached
 */
export function hasReachedThreshold(percentWatched, threshold) {
  // For 100%, trigger at 99% as requested
  const triggerPoint = threshold === 100 ? 99 : threshold;
  return percentWatched >= triggerPoint;
}

export function shouldShowPushdownBanner() {
  const cookie = document.cookie.split('; ').find((row) => row.startsWith('pushdownBanner='));
  if (!cookie) return true;
  const timestamp = Number(cookie.split('=')[1]);
  if (!timestamp) return true;
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp > twoDays;
}

export function setPushdownBannerCookie(timestamp) {
  const expiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
  document.cookie = `pushdownBanner=${timestamp}; expires=${expiry.toUTCString()}; path=/`;
}

window.pushdownBannerUtils = {
  shouldShowPushdownBanner,
  setPushdownBannerCookie,
};

/**
 * Converts YouTube video links in tables to embedded video players.
 * @param {Element} container - The container element to search for video links
 */
export function convertTableVideoLinks(container) {
  if (!container) return;

  container.querySelectorAll('table a[href*="youtube"]').forEach((link) => {
    const table = link.closest('table');
    try {
      const url = new URL(link.href);
      const vid = url.searchParams.get('v')
        || (url.hostname === 'youtu.be' && url.pathname.substring(1))
        || (url.pathname.includes('/embed/') && url.pathname.split('/embed/')[1]?.split('?')[0]);

      if (vid) {
        table.replaceWith(
          div(
            { class: 'table-video-embed' },
            div(
              { style: 'position:relative;width:600px;max-width:100%;aspect-ratio:16/9;overflow:hidden;' },
              iframe({
                src: `https://www.youtube.com/embed/${vid}`,
                style: 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;',
                allowfullscreen: '',
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
                loading: 'lazy',
                title: 'YouTube video player',
              }),
            ),
          ),
        );
      }
    } catch (e) {
      /* invalid URL */
    }
  });
}
