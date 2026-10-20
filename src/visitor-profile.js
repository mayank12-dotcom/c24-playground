export const VISITOR_NAME_STORAGE_KEY = 'common-ground.visitor-name.v1';
export const MAX_VISITOR_NAME_LENGTH = 32;

// This module is also used by the server: keep normalization independent of DOM
// and storage. Count code points so an emoji is never cut into half a surrogate.
export function normalizeVisitorName(value) {
  if (typeof value !== 'string') return '';
  const clean = value
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\u200b\u202a-\u202e\u2066-\u2069\ufeff]/gu, '')
    .trim();
  const normalized = Array.from(clean).slice(0, MAX_VISITOR_NAME_LENGTH).join('').trim();
  // A display name made entirely of invisible joiners is not a usable name.
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(normalized) ? normalized : '';
}

export function createVisitorProfile({ window, storage } = {}) {
  let localStorage = storage;
  if (localStorage === undefined) {
    try { localStorage = window?.localStorage; } catch { localStorage = null; }
  }
  let name = null;
  try { name = normalizeVisitorName(localStorage?.getItem(VISITOR_NAME_STORAGE_KEY)) || null; } catch { /* Private browsing can deny storage. */ }
  return {
    getName() { return name; },
    setName(value) {
      const next = normalizeVisitorName(value);
      if (!next) return null;
      name = next;
      try { localStorage?.setItem(VISITOR_NAME_STORAGE_KEY, name); } catch { /* Keep the name for this visit when storage is unavailable. */ }
      return name;
    }
  };
}
