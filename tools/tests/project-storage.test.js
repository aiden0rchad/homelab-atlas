import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, sampleProject } from '../../app/public/model.js';
import {
  DEFAULT_PROJECT_STORAGE_KEY, PROJECT_STORAGE_KEY, decodeProjectRecord, decodeStoredProject,
} from '../../app/public/project-storage.js';

const record = project => JSON.stringify({ tab: 'test-tab', data: JSON.stringify(project) });

test('project storage keys are stable', () => {
  assert.equal(PROJECT_STORAGE_KEY, 'homelab-atlas.project');
  assert.equal(DEFAULT_PROJECT_STORAGE_KEY, 'homelab-atlas.default-project');
});

test('stored project decoding prefers the saved project and falls back to the browser default', () => {
  const saved = sampleProject();
  saved.title = 'Saved project';
  const fallback = sampleProject();
  fallback.title = 'Browser default';

  const savedDecoded = decodeStoredProject(record(saved), record(fallback));
  assert.equal(savedDecoded.source, 'saved');
  assert.equal(savedDecoded.project.title, 'Saved project');

  const defaultDecoded = decodeStoredProject(null, record(fallback));
  assert.equal(defaultDecoded.source, 'default');
  assert.equal(defaultDecoded.project.title, 'Browser default');
  assert.equal(defaultDecoded.project.schemaVersion, SCHEMA_VERSION);

  const sampleDecoded = decodeStoredProject(null, null);
  assert.equal(sampleDecoded.source, 'sample');
  assert.equal(sampleDecoded.project.title, sampleProject().title);
});

test('invalid stored records report errors instead of throwing', () => {
  const saved = decodeStoredProject('{not json', null);
  assert.equal(saved.source, 'error');
  assert.match(saved.error, /JSON/i);
  assert.equal(saved.project.schemaVersion, SCHEMA_VERSION);

  const fallback = decodeStoredProject(null, JSON.stringify({ tab: 'x', data: JSON.stringify({ schemaVersion: 999 }) }));
  assert.equal(fallback.source, 'error');
  assert.match(fallback.error, /browser default/i);
  assert.equal(fallback.project.schemaVersion, SCHEMA_VERSION);
});

test('decodeProjectRecord requires a complete storage record', () => {
  const project = sampleProject();
  assert.deepEqual(decodeProjectRecord(record(project)), project);
  assert.equal(decodeProjectRecord(''), null);
  assert.throws(() => decodeProjectRecord(JSON.stringify({ data: project })), /incomplete/);
});
