const KNOWN_LOCALES = Object.freeze(['en_us', 'de_de', 'fr_fr']);
const DEFAULT_LOCALE = KNOWN_LOCALES[0];

const hasWindow = typeof window !== 'undefined' && typeof window.location === 'object';

function normalizePathname(pathname) {
  if (!pathname || typeof pathname !== 'string') return '';
  return pathname.split('?')[0].split('#')[0];
}

function normalizeLocaleSegment(segment) {
  if (!segment || typeof segment !== 'string') return '';
  return segment.toLowerCase().replace(/-/g, '_');
}

function resolveHost(providedHost) {
  if (providedHost && typeof providedHost === 'string') {
    return providedHost.toLowerCase();
  }
  if (hasWindow && typeof window.location?.hostname === 'string') {
    return window.location.hostname.toLowerCase();
  }
  return '';
}

function pickLocaleSegment(pathname) {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split('/').filter(Boolean);
  const [localeRaw = ''] = segments;
  return normalizeLocaleSegment(localeRaw);
}

export function resolveLocale(pathname, options = {}) {
  let source = '';
  if (typeof pathname === 'string') {
    source = pathname;
  } else if (hasWindow) {
    source = window.location.pathname;
  }
  const host = resolveHost(options.host);
  const isCDN = host && host.includes('splunk.com');
  const locale = pickLocaleSegment(source);

  const localeValid = KNOWN_LOCALES.includes(locale);

  return {
    locale: localeValid ? locale : DEFAULT_LOCALE,
    matched: localeValid,
    isCDN,
  };
}

export function buildIndexPath(indexName, options = {}) {
  if (!indexName) {
    throw new Error('buildIndexPath requires an indexName');
  }

  const {
    pathname, localeOverride, fallbackPath, host,
  } = options;
  const resolvedHost = host && typeof host === 'string' ? host : undefined;

  const result = resolveLocale(pathname, { host: resolvedHost });
  let { locale, matched } = result;
  const { isCDN } = result;

  if (localeOverride && typeof localeOverride === 'string') {
    const nextLocale = normalizeLocaleSegment(localeOverride);
    if (KNOWN_LOCALES.includes(nextLocale)) {
      locale = nextLocale;
      matched = true;
    }
  }

  if (matched) {
    if (isCDN) {
      return `/${locale}/${indexName}-index.json`;
    }
    const localeWithDash = locale.replace(/_/g, '-');
    return `/${localeWithDash}/${indexName}-index.json`;
  }

  if (fallbackPath) {
    return fallbackPath;
  }

  if (isCDN) {
    return `/${locale}/${indexName}-index.json`;
  }
  const localeWithDash = locale.replace(/_/g, '-');
  return `/${localeWithDash}/${indexName}-index.json`;
}

export const KNOWN_LOCALES_LIST = KNOWN_LOCALES;
export const DEFAULT_INDEX_LOCALE = DEFAULT_LOCALE;
