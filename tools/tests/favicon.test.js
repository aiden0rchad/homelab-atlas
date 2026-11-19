import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FAVICON_PATH, FAVICON_LIMITS, applyDocumentFavicon, normalizeFaviconUpload, validateFaviconDataUrl,
} from '../../app/public/favicon.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function generatedPng({ width = 1, height = 1, idat = new Uint8Array(1) } = {}) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const chunk = (type, data) => {
    const bytes = new Uint8Array(12 + data.length);
    new DataView(bytes.buffer).setUint32(0, data.length);
    bytes.set([...type].map(character => character.charCodeAt(0)), 4);
    bytes.set(data, 8);
    return bytes;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [Uint8Array.from(signature), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())];
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

test('favicons are empty or canonical PNG data URLs at 128px or smaller', () => {
  assert.equal(validateFaviconDataUrl(''), true);
  assert.equal(validateFaviconDataUrl(PNG), true);
  assert.equal(validateFaviconDataUrl(generatedPng({ width: 128, height: 128 })), true);
  for (const value of [
    undefined, null, 'https://example.test/favicon.png', 'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,@@@@', `${PNG}AAAA`, PNG.slice(0, -8),
    generatedPng({ width: 129 }), generatedPng({ width: 1, height: 129 }),
    `data:image/png;base64,${'A'.repeat(FAVICON_LIMITS.dataUrlChars)}`,
  ]) assert.throws(() => validateFaviconDataUrl(value), /Favicon/, String(value).slice(0, 40));
});

test('favicon uploads reject empty, oversized, and unsupported files before decoding', async () => {
  await assert.rejects(normalizeFaviconUpload(new File([], 'empty.png', { type: 'image/png' })), /Choose a favicon/);
  await assert.rejects(
    normalizeFaviconUpload(new File([new Uint8Array(FAVICON_LIMITS.uploadBytes + 1)], 'large.png', { type: 'image/png' })),
    /2 MB or smaller/,
  );
  await assert.rejects(normalizeFaviconUpload(new File(['text'], 'notes.txt', { type: 'text/plain' })), /PNG, JPG, WebP, SVG, or ICO/);
});

test('favicon uploads decode, center, and bound images to a square PNG', async () => {
  const originals = { FileReader: globalThis.FileReader, Image: globalThis.Image, document: globalThis.document };
  const drawCalls = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => drawCalls.push(args) }),
    toDataURL: () => PNG,
  };
  class FakeReader {
    readAsDataURL(file) { this.result = file.source; this.onload(); }
    readAsText(file) { this.result = file.text; this.onload(); }
  }
  class FakeImage {
    set src(value) {
      this.source = value;
      this.naturalWidth = 400;
      this.naturalHeight = 200;
      queueMicrotask(() => this.onload());
    }
  }
  globalThis.FileReader = FakeReader;
  globalThis.Image = FakeImage;
  globalThis.document = { createElement: () => canvas };
  try {
    const file = new File(['image'], 'icon.png', { type: 'image/png' });
    file.source = PNG;
    assert.equal(await normalizeFaviconUpload(file), PNG);
    assert.equal(canvas.width, 128);
    assert.equal(canvas.height, 128);
    assert.equal(drawCalls.length, 1);
    assert.deepEqual(drawCalls[0].slice(1, 5), [0, 32, 128, 64]);

    const unsafe = new File(['<svg><script>alert(1)</script></svg>'], 'icon.svg', { type: 'image/svg+xml' });
    unsafe.text = '<svg><script>alert(1)</script></svg>';
    await assert.rejects(normalizeFaviconUpload(unsafe), /unsupported or unsafe/);
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('document favicon helper switches between a project icon and the Atlas mark', () => {
  const original = globalThis.document;
  const link = { id: 'app-favicon', rel: 'icon', type: '', href: '' };
  globalThis.document = { getElementById: id => id === 'app-favicon' ? link : null };
  try {
    applyDocumentFavicon(PNG);
    assert.equal(link.type, 'image/png');
    assert.equal(link.href, PNG);
    applyDocumentFavicon('');
    assert.equal(link.type, 'image/svg+xml');
    assert.equal(link.href, DEFAULT_FAVICON_PATH);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});
