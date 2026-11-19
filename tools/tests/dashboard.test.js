import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProject, sampleProject } from '../../app/public/model.js';
import {
  DASHBOARD_DEFAULT_KEY, DASHBOARD_STORAGE_KEY, dashboardStats, decodeStoredProject, serviceLinks,
} from '../../app/public/dashboard-model.js';

test('dashboard storage aliases the editor project keys', () => {
  assert.equal(DASHBOARD_STORAGE_KEY, 'homelab-atlas.project');
  assert.equal(DASHBOARD_DEFAULT_KEY, 'homelab-atlas.default-project');
});

test('dashboard stats and links include only valid service addresses', () => {
  const project = sampleProject();
  const services = project.devices.flatMap(device => device.groups.flatMap(group => group.services.map(service => ({ device, group, service }))));
  services[0].service.link = 'https://atlas.example.test:9443/';
  services[1].service.link = 'http://192.0.2.10/';
  services[2].service.link = 'not-a-url';

  const stats = dashboardStats(project);
  assert.equal(stats.hosts, project.devices.length);
  assert.equal(stats.services, services.length);
  assert.equal(stats.links, 2);

  const links = serviceLinks(project);
  assert.equal(links.size, 2);
  assert.deepEqual(links.get(services[0].service.id), {
    href: 'https://atlas.example.test:9443/',
    name: services[0].service.name,
    device: services[0].device.name,
    group: services[0].group.name,
  });
  assert.equal(links.has(services[2].service.id), false);
});

test('dashboard default fallback surfaces the default project source', () => {
  const project = sampleProject();
  project.title = 'Default lab';
  const decoded = decodeStoredProject(null, JSON.stringify({ tab: 'test', data: JSON.stringify(project) }));
  assert.equal(decoded.source, 'default');
  assert.equal(decoded.project.title, 'Default lab');
});

test('diagram SVG exposes service identities but never embeds dashboard links', () => {
  const project = sampleProject();
  const service = project.devices[0].groups[0].services[0];
  service.link = 'https://private.example.test/admin';
  const svg = renderProject(project);
  assert.match(svg, new RegExp(`data-service="${service.id}"`));
  assert.doesNotMatch(svg, /private\.example\.test/);
  assert.doesNotMatch(svg, /<a\b/);
});
