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
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/api/project');
  assert.equal(requests[0][1].cache, 'no-cache');
  assert.equal(requests[0][1].credentials, 'same-origin');
  assert.ok(requests[0][1].signal, 'the request can be aborted');
});

test('a slow server is given up on after the timeout and is not an error for the editor', async () => {
  let aborted = false;
  const started = Date.now();
  const result = await fetchSharedProject((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')); });
  }), '', { timeoutMs: 30 });
  assert.equal(result.status, 'unavailable');
  assert.equal(aborted, true, 'the pending request was aborted');
  assert.ok(Date.now() - started < 2000);
});

test('a body that stalls after the headers is also given up on', async () => {
  const result = await fetchSharedProject(async (url, options) => ({
    ok: true,
    headers: { get: () => '"v9"' },
    text: () => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
  }), '', { timeoutMs: 30 });
  assert.equal(result.status, 'unavailable');
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
