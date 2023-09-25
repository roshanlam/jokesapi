// Cache results so that repeated requests are not sent
interface CacheEntry {
  ttl: number;
  value: any;
}

const HOUR = 1000 * 60 * 60;

// Load cache from localStorage
const cache: Record<string, CacheEntry> = JSON.parse(localStorage.getItem('cache') || '{}');

// Save cache to localStorage when window is closed or refreshed
window.addEventListener('beforeunload', () => {
  localStorage.setItem('cache', JSON.stringify(cache));
});

// Limit new requests so students don't get rate-limited
const limiterMap = new Map<string, any>();
const LIMITER_OPTIONS = {
  minTime: 500,
};

/**
 * Fetches the JSON content at a URL, caches results and bottlenecks requests
 * @param url A url to a JSON object
 * @returns A promise that resolves to the JSON content of a page
 */
export function fetchJSON<T = any>(url: string): Promise<T> {
  if (url in cache && Date.now() < cache[url].ttl) {
    return Promise.resolve(cache[url].value);
  }

  const parsedURL = new URL(url);
  const host = parsedURL.hostname;

  let limiter = limiterMap.get(host);
  if (!limiter) {
    limiter = new Bottleneck(LIMITER_OPTIONS); // You may need to implement a simple version of Bottleneck or find a suitable replacement
    limiterMap.set(host, limiter);
  }

  return new Promise((resolve, reject) => {
    limiter.schedule(() => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          const json = JSON.parse(xhr.responseText);
          // Add JSON results to cache
          cache[url] = {
            ttl: Date.now() + HOUR,
            value: json,
          };
          resolve(json as T);
        } else {
          reject(`Received status code ${xhr.status}: ${xhr.statusText}`);
        }
      };
      xhr.onerror = function () {
        reject('Network error');
      };
      xhr.send();
    });
  });
}
