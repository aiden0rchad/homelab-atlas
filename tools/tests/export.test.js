import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createExportSnapshot, HIDDEN_TEXT, parseExportTerms, redactExportText, sanitizeExportProject,
} from '../../app/public/export.js';
import { logoDataUri } from '../../app/public/catalog.js';
import { layoutProject, renderProject, sampleProject, snapshotManualLayout } from '../../app/public/model.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('network literals are hidden without matching ordinary numbers', () => {
  for (const value of [
    '10.0.0.1',
    '8.8.8.8/32',
    '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    '2001:db8::1',
    '::1',
    '::ffff:192.0.2.128',
    'fe80::1%eth0',
    '[fe80::1%en0]:8443',
    '00:1A:2B:3C:4D:5E',
    '00-1a-2b-3c-4d-5e',
    '001a.2b3c.4d5e',
    'https://[2001:db8::1]:8443/status',
    'ssh://nas.example.internal:22',
    'x://private.example',
    'admin@example.internal',
  ]) assert.equal(redactExportText(value), HIDDEN_TEXT, value);

  assert.equal(redactExportText('Gateway (192.168.10.1/24)'), `Gateway (${HIDDEN_TEXT})`);
  for (const [label, address] of [
    ['IP', '2001:0db8:85a3:0000:0000:8a2e:0370:7334'],
    ['IPv6', 'fe80::1'],
    ['private', '2001:db8::1'],
    ['edge6', '2001:db8::1'],
    ['private-6', 'fe80::1'],
  ]) assert.equal(redactExportText(`${label}:${address}`), `${label}:${HIDDEN_TEXT}`, label);
  assert.equal(redactExportText('IP 2001:db8::1.'), `IP ${HIDDEN_TEXT}.`);
  for (const [value, expected] of [
    ['IP ::...', `IP ${HIDDEN_TEXT}...`],
    ['IP ::1...', `IP ${HIDDEN_TEXT}...`],
    ['IP 2001:db8::1...', `IP ${HIDDEN_TEXT}...`],
    ['IP ::1: details', `IP ${HIDDEN_TEXT}: details`],
    ['IP 2001:db8::1: details', `IP ${HIDDEN_TEXT}: details`],
  ]) assert.equal(redactExportText(value), expected, value);
  assert.equal(redactExportText('IP 2001:db8::'), `IP ${HIDDEN_TEXT}`);
  assert.equal(redactExportText('11:22:33:44:55:66:77:88'), HIDDEN_TEXT);
  assert.equal(redactExportText('10.0.0.1/99'), `${HIDDEN_TEXT}/99`);
  assert.equal(redactExportText('2001:db8::1/129'), `${HIDDEN_TEXT}/129`);
  for (const value of [
    'http://[fe80::1%25eth0]:8080/private?token=secret',
    'https://user:secret@[fe80::1%eth0]/private?token=secret#fragment',
  ]) assert.equal(redactExportText(value), HIDDEN_TEXT, value);
  for (const value of ['RTX 3060', '12:30', '2026-10-27', '1.2.3', 'llama.cpp', 'i5-13500', '32 GB']) {
    assert.equal(redactExportText(value), value);
  }
  assert.equal(redactExportText('999.2.3.4'), '999.2.3.4');
  assert.equal(redactExportText('x2001:db8::1'), 'x2001:db8::1');
  assert.equal(redactExportText('http://[fe80::zz%eth0]/private?token=secret'), 'http://[fe80::zz%eth0]/private?token=secret');
});

test('custom terms are bounded case-insensitive literals', () => {
  const customTerms = 'a+b\nfoo.bar\n[nas]\nA+B';
  assert.deepEqual(parseExportTerms(customTerms), ['a+b', 'foo.bar', '[nas]']);
  assert.equal(
    redactExportText('A+B aaab FOO.BAR [NAS]', { hideNetworkDetails: false, customTerms }),
    `${HIDDEN_TEXT} aaab ${HIDDEN_TEXT} ${HIDDEN_TEXT}`,
  );
  assert.throws(() => parseExportTerms(Array.from({ length: 31 }, (_, index) => `term-${index}`).join('\n')), /at most 30/);
  assert.throws(() => parseExportTerms('x'.repeat(121)), /120 characters/);
  assert.throws(() => parseExportTerms('x'.repeat(3661)), /limited to 30 terms/);
});

test('every rendered user text field is sanitized without changing the project', () => {
  const project = sampleProject();
  project.title = 'Lab 10.0.0.1';
  project.subtitle = 'Owner admin@example.internal';
  project.networks[0].name = 'WAN 00:1a:2b:3c:4d:5e';
  project.networks[0].kind = 'Status https://router.example/status';
  project.vlans[0].name = 'VLAN fe80::1%eth0';
  project.devices[0].name = 'Host 192.168.1.20';
  project.devices[0].role = 'Contact ops@example.internal';
  project.devices[0].network = 'https://network.example/internal';
  project.devices[0].hardware = ['Address: 172.16.0.8/16', 'BMC: [2001:db8::8]:443'];
  project.devices[0].groups[0].name = 'Private group';
  project.devices[0].groups[0].services[0].name = 'Service 8.8.4.4';
  project.connections[0].label = 'Link 00-11-22-33-44-55';
  const before = JSON.stringify(project);
  const snapshot = createExportSnapshot(project, { customTerms: 'private group' });

  for (const privateText of [
    '10.0.0.1', 'admin@example.internal', '00:1a:2b:3c:4d:5e', 'https://router.example/status',
    'fe80::1%eth0', '192.168.1.20', 'ops@example.internal', 'https://network.example/internal',
    '172.16.0.8/16', '[2001:db8::8]:443', 'Private group', '8.8.4.4', '00-11-22-33-44-55',
  ]) assert.equal(snapshot.svg.includes(privateText), false, privateText);
  assert.match(snapshot.svg, /aria-label="Lab \[hidden\]"/u);
  assert.doesNotMatch(snapshot.svg, /data-(?:device|network)=|role="button"|tabindex=/u);
  assert.equal(snapshot.filename, 'lab-hidden.svg');
  assert.equal(JSON.stringify(project), before);
});

test('export rendering keeps auto and manual card geometry', () => {
  for (const mode of ['auto', 'manual']) {
    const project = sampleProject();
    project.title = 'A much longer title containing 192.168.100.200 that wraps';
    project.devices[0].name = 'A long device name at 10.20.30.40 that wraps';
    if (mode === 'manual') {
      project.layout = snapshotManualLayout(project);
      project.layout.cards[0].x += 37;
      project.layout.cards[0].y += 29;
      project.layout.cards[0].w += 41;
    }
    const before = layoutProject(project);
    const snapshot = createExportSnapshot(project);
    assert.match(snapshot.svg, new RegExp(`viewBox="0 0 ${before.width} ${before.height}"`, 'u'));
    for (const card of before.cards) {
      assert.ok(snapshot.svg.includes(`<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="12"`), `${mode} card ${card.id}`);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(layoutProject(project))), JSON.parse(JSON.stringify(before)));
  }
});

test('export edge-case text stays private without changing hardware geometry or inferred logos', () => {
  const project = sampleProject();
  project.title = 'Lab http://[fe80::1%25eth0]:8080/private?token=secret';
  project.subtitle = 'IPv6 2001:db8::1.';
  project.networks[0].name = 'LAN 10.0.0.1/99';
  project.networks[0].kind = 'Private Wi-Fi 2001:db8::1/129';
  project.devices[0].hardware = [
    'IP:\t2001:db8::1.',
    'Address:   11:22:33:44:55:66:77:88',
    'Private label: visible value',
    'Private fact: secret value',
  ];
  const before = JSON.stringify(project);
  const layout = layoutProject(project);

  const unfiltered = renderProject(project);
  assert.equal(unfiltered.includes('<title>IP:</title>'), true);
  assert.equal(unfiltered.includes('<title>2001:db8::1.</title>'), true);
  assert.equal(unfiltered.includes('<title>Address:</title>'), true);
  assert.equal(unfiltered.includes('<title>11:22:33:44:55:66:77:88</title>'), true);

  const snapshot = createExportSnapshot(project, { customTerms: 'Wi-Fi\nPrivate label:\nPrivate fact: secret value' });
  for (const privateText of [
    'fe80::1', 'token=secret', '2001:db8::1', '10.0.0.1', '11:22:33:44:55:66:77:88',
    'Private label', 'Private fact: secret value',
  ]) assert.equal(snapshot.svg.includes(privateText), false, privateText);
  assert.match(snapshot.svg, /<title>Lab \[hidden\]<\/title>/u);
  assert.match(snapshot.svg, /<title>IPv6 \[hidden\]\.<\/title>/u);
  assert.match(snapshot.svg, /<title>\[hidden\]<\/title>/u);
  assert.match(snapshot.svg, /<title>\[hidden\] visible value<\/title>/u);
  assert.doesNotMatch(snapshot.svg, /<title>\[hidden\](?: visible value)?:<\/title>/u);
  assert.equal(snapshot.svg.includes(logoDataUri('wifi')), true);
  assert.match(snapshot.svg, new RegExp(`viewBox="0 0 ${layout.width} ${layout.height}"`, 'u'));
  assert.deepEqual(JSON.parse(JSON.stringify(layoutProject(project))), JSON.parse(JSON.stringify(layout)));
  assert.equal(JSON.stringify(project), before);
});

test('privacy can be disabled and uploaded PNG bytes remain unchanged', () => {
  const project = sampleProject();
  project.title = 'Lab 10.0.0.1';
  project.customLogos = [{ id: 'custom-private', label: 'Private logo', dataUrl: PNG, background: 'none' }];
  project.devices[0].icon = 'custom-private';

  const filtered = createExportSnapshot(project);
  const visible = createExportSnapshot(project, { hideNetworkDetails: false });
  assert.equal(filtered.svg.includes('10.0.0.1'), false);
  assert.equal(visible.svg.includes('10.0.0.1'), true);
  assert.equal(filtered.svg.includes(PNG), true);
  assert.equal(sanitizeExportProject(project).customLogos[0].dataUrl, PNG);
});

test('favicons are project metadata and never appear in exports', () => {
  const project = sampleProject();
  project.favicon = PNG;
  const snapshot = createExportSnapshot(project, { hideNetworkDetails: false });
  assert.equal(snapshot.svg.includes(PNG), false);
  assert.equal(sanitizeExportProject(project).favicon, PNG);
});

test('export snapshots capture SVG, filename, and options together', () => {
  const project = sampleProject();
  project.title = 'Original 10.0.0.2';
  const options = { hideNetworkDetails: true, customTerms: 'Original' };
  const snapshot = createExportSnapshot(project, options, '.png');
  const svg = snapshot.svg;

  project.title = 'Changed 203.0.113.9';
  options.hideNetworkDetails = false;
  options.customTerms = '';
  assert.equal(snapshot.svg, svg);
  assert.equal(snapshot.filename, 'hidden-hidden.png');
  assert.deepEqual(snapshot.options, { hideNetworkDetails: true, terms: ['Original'] });
  assert.equal(snapshot.svg.includes('Changed'), false);
});
