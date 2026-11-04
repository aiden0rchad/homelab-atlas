import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleProject } from '../../app/public/model.js';
import { adoptSharedProject, BEFORE_SHARED_KEY, fetchSharedProject, restoreBeforeShared, SHARED_ETAG_KEY } from '../../app/public/state.js';

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
  assert.equal(requests[0][1].headers['X-Atlas-Request'], '1', 'the server only answers requests that carry the Atlas header');
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

function fakeStorage({ failOn = [], items = {} } = {}) {
  const writes = [];
  return {
    writes,
    getItem(key) { return key in items ? items[key] : null; },
    setItem(key, value) {
      if (failOn.includes(key)) throw new DOMException('quota', 'QuotaExceededError');
      writes.push([key, value]);
      items[key] = value;
    },
  };
}

function sharedFile(title = 'Shared lab') {
  return { etag: '"v2"', project: { ...sampleProject(), title } };
}

test('with no project in the browser the shared file is adopted without asking', async () => {
  const storage = fakeStorage();
  const committed = [];
  const result = await adoptSharedProject({
    shared: sharedFile(), existingRaw: '', storage,
    confirmReplace: () => { throw new Error('must not ask'); },
    commit: project => { committed.push(project.title); return true; },
  });
  assert.equal(result.status, 'adopted');
  assert.deepEqual(committed, ['Shared lab']);
  assert.deepEqual(storage.writes, [[SHARED_ETAG_KEY, '"v2"']]);
});

test('an existing project is only replaced after the user confirms, backup first, version marker last', async () => {
  const storage = fakeStorage();
  const order = [];
  const result = await adoptSharedProject({
    shared: sharedFile(), existingRaw: 'OLD', storage,
    confirmReplace: () => { order.push('confirm'); return true; },
    commit: () => { order.push(`commit after ${storage.writes.map(w => w[0]).join(',') || 'nothing'}`); return true; },
  });
  assert.equal(result.status, 'adopted');
  assert.deepEqual(order, ['confirm', `commit after ${BEFORE_SHARED_KEY}`]);
  assert.deepEqual(storage.writes, [[BEFORE_SHARED_KEY, 'OLD'], [SHARED_ETAG_KEY, '"v2"']]);
});

test('declining the replacement changes nothing and does not mark the version as loaded', async () => {
  const storage = fakeStorage();
  let committed = false;
  const result = await adoptSharedProject({
    shared: sharedFile(), existingRaw: 'OLD', storage,
    confirmReplace: () => false,
    commit: () => { committed = true; return true; },
  });
  assert.equal(result.status, 'declined');
  assert.equal(committed, false);
  assert.deepEqual(storage.writes, []);
});

test('a failed backup leaves everything alone', async () => {
  const storage = fakeStorage({ failOn: [BEFORE_SHARED_KEY] });
  let committed = false;
  const result = await adoptSharedProject({
    shared: sharedFile(), existingRaw: 'OLD', storage,
    confirmReplace: () => true,
    commit: () => { committed = true; return true; },
  });
  assert.equal(result.status, 'backup-failed');
  assert.equal(committed, false);
  assert.deepEqual(storage.writes, []);
});

test('a failed save keeps the old project and does not mark the version as loaded', async () => {
  const storage = fakeStorage();
  const result = await adoptSharedProject({
    shared: sharedFile(), existingRaw: 'OLD', storage,
    confirmReplace: () => true,
    commit: () => false,
  });
  assert.equal(result.status, 'save-failed');
  assert.ok(!storage.writes.some(([key]) => key === SHARED_ETAG_KEY), 'the version marker is not written');
});

test('a version marker that cannot be written does not undo a saved project', async () => {
  const storage = fakeStorage({ failOn: [SHARED_ETAG_KEY] });
  const result = await adoptSharedProject({
    shared: sharedFile(), existingRaw: '', storage,
    confirmReplace: () => true,
    commit: () => true,
  });
  assert.equal(result.status, 'adopted');
  assert.equal(result.versionMarked, false);
});

test('the backup holds what is on screen at the moment of the replacement, not the stale stored copy', async () => {
  const storage = fakeStorage();
  const result = await adoptSharedProject({
    shared: sharedFile(), existingRaw: 'STORED (autosave has not caught up)', currentRaw: () => 'ON SCREEN (last edit included)', storage,
    confirmReplace: () => true,
    commit: () => true,
  });
  assert.equal(result.status, 'adopted');
  assert.deepEqual(storage.writes[0], [BEFORE_SHARED_KEY, 'ON SCREEN (last edit included)']);
});

test('a screen snapshot that cannot be taken stops the replacement', async () => {
  const storage = fakeStorage();
  let committed = false;
  const result = await adoptSharedProject({
    shared: sharedFile(), existingRaw: 'OLD', currentRaw: () => { throw new Error('boom'); }, storage,
    confirmReplace: () => true,
    commit: () => { committed = true; return true; },
  });
  assert.equal(result.status, 'backup-failed');
  assert.equal(committed, false);
});

function storedProject(title) {
  return JSON.stringify({ tab: 't', data: JSON.stringify({ ...sampleProject(), title }) });
}
const parseStored = text => ({ ...JSON.parse(text) });

test('restoring brings the backup back and keeps the current screen as the new backup', async () => {
  const storage = fakeStorage({ items: { [BEFORE_SHARED_KEY]: storedProject('Mine before') } });
  const installed = [];
  const result = await restoreBeforeShared({
    storage, currentRaw: () => 'SCREEN NOW', parse: parseStored,
    confirmRestore: () => true,
    commit: project => { installed.push(project.title); return true; },
  });
  assert.equal(result.status, 'restored');
  assert.deepEqual(installed, ['Mine before']);
  assert.deepEqual(storage.writes, [[BEFORE_SHARED_KEY, 'SCREEN NOW']]);
});

test('restoring with no backup says so and changes nothing', async () => {
  const storage = fakeStorage();
  const result = await restoreBeforeShared({
    storage, currentRaw: () => 'x', parse: parseStored,
    confirmRestore: () => { throw new Error('must not ask'); },
    commit: () => { throw new Error('must not commit'); },
  });
  assert.equal(result.status, 'none');
  assert.deepEqual(storage.writes, []);
});

test('an unreadable backup is reported and the screen is left alone', async () => {
  const storage = fakeStorage({ items: { [BEFORE_SHARED_KEY]: 'not json' } });
  const result = await restoreBeforeShared({
    storage, currentRaw: () => 'x', parse: parseStored,
    confirmRestore: () => { throw new Error('must not ask'); },
    commit: () => { throw new Error('must not commit'); },
  });
  assert.equal(result.status, 'unreadable');
  assert.deepEqual(storage.writes, []);
});

test('declining the restore changes nothing', async () => {
  const storage = fakeStorage({ items: { [BEFORE_SHARED_KEY]: storedProject('Mine before') } });
  const result = await restoreBeforeShared({
    storage, currentRaw: () => 'x', parse: parseStored,
    confirmRestore: () => false,
    commit: () => { throw new Error('must not commit'); },
  });
  assert.equal(result.status, 'declined');
  assert.deepEqual(storage.writes, []);
});

test('if the screen cannot be saved as the new backup, nothing is restored', async () => {
  const storage = fakeStorage({ failOn: [BEFORE_SHARED_KEY], items: { [BEFORE_SHARED_KEY]: storedProject('Mine before') } });
  const result = await restoreBeforeShared({
    storage, currentRaw: () => 'x', parse: parseStored,
    confirmRestore: () => true,
    commit: () => { throw new Error('must not commit'); },
  });
  assert.equal(result.status, 'backup-failed');
});

test('a restore that cannot be saved keeps the current project', async () => {
  const storage = fakeStorage({ items: { [BEFORE_SHARED_KEY]: storedProject('Mine before') } });
  const result = await restoreBeforeShared({
    storage, currentRaw: () => 'x', parse: parseStored,
    confirmRestore: () => true,
    commit: async () => false,
  });
  assert.equal(result.status, 'save-failed');
});

test('a failed restore leaves the original backup exactly as it was', async () => {
  const original = storedProject('Mine before');
  const storage = fakeStorage({ items: { [BEFORE_SHARED_KEY]: original } });
  const result = await restoreBeforeShared({
    storage, currentRaw: () => 'SCREEN NOW', parse: parseStored,
    confirmRestore: () => true,
    commit: async () => false,
  });
  assert.equal(result.status, 'save-failed');
  assert.equal(result.backupKept, true);
  assert.equal(storage.getItem(BEFORE_SHARED_KEY), original, 'the backup is the one that was there before');
});

test('a restore that throws while saving also keeps the original backup', async () => {
  const original = storedProject('Mine before');
  const storage = fakeStorage({ items: { [BEFORE_SHARED_KEY]: original } });
  const result = await restoreBeforeShared({
    storage, currentRaw: () => 'SCREEN NOW', parse: parseStored,
    confirmRestore: () => true,
    commit: async () => { throw new Error('quota'); },
  });
  assert.equal(result.status, 'save-failed');
  assert.equal(storage.getItem(BEFORE_SHARED_KEY), original);
});

test('if the original backup cannot be put back after a failed restore, the result says so', async () => {
  const original = storedProject('Mine before');
  const storage = fakeStorage({ items: { [BEFORE_SHARED_KEY]: original } });
  let writes = 0;
  const flaky = {
    getItem: key => storage.getItem(key),
    setItem(key, value) { writes += 1; if (writes > 1) throw new DOMException('quota', 'QuotaExceededError'); storage.setItem(key, value); },
  };
  const result = await restoreBeforeShared({
    storage: flaky, currentRaw: () => 'SCREEN NOW', parse: parseStored,
    confirmRestore: () => true,
    commit: async () => false,
  });
  assert.equal(result.status, 'save-failed');
  assert.equal(result.backupKept, false);
});
