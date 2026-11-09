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
      response = await fetchFn('/api/project', { cache: 'no-cache', credentials: 'same-origin', headers: { 'X-Atlas-Request': '1' }, signal: controller.signal });
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

// Reads the project kept in the browser. 'empty' = nothing stored, 'loaded' = a usable project and the raw text it
// came from, 'unreadable' = something is stored but cannot be used (not JSON, not a valid project, a logo that does
// not decode) while storage itself works, 'unavailable' = storage cannot be read at all. Nothing is written here.
// `parse(text)` throws on an invalid project and `verify(project)` (may be async) throws on one that must not be used.
export async function loadStoredProject({ storage, key, parse, verify }) {
  let raw;
  try { raw = storage.getItem(key); } catch (error) { return { status: 'unavailable', error }; }
  if (!raw) return { status: 'empty' };
  try {
    const project = parse(JSON.parse(raw).data);
    await verify(project);
    return { status: 'loaded', project, raw };
  } catch (error) {
    return { status: 'unreadable', error, raw };
  }
}

export const SHARED_ETAG_KEY = 'homelab-atlas.shared-project-etag';
export const BEFORE_SHARED_KEY = 'homelab-atlas.before-shared-project';
export const UNREADABLE_COPY_KEY = 'homelab-atlas.unreadable-local-copy';

// Keeps the text of a stored project that could not be used, under its own key, before anything overwrites it:
// it may still be recoverable by hand or by another version of the editor. Returns false when it cannot be kept
// (storage full); never throws.
export function keepUnreadableCopy(storage, raw) {
  try { storage.setItem(UNREADABLE_COPY_KEY, raw); return true; } catch { return false; }
}

// Replaces the browser project with the shared file, safely. Nothing is touched unless every step
// before it succeeded: confirm (only when a project already exists) -> back up the old copy ->
// save the new project -> only then remember the file version. A refusal or any failure leaves the
// current project and the remembered version as they were, so the file is offered again next time.
// `commit(project)` installs and saves the new project and returns false when saving failed.
// `currentRaw()` (optional) returns the project as it is on screen at the moment of the backup, after
// the confirmation: that is what gets backed up, so an edit that autosave has not written yet is kept.
export async function adoptSharedProject({ shared, existingRaw, currentRaw, storage, confirmReplace, commit }) {
  // The backup of an earlier replacement, kept aside so it can be put back if this one fails.
  let previousBackup = null;
  if (existingRaw) {
    if (!(await confirmReplace())) return { status: 'declined' };
    try {
      previousBackup = storage.getItem(BEFORE_SHARED_KEY);
      storage.setItem(BEFORE_SHARED_KEY, currentRaw ? currentRaw() : existingRaw);
    } catch {
      return { status: 'backup-failed' };
    }
  }
  if (!commit(shared.project)) {
    // The replacement did not happen, so the backup that was there before must stay exactly as it was.
    let backupKept = true;
    if (previousBackup !== null) {
      try { storage.setItem(BEFORE_SHARED_KEY, previousBackup); } catch { backupKept = false; }
    }
    return { status: 'save-failed', backupKept };
  }
  try {
    storage.setItem(SHARED_ETAG_KEY, shared.etag);
    return { status: 'adopted', versionMarked: true };
  } catch {
    return { status: 'adopted', versionMarked: false };
  }
}

// Puts the backup made before a shared file replaced the browser project back on screen. What is on
// screen right now is kept in the backup slot first, so restoring can itself be undone by restoring
// again. Nothing changes unless the backup is readable, the user confirms and every step succeeds.
// `parse(text)` turns the stored project text into a project and throws when it is not valid;
// `validate(project)` (optional, may be async) throws when the restored project must not be installed;
// `commit(project)` installs and saves it and returns false when saving failed.
export async function restoreBeforeShared({ storage, currentRaw, parse, validate, confirmRestore, commit }) {
  let backup = null;
  try { backup = storage.getItem(BEFORE_SHARED_KEY); } catch { return { status: 'unreadable' }; }
  if (!backup) return { status: 'none' };
  let restored;
  try { restored = parse(JSON.parse(backup).data); } catch { return { status: 'unreadable' }; }
  // Anything slow that can reject the restored project (decoding its logos) runs here, before the
  // confirmation and before the screen is snapshotted. After the snapshot nothing may wait before the
  // replacement is installed, or an edit made in between is neither in the backup nor in the new project.
  if (validate) {
    try { await validate(restored); } catch { return { status: 'unreadable' }; }
  }
  if (!(await confirmRestore())) return { status: 'declined' };
  try {
    storage.setItem(BEFORE_SHARED_KEY, currentRaw());
  } catch {
    return { status: 'backup-failed' };
  }
  let saved = false;
  try { saved = await commit(restored); } catch { saved = false; }
  if (!saved) {
    // The restore did not happen, so the original backup must stay exactly as it was.
    let backupKept = true;
    try { storage.setItem(BEFORE_SHARED_KEY, backup); } catch { backupKept = false; }
    return { status: 'save-failed', backupKept };
  }
  return { status: 'restored' };
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
