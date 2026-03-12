/**
 * Global Index Cache
 * Singleton pattern to cache article/author/query indexes and prevent duplicate API calls.
 * Multiple blocks on the same page can share the cached data.
 */

import ffetch from './ffetch.js';
import { buildIndexPath } from './index-path.js';

class IndexCache {
  constructor() {
    // Cache storage: { indexType: { promise, data, error } }
    this.cache = new Map();
    // Track active fetch promises to prevent race conditions
    this.fetchPromises = new Map();
  }

  /**
   * Fetch an index with caching
   * @param {string} indexType - Type of index ('article', 'author', 'query')
   * @param {Object} options - Optional configuration
   * @param {boolean} options.forceRefresh - Force a fresh fetch ignoring cache
   * @returns {Promise<Array>} The index data
   */
  async fetch(indexType, options = {}) {
    const { forceRefresh = false } = options;

    // Return cached data if available and not forcing refresh
    if (!forceRefresh && this.cache.has(indexType)) {
      const cached = this.cache.get(indexType);
      if (cached.data) {
        return cached.data;
      }
      if (cached.error) {
        throw cached.error;
      }
    }

    // If there's already a fetch in progress, wait for it
    if (this.fetchPromises.has(indexType)) {
      return this.fetchPromises.get(indexType);
    }

    // Start a new fetch
    const fetchPromise = this.fetchIndexInternal(indexType);
    this.fetchPromises.set(indexType, fetchPromise);

    try {
      const data = await fetchPromise;
      this.cache.set(indexType, { data, error: null });
      return data;
    } catch (error) {
      this.cache.set(indexType, { data: null, error });
      throw error;
    } finally {
      this.fetchPromises.delete(indexType);
    }
  }

  /**
   * Internal method to fetch index data
   */
  // eslint-disable-next-line class-methods-use-this
  async fetchIndexInternal(indexType) {
    try {
      const endpoint = buildIndexPath(indexType);
      const entries = await ffetch(endpoint).all();
      return Array.isArray(entries) ? entries : [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`index-cache: failed to fetch ${indexType} index`, error);
      throw error;
    }
  }

  /**
   * Check if an index is cached
   * @param {string} indexType - Type of index
   * @returns {boolean}
   */
  has(indexType) {
    return this.cache.has(indexType) && this.cache.get(indexType).data !== null;
  }

  /**
   * Get cached data without fetching (returns null if not cached)
   * @param {string} indexType - Type of index
   * @returns {Array|null}
   */
  getCached(indexType) {
    const cached = this.cache.get(indexType);
    return cached?.data || null;
  }

  /**
   * Clear specific cache or all caches
   * @param {string} indexType - Optional specific index to clear
   */
  clear(indexType) {
    if (indexType) {
      this.cache.delete(indexType);
      this.fetchPromises.delete(indexType);
    } else {
      this.cache.clear();
      this.fetchPromises.clear();
    }
  }

  /**
   * Get cache statistics (for debugging)
   * @returns {Object}
   */
  getStats() {
    const stats = {
      cached: [],
      pending: [],
    };

    this.cache.forEach((value, key) => {
      if (value.data) {
        stats.cached.push({ type: key, count: value.data.length });
      }
    });

    this.fetchPromises.forEach((value, key) => {
      stats.pending.push(key);
    });

    return stats;
  }
}

// Export singleton instance
const indexCache = new IndexCache();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  window.indexCache = indexCache;
}

export default indexCache;
