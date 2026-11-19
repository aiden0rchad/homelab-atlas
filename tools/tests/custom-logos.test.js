import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { LOGOS, logoById, logoDataUri, logoPlate } from '../../app/public/catalog.js';
import { CUSTOM_LOGO_LIMITS, hasExternalSvgUrl, PNG_INFLATED_LIMIT, pngInfo, svgTextHasUnsafeContent, validateCustomLogo, validateCustomLogos, verifyCustomLogoDecodes, verifyPngImageData } from '../../app/public/custom-logos.js';
import { parseProject, renderProject, sampleProject, validateProject } from '../../app/public/model.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const custom = (id = 'custom-test', overrides = {}) => ({ id, label: 'Test logo', dataUrl: PNG, background: 'none', ...overrides });

function generatedPng({ size = 1, width = 1, height = 1, idat = new Uint8Array(size) } = {}) {
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

const editPng = (dataUrl, edit) => {
  const bytes = Uint8Array.from(Buffer.from(dataUrl.split(',')[1], 'base64'));
  edit(bytes, new DataView(bytes.buffer));
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
};

test('custom logo entries and PNG structure validate strictly', () => {
  assert.deepEqual(pngInfo(PNG), { width: 1, height: 1, bytes: 68 });
  assert.equal(validateCustomLogo(custom()), true);
  for (const logo of [
    custom('bad'), custom('custom-test', { label: ' ' }), custom('custom-test', { label: ' padded ' }),
    custom('custom-test', { background: 'blue' }), custom('custom-test', { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }),
    { ...custom(), extra: true },
  ]) assert.throws(() => validateCustomLogo(logo));
  assert.throws(() => pngInfo(`${PNG}AAAA`), /canonical|terminator/);
  assert.throws(() => pngInfo(PNG.slice(0, -8)), /base64|truncated|incomplete/);
  assert.throws(() => pngInfo(generatedPng({ width: 513 })), /dimensions/);
  assert.throws(() => pngInfo(editPng(generatedPng(), (bytes, view) => view.setUint32(33, bytes.length))), /truncated/);
  assert.throws(() => pngInfo(editPng(generatedPng(), (bytes, view) => view.setUint32(bytes.length - 12, 1))), /terminator|truncated/);
  assert.throws(() => pngInfo('data:image/png;base64,@@@@'), /canonical/);
  assert.throws(() => validateCustomLogo(custom('custom-test', { dataUrl: `data:image/png;base64,${'A'.repeat(200_004)}` })), /large/);
});

test('native PNG image-data validation is streaming and bounded', async () => {
  const valid = generatedPng({ idat: deflateSync(Uint8Array.of(0, 255, 0, 0, 255)) });
  await assert.doesNotReject(verifyPngImageData(valid));
  await assert.rejects(verifyPngImageData(generatedPng({ idat: Uint8Array.of(1, 2, 3) })), /invalid or truncated/);
  const compressed = deflateSync(Uint8Array.of(0, 1, 2, 3));
  await assert.rejects(verifyPngImageData(generatedPng({ idat: compressed.subarray(0, compressed.length - 2) })), /invalid or truncated/);
  const oversized = generatedPng({ idat: deflateSync(new Uint8Array(PNG_INFLATED_LIMIT + 1)) });
  await assert.rejects(verifyPngImageData(oversized), /decoded size limit/);
});

test('custom assets require native decompression support but empty projects do not', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'DecompressionStream');
  Object.defineProperty(globalThis, 'DecompressionStream', { value: undefined, configurable: true });
  try {
    await assert.rejects(verifyPngImageData(PNG), /current browser/);
    await assert.doesNotReject(verifyCustomLogoDecodes([]));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'DecompressionStream', descriptor);
    else delete globalThis.DecompressionStream;
  }
});

test('SVG upload screening rejects active and external content', () => {
  for (const text of [
    '<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"/>', '<!DOCTYPE svg><svg/>',
    '<svg><foreignObject/></svg>', '<svg><animate attributeName="x"/></svg>',
    '<svg><style>@import "https://example.test/a.css"</style></svg>', '<svg><path style="fill:url(https://example.test/a)"/></svg>',
  ]) assert.equal(svgTextHasUnsafeContent(text), true);
  for (const value of ['url(#g)', 'url( #g )', 'url("#g")', "url( '#g' )"]) assert.equal(hasExternalSvgUrl(value), false, value);
  for (const value of ['url(https://example.test/a)', 'url("https://example.test/a")', "url('data:image/png;base64,x')", 'url()']) assert.equal(hasExternalSvgUrl(value), true, value);
  for (const markup of ['fill="url(#a)"', 'fill="url( #a )"', 'fill="url(\'#a\')"', 'fill=\'url("#a")\'']) assert.equal(svgTextHasUnsafeContent(`<svg><defs><linearGradient id="a"/></defs><path ${markup}/></svg>`), false, markup);
});

test('custom logo count, total data, duplicate IDs, and ID collisions are rejected', () => {
  assert.equal(CUSTOM_LOGO_LIMITS.uploadBytes, 2_000_000);
  assert.throws(() => validateCustomLogos(Array.from({ length: 33 }, (_, index) => custom(`custom-${index}`))), /too many/);
  assert.throws(() => validateCustomLogos([custom(), custom()]), /collides/);
  assert.throws(() => validateCustomLogos([custom()], new Set(['custom-test'])), /collides/);
  const dataUrl = generatedPng({ size: 149_000 });
  assert.ok(dataUrl.length < CUSTOM_LOGO_LIMITS.dataUrlChars);
  assert.throws(() => validateCustomLogos(Array.from({ length: 7 }, (_, index) => custom(`custom-big-${index}`, { dataUrl }))), /project limit/);
});

test('schema 4 enforces custom references and record-ID isolation', () => {
  const project = sampleProject();
  project.customLogos.push(custom());
  project.devices[0].icon = 'custom-test';
  assert.equal(validateProject(project), true);
  assert.deepEqual(parseProject(JSON.stringify(project)), project);
  project.devices[0].icon = 'custom-missing';
  assert.throws(() => validateProject(project), /Unknown logo/);
  project.devices[0].icon = 'custom-test';
  project.devices[0].id = 'custom-test';
  assert.throws(() => validateProject(project), /duplicate ID/);
});

test('custom catalog context never leaks between projects', () => {
  const logos = [custom('custom-isolated', { background: 'light' })];
  assert.equal(logoDataUri('custom-isolated', logos), PNG);
  assert.notEqual(logoDataUri('custom-isolated'), PNG);
  assert.equal(logoById('custom-isolated', logos).label, 'Test logo');
  assert.equal(logoById('custom-isolated').id, 'generic');
  assert.equal(logoPlate('custom-isolated', 'light', logos), '#f8fafc');
  assert.equal(LOGOS.some(logo => logo.id === 'custom-isolated'), false);
});

test('all custom backgrounds render at every image site in every theme', () => {
  for (const background of ['none', 'light', 'dark']) {
    for (const theme of ['navy', 'light', 'midnight']) {
      const project = sampleProject();
      project.theme = theme;
      const logo = custom('custom-render', { label: '<Logo & name>', background });
      project.customLogos.push(logo);
      project.devices[0].icon = logo.id;
      project.networks[0].icon = logo.id;
      project.networks[0].secondaryIcon = logo.id;
      project.devices[0].groups[0].services[0].logo = logo.id;
      project.devices[0].groups[0].services[0].name = logo.label;
      project.devices[0].groups.push({ id: 'grp-custom-row', name: 'One', services: [{ id: 'svc-custom-row', logo: logo.id, name: 'Row', count: 1, link: '' }] });
      const svg = renderProject(project);
      const imageCount = svg.split(`<image href="${PNG}"`).length - 1;
      assert.equal(imageCount, 5, `${background} ${theme} image sites`);
      const plate = background === 'light' ? '#f8fafc' : background === 'dark' ? '#111827' : null;
      const encoded = PNG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const adjacentPlateCount = plate ? [...svg.matchAll(new RegExp(`<rect[^>]+fill="${plate}"/><image href="${encoded}"`, 'g'))].length : 0;
      if (plate) assert.equal(adjacentPlateCount, imageCount, `${background} ${theme} plates`);
      else {
        assert.equal(logoPlate(logo.id, theme, project.customLogos), null);
        assert.doesNotMatch(svg, new RegExp(`<rect[^>]+fill="(?:#f8fafc|#111827)"/><image href="${encoded}"`), `${background} ${theme} no plates`);
      }
      assert.match(svg, /&lt;Logo &amp; name&gt;/);
      assert.doesNotMatch(svg, /<Logo & name>/);
    }
  }
});
