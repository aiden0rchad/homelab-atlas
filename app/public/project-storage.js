import { parseProject, sampleProject } from './model.js';

export const PROJECT_STORAGE_KEY = 'homelab-atlas.project';
export const DEFAULT_PROJECT_STORAGE_KEY = 'homelab-atlas.default-project';

export function decodeProjectRecord(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const record = JSON.parse(raw);
  if (!record || typeof record.data !== 'string') throw new Error('The saved project record is incomplete.');
  return parseProject(record.data);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : 'The saved project could not be read.';
}

export function decodeStoredProject(raw, defaultRaw = null) {
  if (typeof raw === 'string' && raw) {
    try {
      return { project: decodeProjectRecord(raw), source: 'saved' };
    } catch (error) {
      return { project: sampleProject(), source: 'error', error: errorMessage(error) };
    }
  }
  if (typeof defaultRaw === 'string' && defaultRaw) {
    try {
      return { project: decodeProjectRecord(defaultRaw), source: 'default' };
    } catch (error) {
      return { project: sampleProject(), source: 'error', error: `The browser default project could not be read. ${errorMessage(error)}` };
    }
  }
  return { project: sampleProject(), source: 'sample' };
}
