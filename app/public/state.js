import { parseProject, validateProject } from './model.js';

// Optional shared project: when the server sets ATLAS_PROJECT_FILE, GET /api/project returns it.
// A 404 (not configured) or any network failure leaves the browser copy untouched. The ETag is the
// version marker: the file is only loaded when it differs from the one this browser already loaded.
// The request, including reading the body, is abandoned after `timeoutMs`: a slow or stalled server
// must never keep the editor waiting, and an abandoned request counts as "unavailable".
export const SHARED_PROJECT_TIMEOUT_MS = 5000;

export async function fetchSharedProject(fetchFn, seenEtag, { timeoutMs = SHARED_PROJECT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchFn('/api/project', { cache: 'no-cache', credentials: 'same-origin', signal: controller.signal });
    } catch {
      return { status: 'unavailable' };
    }
    if (!response.ok) return { status: 'unavailable' };
    const etag = response.headers.get('ETag') || '';
    if (!etag || etag === seenEtag) return { status: 'unchanged', etag };
    let text;
    try {
      text = await response.text();
    } catch {
      return { status: 'unavailable' };
    }
    try {
      return { status: 'loaded', etag, project: parseProject(text) };
    } catch (error) {
      return { status: 'invalid', etag, error: error.message };
    }
  } finally {
    clearTimeout(timer);
  }
}

export function applyProjectChange(project, mutate) {
  const candidate = structuredClone(project);
  mutate(candidate);
  candidate.revision = project.revision + 1;
  validateProject(candidate);
  return candidate;
}

export function hasStorageConflict(existing, lastStored, tabId) {
  if (!existing || existing === lastStored) return false;
  try { return JSON.parse(existing).tab !== tabId; } catch { return true; }
}

export function updateSelection(selection, id, checked) {
  const next = new Set(selection);
  if (checked) next.add(id); else next.delete(id);
  return next;
}

export function filterInventory(items, query, keys) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(item => keys.some(key => String(item[key] || '').toLowerCase().includes(needle)));
}

export function pngDimensions(width, height, desiredScale = 3, maxSide = 16_384, maxPixels = 36_000_000) {
  if (![width, height, desiredScale].every(Number.isFinite) || width <= 0 || height <= 0 || desiredScale <= 0) throw new Error('Invalid export dimensions.');
  const scale = Math.min(desiredScale, maxSide / width, maxSide / height, Math.sqrt(maxPixels / (width * height)));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
    reduced: scale < desiredScale,
  };
}
