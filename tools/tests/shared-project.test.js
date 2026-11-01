import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleProject } from '../../app/public/model.js';
import { fetchSharedProject } from '../../app/public/state.js';

function fakeResponse({ ok = true, etag = '"v1"', body = '' } = {}) {
  return { ok, headers: { get: name => (name.toLowerCase() === 'etag' ? etag : null) }, text: async () => body };
}

test('a 404 (option not configured) leaves the browser project alone', async () => {
  const result = await fetchSharedProject(async () => fakeResponse({ ok: false }), '');
  assert.equal(result.status, 'unavailable');
});

test('a network failure is not an error for the editor', async () => {
  const result = await fetchSharedProject(async () => { throw new TypeError('network down'); }, '');
  assert.equal(result.status, 'unavailable');
});

test('a new file version is parsed and returned', async () => {
  const project = sampleProject();
  project.title = 'Shared lab';
  const requests = [];
  const result = await fetchSharedProject(async (url, options) => {
    requests.push([url, options]);
    return fakeResponse({ body: JSON.stringify(project) });
  }, '"old"');
  assert.equal(result.status, 'loaded');
  assert.equal(result.etag, '"v1"');
  assert.equal(result.project.title, 'Shared lab');
  assert.deepEqual(requests, [['/api/project', { cache: 'no-cache', credentials: 'same-origin' }]]);
});

test('the same file version is not loaded twice', async () => {
  const result = await fetchSharedProject(async () => fakeResponse({ body: JSON.stringify(sampleProject()) }), '"v1"');
  assert.equal(result.status, 'unchanged');
  assert.equal(result.project, undefined);
});

test('a response without an ETag is never loaded', async () => {
  const result = await fetchSharedProject(async () => fakeResponse({ etag: '', body: JSON.stringify(sampleProject()) }), '');
  assert.equal(result.status, 'unchanged');
});

test('an invalid project is reported and not returned', async () => {
  for (const body of ['not json', '{}', JSON.stringify({ ...sampleProject(), schemaVersion: 99 })]) {
    const result = await fetchSharedProject(async () => fakeResponse({ body }), '');
    assert.equal(result.status, 'invalid', body);
    assert.equal(result.project, undefined);
    assert.ok(result.error);
  }
});
