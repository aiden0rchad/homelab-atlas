import { LOGO_IDS, logoDataUri, logoPlate, networkLogoId } from './catalog.js';
import { validateCustomLogos } from './custom-logos.js';
import { validateFaviconDataUrl } from './favicon.js';

export const SCHEMA_VERSION = 8;
export const THEMES = ['navy', 'light', 'midnight'];
export const DENSITIES = ['comfortable', 'compact'];
export const LIMITS = {
  bytes: 2_000_000,
  devices: 80,
  services: 800,
  groups: 160,
  networks: 30,
  connections: 160,
  text: 120,
  link: 2048,
  hardware: 12,
};
const LEGACY_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6, 7];
const LEGACY_BINDING_LIMIT = 1600;

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FONT = "'Avenir Next','Segoe UI',Arial,sans-serif";
const palettes = {
  navy: { bg: '#0b1117', panel: '#101923', card: '#121c26', tile: '#0d151e', line: '#263747', text: '#eff3f8', muted: '#a2b3c6', teal: '#55d6c9' },
  light: { bg: '#edf1f4', panel: '#f7f9fa', card: '#ffffff', tile: '#f2f5f7', line: '#bac6cf', text: '#17212b', muted: '#607282', teal: '#087f79' },
  midnight: { bg: '#0c0b12', panel: '#14131c', card: '#191823', tile: '#111019', line: '#343143', text: '#f2f0f7', muted: '#aaa5b8', teal: '#63d7ca' },
};

export function uid(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
export const escapeXml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

export function isValidLink(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.link || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function services(prefix, items) {
  return items.map(([logo, name, count = 1], index) => ({ id: `svc-${prefix}-${index}`, logo, name, count, link: '' }));
}

export function sampleProject() {
  return {
    schemaVersion: 8,
    revision: 1,
    title: 'Home Lab',
    subtitle: 'Private infrastructure · Local services · Built to last',
    theme: 'navy',
    columns: 3,
    density: 'comfortable',
    favicon: '',
    layout: { mode: 'auto', cards: [] },
    customLogos: [],
    networks: [
      { id: 'net-internet', name: 'Internet', kind: 'Internet', accent: '#48bfe3', icon: '', secondaryIcon: '' },
      { id: 'net-router', name: 'Core Router', kind: 'Router', accent: '#55d6c9', icon: '', secondaryIcon: '' },
      { id: 'net-switch', name: 'UniFi Switch', kind: 'Ubiquiti Switch', accent: '#7dd3fc', icon: '', secondaryIcon: '' },
    ],
    vlans: [
      { id: 'vlan-management', name: '01 Management', color: '#55d6c9' },
      { id: 'vlan-main', name: '10 Main', color: '#8db4d6' },
      { id: 'vlan-servers', name: '20 Servers', color: '#7aa2c6' },
      { id: 'vlan-iot', name: '30 IoT', color: '#f0a36a' },
      { id: 'vlan-lab', name: '40 Lab', color: '#a78bfa' },
      { id: 'vlan-guest', name: '50 Guest', color: '#91a4b7' },
    ],
    devices: [
      {
        id: 'dev-storage', name: 'Atlas', role: 'TrueNAS / storage', icon: 'truenas', accent: '#55d6c9', network: '20 Servers',
        hardware: ['i5-13500 · 32 GB RAM', '5 × 26 TB · RAIDZ1', '2 × 2 TB NVMe · mirror'],
        groups: [
          { id: 'grp-infra', name: 'Containers', services: services('atlas-a', [['nginx-proxy-manager', 'Proxy Manager'], ['adguard-home', 'AdGuard'], ['syncthing', 'DNS Sync'], ['portainer', 'Portainer'], ['dockge', 'Dockge'], ['homepage', 'Homepage'], ['gitea', 'Gitea'], ['uptime-kuma', 'Uptime Kuma'], ['searxng', 'SearXNG'], ['xwiki', 'XWiki'], ['docmost', 'Docmost'], ['prometheus', 'Metrics'], ['freshrss', 'FreshRSS'], ['paperless-ngx', 'Paperless'], ['immich', 'Immich'], ['nextcloud', 'Nextcloud'], ['vaultwarden', 'Vaultwarden'], ['tailscale', 'Tailscale'], ['nginx', 'Admin ingress'], ['wireguard', 'Net guards']]) },
          { id: 'grp-cloud', name: 'Data services', services: services('atlas-b', [['postgresql', 'Postgres', 2], ['redis', 'Redis'], ['minio', 'MinIO'], ['restic', 'Backups']]) },
        ],
      },
      {
        id: 'dev-media', name: 'Relay', role: 'Unraid / media + voice', icon: 'unraid', accent: '#f28a61', network: '20 Servers',
        hardware: ['i9-10900K · 32 GB RAM', 'RTX 3060 · 12 GB', '7 data HDDs + 2 parity · NVMe mirror'],
        groups: [
          { id: 'grp-media', name: 'Containers', services: services('relay-a', [['jellyfin', 'Jellyfin'], ['sonarr', 'Sonarr', 3], ['radarr', 'Radarr'], ['prowlarr', 'Prowlarr'], ['bazarr', 'Bazarr', 3], ['seerr', 'Seerr'], ['sabnzbd', 'SABnzbd'], ['qbittorrent', 'qBittorrent'], ['tdarr', 'Tdarr', 3], ['open-webui', 'Open WebUI'], ['adguard-home', 'AdGuard'], ['grafana', 'Grafana'], ['postgresql', 'Postgres'], ['home-assistant', 'HA helper'], ['generic', 'llama.cpp'], ['music-assistant', 'Music Assistant'], ['mosquitto', 'Mosquitto'], ['node-red', 'Node-RED']]) },
          { id: 'grp-ha', name: 'Home automation', services: services('relay-b', [['home-assistant', 'Home Assistant'], ['node-red', 'Node-RED'], ['music-assistant', 'Music'], ['mosquitto', 'MQTT']]) },
        ],
      },
      {
        id: 'dev-ai', name: 'Vector', role: 'Fedora / local AI', icon: 'amd', accent: '#a78bfa', network: '40 Lab',
        hardware: ['Ryzen AI Max+ 395', '128 GB unified memory', '2 TB NVMe'],
        groups: [{ id: 'grp-ai', name: 'Inference', services: services('vector', [['ollama', 'Ollama'], ['open-webui', 'Open WebUI'], ['qwen', 'Qwen', 3], ['n8n', 'n8n'], ['podman', 'Podman']]) }],
      },
      {
        id: 'dev-edge', name: 'Edge Pi', role: 'Raspberry Pi / edge', icon: 'raspberry-pi', accent: '#ef6f91', network: '30 IoT',
        hardware: ['Pi 4 · 4 GB RAM'],
        groups: [{ id: 'grp-edge', name: 'Native services', services: services('edge', [['nginx', 'nginx'], ['cloudflare', 'Cloudflare'], ['tailscale', 'Tailscale']]) }],
      },
      {
        id: 'dev-remote', name: 'Remote', role: 'Friend-owned node', icon: 'tailscale', accent: '#f0a36a', network: '50 Guest',
        hardware: ['K3s · remote tunnel'],
        groups: [{ id: 'grp-remote', name: 'Remote stack', services: services('remote', [['docmost', 'Docmost'], ['nextcloud', 'Files'], ['postgresql', 'Postgres'], ['redis', 'Redis']]) }],
      },
    ],
    connections: [
      { id: 'conn-wan', from: 'net-internet', to: 'net-router', label: 'WAN' },
      { id: 'conn-lan', from: 'net-router', to: 'net-switch', label: 'LAN' },
      { id: 'conn-storage', from: 'net-switch', to: 'dev-storage', label: 'Main' },
      { id: 'conn-media', from: 'net-switch', to: 'dev-media', label: 'Main' },
      { id: 'conn-ai', from: 'net-switch', to: 'dev-ai', label: 'Main' },
      { id: 'conn-edge', from: 'net-switch', to: 'dev-edge', label: 'IoT' },
      { id: 'conn-remote', from: 'net-router', to: 'dev-remote', label: 'Tailscale' },
    ],
  };
}

export function emptyProject() {
  return { ...sampleProject(), title: 'Untitled Home Lab', subtitle: '', revision: 1, networks: [], vlans: [], devices: [], connections: [] };
}

export function parseProject(text) {
  if (new TextEncoder().encode(text).length > LIMITS.bytes) throw new Error('File is larger than 2 MB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (LEGACY_SCHEMA_VERSIONS.includes(data?.schemaVersion)) {
    const version = data.schemaVersion;
    validateProjectVersion(data, version);
    const migrated = structuredClone(data);
    migrated.schemaVersion = SCHEMA_VERSION;
    if (version === 1) migrated.layout = { mode: 'auto', cards: [] };
    if (version < 3) migrated.networks = migrated.networks.map(network => ({ ...network, icon: '', secondaryIcon: '' }));
    if (version < 4) migrated.customLogos = [];
    if (version < 8) migrated.favicon = '';
    if (version >= 5) delete migrated.discovery;
    for (const device of migrated.devices) {
      for (const group of device.groups) {
        for (const service of group.services) {
          if (version === 7 || (version === 5 && typeof service.link === 'string')) continue;
          service.link = '';
        }
      }
    }
    validateProject(migrated);
    return migrated;
  }
  validateProject(data);
  return structuredClone(data);
}

export function validateProject(project) {
  return validateProjectVersion(project, SCHEMA_VERSION);
}

function validateProjectVersion(project, version) {
  const fail = message => { throw new Error(message); };
  const string = (value, label = 'Text') => {
    if (typeof value !== 'string' || value.length > LIMITS.text) fail(`${label} must be text under ${LIMITS.text + 1} characters.`);
  };
  const exact = (object, allowed, label) => {
    if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(key => !allowed.includes(key))) fail(`${label} has an invalid structure.`);
  };
  if (!project || typeof project !== 'object' || Array.isArray(project)) fail('Project must be an object.');
  const keys = ['schemaVersion', 'revision', 'title', 'subtitle', 'theme', 'columns', 'density', ...(version >= 8 ? ['favicon'] : []), ...(version >= 2 ? ['layout'] : []), ...(version >= 4 ? ['customLogos'] : []), ...(version >= 5 && version < 7 ? ['discovery'] : []), 'networks', 'vlans', 'devices', 'connections'];
  exact(project, keys, 'Project');
  if (project.schemaVersion !== version) fail(`Unsupported schema version: ${project.schemaVersion ?? 'missing'}.`);
  string(project.title, 'Title');
  string(project.subtitle, 'Subtitle');
  if (!Number.isInteger(project.revision) || project.revision < 0 || project.revision > 1_000_000_000) fail('Invalid revision.');
  if (!THEMES.includes(project.theme)) fail('Unknown theme.');
  if (!DENSITIES.includes(project.density)) fail('Unknown density.');
  if (!Number.isInteger(project.columns) || project.columns < 1 || project.columns > 4) fail('Columns must be 1–4.');
  if (version >= 8) validateFaviconDataUrl(project.favicon);
  for (const [key, maximum] of [['devices', LIMITS.devices], ['networks', LIMITS.networks], ['vlans', LIMITS.networks], ['connections', LIMITS.connections]]) {
    if (!Array.isArray(project[key]) || project[key].length > maximum) fail(`Invalid or excessive ${key}.`);
  }

  const ids = version >= 4 ? validateCustomLogos(project.customLogos, LOGO_IDS) : new Set();
  const validLogo = id => LOGO_IDS.has(id) || (version >= 4 && project.customLogos.some(logo => logo.id === id));
  const addId = (id, label) => {
    if (typeof id !== 'string' || !ID_RE.test(id) || ids.has(id)) fail(`${label} has an invalid or duplicate ID.`);
    ids.add(id);
  };
  let serviceCount = 0;
  let groupCount = 0;
  for (const network of project.networks) {
    exact(network, version >= 3 ? ['id', 'name', 'kind', 'accent', 'icon', 'secondaryIcon'] : ['id', 'name', 'kind', 'accent'], 'Network');
    addId(network.id, 'Network'); string(network.name); string(network.kind);
    if (!COLOR_RE.test(network.accent)) fail('Invalid network color.');
    if (version >= 3) {
      string(network.icon, 'Network logo'); string(network.secondaryIcon, 'Secondary network logo');
      for (const logo of [network.icon, network.secondaryIcon]) if (logo && !validLogo(logo)) fail(`Unknown logo: ${logo}.`);
    }
  }
  for (const vlan of project.vlans) {
    exact(vlan, ['id', 'name', 'color'], 'VLAN');
    addId(vlan.id, 'VLAN'); string(vlan.name);
    if (!COLOR_RE.test(vlan.color)) fail('Invalid VLAN color.');
  }
  for (const device of project.devices) {
    exact(device, ['id', 'name', 'role', 'icon', 'accent', 'network', 'hardware', 'groups'], 'Device');
    addId(device.id, 'Device'); string(device.name); string(device.role); string(device.network);
    if (!validLogo(device.icon)) fail(`Unknown logo: ${device.icon}.`);
    if (!COLOR_RE.test(device.accent)) fail('Invalid device color.');
    if (!Array.isArray(device.hardware) || device.hardware.length > LIMITS.hardware) fail('Invalid hardware facts.');
    device.hardware.forEach(fact => string(fact, 'Hardware fact'));
    if (!Array.isArray(device.groups) || device.groups.length > LIMITS.groups) fail('Invalid service groups.');
    for (const group of device.groups) {
      exact(group, ['id', 'name', 'services'], 'Group');
      addId(group.id, 'Group'); string(group.name); groupCount += 1;
      if (!Array.isArray(group.services)) fail('Invalid services.');
      for (const service of group.services) {
        exact(service, version >= 7 ? ['id', 'logo', 'name', 'count', 'link'] : version === 5 ? ['id', 'logo', 'name', 'count', 'link'] : ['id', 'logo', 'name', 'count'], 'Service');
        addId(service.id, 'Service'); string(service.name); serviceCount += 1;
        if (!validLogo(service.logo)) fail(`Unknown logo: ${service.logo}.`);
        if (!Number.isInteger(service.count) || service.count < 1 || service.count > 99) fail('Service count must be 1–99.');
        if (version >= 7 && (typeof service.link !== 'string' || (service.link !== '' && !isValidLink(service.link)))) fail('Service link must be empty or a full http:// or https:// URL.');
        if (version === 5 && 'link' in service && !(service.link === '' || isValidLink(service.link))) fail('Service link must be empty or a full http:// or https:// URL.');
      }
    }
  }
  if (version >= 2) {
    exact(project.layout, ['mode', 'cards'], 'Layout');
    if (!['auto', 'manual'].includes(project.layout.mode) || !Array.isArray(project.layout.cards) || project.layout.cards.length > project.devices.length) fail('Invalid layout.');
    if (project.layout.mode === 'auto' && project.layout.cards.length) fail('Automatic layout cannot contain card positions.');
    const deviceIds = new Set(project.devices.map(device => device.id));
    const cardIds = new Set();
    for (const card of project.layout.cards) {
      exact(card, ['id', 'x', 'y', 'w', 'h'], 'Layout card');
      if (!deviceIds.has(card.id) || cardIds.has(card.id)) fail('Layout card has a stale or duplicate device reference.');
      cardIds.add(card.id);
      for (const key of ['x', 'y', 'w', 'h']) if (!Number.isFinite(card[key]) || !Number.isInteger(card[key])) fail('Layout card coordinates must be finite integers.');
      if (card.x < 0 || card.x > 100_000 || card.y < 0 || card.y > 100_000 || card.w < 240 || card.w > 100_000 || card.h < 100 || card.h > 100_000) fail('Layout card is outside the allowed bounds.');
    }
  }
  if (serviceCount > LIMITS.services || groupCount > LIMITS.groups) fail('Project contains too many services or groups.');
  if (version >= 5 && version < 7 && 'discovery' in project) {
    exact(project.discovery, ['bindings'], 'Discovery');
    if (!Array.isArray(project.discovery.bindings) || project.discovery.bindings.length > LEGACY_BINDING_LIMIT) fail('Invalid or excessive discovery bindings.');
    const targets = new Map(project.devices.flatMap(device => device.groups.flatMap(group => group.services.map(service => [service.id, device.id]))));
    const bindings = new Set();
    for (const binding of project.discovery.bindings) {
      exact(binding, ['sourceId', 'key', 'deviceId', 'serviceId'], 'Discovery binding');
      const dockerKey = /^(?:compose|container):[0-9a-f]{64}$/.test(binding.key);
      const hostKey = /^nmap-host:[0-9a-f]{64}$/.test(binding.key);
      const endpointKey = /^nmap:[0-9a-f]{64}$/.test(binding.key);
      const validTarget = hostKey ? binding.serviceId === null : typeof binding.serviceId === 'string' && ID_RE.test(binding.serviceId);
      if (typeof binding.sourceId !== 'string' || typeof binding.key !== 'string' || typeof binding.deviceId !== 'string'
        || !ID_RE.test(binding.sourceId) || !ID_RE.test(binding.deviceId)
        || (version === 5 && (!dockerKey || !validTarget))
        || (version >= 6 && (!(dockerKey || hostKey || endpointKey) || !validTarget))) fail('Discovery binding has invalid fields.');
      const identity = `${binding.sourceId}\0${binding.key}`;
      if (bindings.has(identity)) fail('Discovery binding source and key must be unique.');
      bindings.add(identity);
      if (hostKey ? !project.devices.some(device => device.id === binding.deviceId) : targets.get(binding.serviceId) !== binding.deviceId) fail('Discovery binding has an invalid service target.');
    }
  }
  const endpoints = new Set([...project.networks, ...project.devices].map(item => item.id));
  for (const connection of project.connections) {
    exact(connection, ['id', 'from', 'to', 'label'], 'Connection');
    addId(connection.id, 'Connection'); string(connection.label);
    if (!endpoints.has(connection.from) || !endpoints.has(connection.to) || connection.from === connection.to) fail('Connection has an invalid endpoint.');
  }
  return true;
}

export function removeDevice(project, id) {
  project.devices = project.devices.filter(device => device.id !== id);
  project.connections = project.connections.filter(connection => connection.from !== id && connection.to !== id);
  project.layout.cards = project.layout.cards.filter(card => card.id !== id);
}

export function removeGroup(project, deviceId, groupId) {
  const device = project.devices.find(item => item.id === deviceId);
  if (!device) return;
  device.groups = device.groups.filter(group => group.id !== groupId);
}

export function removeService(project, deviceId, groupId, serviceId) {
  const group = project.devices.find(item => item.id === deviceId)?.groups.find(item => item.id === groupId);
  if (!group) return;
  group.services = group.services.filter(service => service.id !== serviceId);
}

export function removeNetwork(project, id) {
  project.networks = project.networks.filter(network => network.id !== id);
  project.connections = project.connections.filter(connection => connection.from !== id && connection.to !== id);
}

export function wrapText(value, maxChars, maxLines = 2) {
  const text = String(value).trim();
  if (!text) return [''];
  const lines = [];
  let remaining = text;
  while (remaining && lines.length < maxLines) {
    if (remaining.length <= maxChars) { lines.push(remaining); remaining = ''; break; }
    let cut = remaining.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;
    lines.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }
  return lines;
}

function nameGeometry(device, width, secondary) {
  const available = width - 118;
  const maxSize = secondary ? 28 : width < 380 ? 30 : 44;
  const size = Math.max(22, Math.min(maxSize, available / Math.max(1, device.name.length * .55)));
  const maxChars = Math.max(8, Math.floor(available / (size * .55)));
  const lines = wrapText(device.name, maxChars, 2).length;
  return { size, maxChars, lines, lineHeight: Math.round(size * 1.05) };
}

function hardwareMark(device, fact, index) {
  if (index) return '';
  const value = fact.toLowerCase();
  const icon = /\b(amd|ryzen)\b/.test(value) ? 'amd' : /\b(intel|xeon|i[3579](?:[-\s]|\b))/.test(value) ? 'intel' : '';
  return icon && device.icon !== icon ? icon : '';
}

function hardwareGeometry(device, fact, index, width, compact) {
  const match = fact.match(/^([A-Za-z][A-Za-z0-9 /+&().-]{0,13}):\s+(.+)$/);
  const label = match?.[1] || '';
  const value = match?.[2] || fact;
  const labelWidth = label ? Math.min(124, Math.max(52, label.length * 8 + 12)) : 0;
  const mark = hardwareMark(device, fact, index);
  const markWidth = mark ? 54 : 0;
  const available = width - 20 - labelWidth - markWidth;
  const chars = Math.max(8, Math.floor(available / (index ? 7.4 : 8)));
  const lines = wrapText(value, chars, 4);
  const lineHeight = compact ? (index ? 19 : 20) : (index ? 21 : 22);
  return { label, value, labelWidth, mark, markWidth, chars, lines, lineHeight, size: index ? (compact ? 14 : 15) : (compact ? 15 : 16), height: lines.length * lineHeight + (index ? 5 : 9) };
}

function groupGeometry(group, width, compact, secondary, index) {
  const inset = index > 0;
  const contentWidth = width - (inset ? 20 : 0);
  const nameChars = Math.max(10, Math.floor(contentWidth / 7));
  const nameLines = wrapText(group.name.toUpperCase(), nameChars, 2);
  const headerHeight = nameLines.length * (compact ? 15 : 17) + (compact ? 9 : 11);
  let mode = 'grid';
  let columns = width < 380 ? 3 : 4;
  let itemHeight = compact ? 72 : 78;
  if (group.services.length <= 2) {
    mode = 'rows'; columns = 1; itemHeight = compact ? 52 : 58;
  } else if (group.services.length <= 4) {
    columns = width < 380 ? group.services.length : 4;
    itemHeight = compact ? 72 : 78;
  }
  const rows = Math.ceil(group.services.length / columns);
  const padding = inset ? 10 : 0;
  const gap = compact ? 6 : 8;
  return { mode, columns, itemHeight, rows, inset, padding, gap, nameChars, nameLines, headerHeight, contentWidth, height: headerHeight + rows * itemHeight + Math.max(0, rows - 1) * gap + padding * 2 + (compact ? 8 : 12) };
}

function cardMetrics(device, width, compact, secondary) {
  const name = nameGeometry(device, width, secondary);
  const headerHeight = (secondary ? (compact ? 85 : 89) : (compact ? 104 : 116)) + (name.lines - 1) * name.lineHeight;
  const hardwareFacts = device.hardware.map((fact, index) => hardwareGeometry(device, fact, index, width - 40, compact));
  const hardwareHeight = hardwareFacts.reduce((sum, fact) => sum + fact.height, 0) + (hardwareFacts.length > 1 ? 14 : hardwareFacts.length ? 6 : 0);
  const groups = device.groups.map((group, index) => groupGeometry(group, width - 40, compact, secondary, index));
  const groupsHeight = groups.reduce((sum, group) => sum + group.height, 0);
  const contentHeight = headerHeight + hardwareHeight + groupsHeight;
  return { secondary, compact, name, hardwareFacts, headerHeight, hardwareHeight, groups, contentHeight, height: Math.max(compact ? 190 : 212, contentHeight + (compact ? 12 : 18)) };
}

export function serviceTileGeometry(name, width, height, secondary = false) {
  const compact = height <= 72;
  const fontSize = compact ? (width < 90 ? 11 : 12) : (width < 90 ? 11 : 13);
  const lineHeight = fontSize + 1;
  const lines = wrapText(name, Math.max(5, Math.floor(width / (fontSize * .55))), 2);
  const logoSize = compact ? 24 : (width < 90 ? 24 : 28);
  const plateSize = logoSize + 6;
  const plateY = 10;
  const logoY = 13;
  const textTop = plateY + plateSize + 2;
  const firstBaseline = textTop + fontSize * .8;
  return { fontSize, lineHeight, lines, firstBaseline, logoY, logoSize, plateY, plateSize, textTop };
}

export function serviceRowGeometry(name, width, height, compact = false, hasCount = false) {
  const logoSize = compact ? 28 : 32;
  const plateSize = logoSize + 6;
  const textX = plateSize + 14;
  const countWidth = hasCount ? 32 : 0;
  const fontSize = width < 140 ? 12 : 14;
  const lines = wrapText(name, Math.max(6, Math.floor((width - textX - countWidth - 22) / (fontSize * .55))), 2);
  const lineHeight = fontSize + 2;
  const firstBaseline = height / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * .35;
  return { logoSize, plateSize, textX, countWidth, fontSize, lines, lineHeight, firstBaseline };
}

export function layoutProject(project) {
  const compact = project.density === 'compact';
  const margin = 60;
  const gap = 24;
  const columns = Math.min(project.columns, Math.max(1, project.devices.length));
  const widths = columns === 3
    ? (compact ? [450, 450, 300] : [480, 480, 320])
    : Array(columns).fill(compact ? 408 : (columns === 1 ? 480 : 432));
  const width = widths.reduce((sum, value) => sum + value, 0) + gap * (columns - 1) + margin * 2;
  const contentWidth = width - margin * 2;
  const oneColumnHeader = width < 900;
  const titleMaxChars = oneColumnHeader ? Math.max(9, Math.floor(contentWidth / 39)) : Math.max(10, Math.floor((contentWidth - 420) / 39));
  const titleLines = wrapText(project.title, titleMaxChars, 2).length;
  const headerHeight = (oneColumnHeader ? 252 : 160) + (titleLines - 1) * 74;
  const networkY = headerHeight + 22;
  const networkGap = 18;
  const networksPerRow = Math.min(5, Math.max(1, project.networks.length), Math.max(1, Math.floor((contentWidth + networkGap) / (200 + networkGap))));
  const networkWidth = (contentWidth - networkGap * (networksPerRow - 1)) / networksPerRow;
  const networkRows = Math.ceil(project.networks.length / networksPerRow);
  const networkHeight = project.networks.length ? networkRows * 96 + Math.max(0, networkRows - 1) * 14 : 0;
  const networks = project.networks.map((network, index) => ({
    id: network.id,
    x: margin + (index % networksPerRow) * (networkWidth + networkGap),
    y: networkY + Math.floor(index / networksPerRow) * 110,
    w: networkWidth,
    h: 96,
  }));

  const vlanGap = 10;
  const vlansPerRow = Math.min(6, Math.max(1, project.vlans.length), Math.max(1, Math.floor((contentWidth + vlanGap) / (130 + vlanGap))));
  const vlanWidth = (contentWidth - vlanGap * (vlansPerRow - 1)) / vlansPerRow;
  const vlanRows = Math.ceil(project.vlans.length / vlansPerRow);
  const vlanY = networkY + networkHeight + (project.networks.length && project.vlans.length ? 30 : 0);
  const vlanHeight = project.vlans.length ? vlanRows * 46 + Math.max(0, vlanRows - 1) * 10 : 0;
  const vlans = project.vlans.map((vlan, index) => ({
    id: vlan.id,
    x: margin + (index % vlansPerRow) * (vlanWidth + vlanGap),
    y: vlanY + Math.floor(index / vlansPerRow) * 56,
    w: vlanWidth,
    h: 46,
  }));
  const vlanGaps = Array.from({ length: Math.max(0, vlansPerRow - 1) }, (_, index) => margin + (index + 1) * vlanWidth + index * vlanGap + vlanGap / 2);
  const vlanRouteXs = vlanGaps.length ? vlanGaps : [width - margin / 2];
  const routingLaneY = Math.max(networkY + networkHeight, vlanY + vlanHeight) + 28;
  const cardsY = routingLaneY + 34;
  const columnX = [];
  widths.reduce((x, cardWidth, index) => {
    columnX[index] = x;
    return x + cardWidth + gap;
  }, margin);
  const columnBottoms = Array(columns).fill(cardsY);
  let cards = project.devices.map((device, index) => {
    const serviceCount = device.groups.reduce((sum, group) => sum + group.services.length, 0);
    const secondary = index >= columns && device.hardware.length <= 1 && device.groups.length === 1 && serviceCount <= 4;
    let column = index < columns ? index : columnBottoms.indexOf(Math.min(...columnBottoms));
    if (index >= columns && columns === 3 && secondary) {
      const narrowMetrics = cardMetrics(device, widths[2], compact, true);
      const mainBottom = Math.max(columnBottoms[0], columnBottoms[1]);
      if (columnBottoms[2] + narrowMetrics.height <= mainBottom + 160) column = 2;
    }
    const metrics = cardMetrics(device, widths[column], compact, secondary);
    const card = { id: device.id, column, x: columnX[column], y: columnBottoms[column], w: widths[column], h: metrics.height, contentBottom: columnBottoms[column] + metrics.contentHeight, ...metrics };
    columnBottoms[column] += card.h + gap;
    return card;
  });
  if (project.layout.mode === 'manual') {
    const autoCards = cards;
    const saved = new Map(project.layout.cards.map(card => [card.id, card]));
    const measured = (device, requested, secondary) => {
      const w = Math.max(240, Math.min(Math.round(requested.w), contentWidth, 100_000));
      const x = Math.max(0, Math.min(Math.round(requested.x), contentWidth - w, 100_000));
      const y = Math.max(0, Math.min(Math.round(requested.y), 100_000));
      const metrics = cardMetrics(device, w, compact, secondary);
      return { x, y, w, h: Math.max(Math.min(Math.round(requested.h), 100_000), metrics.height), metrics };
    };
    let unpinnedY = 0;
    for (const [id, stored] of saved) {
      const index = project.devices.findIndex(item => item.id === id);
      if (index >= 0) {
        const card = measured(project.devices[index], stored, autoCards[index].secondary);
        unpinnedY = Math.max(unpinnedY, card.y + card.h + gap);
      }
    }
    cards = project.devices.map((device, index) => {
      const prior = autoCards[index];
      const stored = saved.get(device.id);
      const requested = stored || { x: 0, y: unpinnedY, w: prior.w, h: prior.h };
      const { x, y, w, h, metrics } = measured(device, requested, prior.secondary);
      if (!stored) unpinnedY = y + h + gap;
      return { id: device.id, column: null, x: margin + x, y: cardsY + y, w, h, contentBottom: cardsY + y + metrics.contentHeight, ...metrics };
    });
  }
  const networkIds = new Set(project.networks.map(network => network.id));
  const bottomNetworkY = networks.length ? Math.max(...networks.map(network => network.y)) : 0;
  const drawable = connection => {
    const fromNetwork = networkIds.has(connection.from);
    const toNetwork = networkIds.has(connection.to);
    if (fromNetwork && toNetwork) {
      const from = networks.find(item => item.id === connection.from);
      const to = networks.find(item => item.id === connection.to);
      return Boolean(from && to && from.y === to.y && Math.abs(networks.indexOf(from) - networks.indexOf(to)) === 1);
    }
    if (fromNetwork === toNetwork) return false;
    const network = networks.find(item => item.id === (fromNetwork ? connection.from : connection.to));
    const device = cards.find(item => item.id === (fromNetwork ? connection.to : connection.from));
    return Boolean(network && network.y === bottomNetworkY && device && device.y === cardsY);
  };
  const relationships = project.connections;
  const relationshipColumns = width < 900 ? 1 : 3;
  const relationshipRows = Math.ceil(relationships.length / relationshipColumns);
  const cardsBottom = cards.length ? Math.max(...cards.map(card => card.y + card.h)) : cardsY;
  const relationshipsY = cardsBottom + 64;
  const footerY = relationshipsY + Math.max(28, relationshipRows * 32) + 32;
  const height = Math.max(560, footerY + 52);
  return { width, height, margin, gap, columns, widths, cardsY, networks, vlans, vlanGaps, vlanRouteXs, cards, relationships, relationshipColumns, relationshipsY, footerY, routingLaneY, oneColumnHeader, titleMaxChars, drawable };
}

export function snapshotManualLayout(project) {
  const layout = layoutProject(project);
  return {
    mode: 'manual',
    cards: layout.cards.map(card => ({
      id: card.id,
      x: Math.round(card.x - layout.margin),
      y: Math.round(card.y - layout.cardsY),
      w: Math.round(card.w),
      h: Math.round(card.h),
    })),
  };
}

export function setManualCard(project, id, updates) {
  if (!project.devices.some(device => device.id === id)) throw new Error('Unknown device card.');
  project.layout = snapshotManualLayout(project);
  const card = project.layout.cards.find(item => item.id === id);
  for (const key of ['x', 'y', 'w', 'h']) if (key in updates) card[key] = Math.round(Number(updates[key]));
  project.layout = snapshotManualLayout(project);
  return project.layout.cards.find(item => item.id === id);
}

export function resetAutoLayout(project) {
  project.layout = { mode: 'auto', cards: [] };
}

function textElement(text, x, y, options) {
  const { fill, size, weight = 400, anchor = 'start', maxChars = 100, maxLines = 1, lineHeight = Math.round(size * 1.2), opacity = 1 } = options;
  const lines = wrapText(text, maxChars, maxLines);
  const title = `<title>${escapeXml(text)}</title>`;
  const spans = lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join('');
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" opacity="${opacity}">${title}${spans}</text>`;
}

function renderNetwork(network, logo, box, theme, themeName, customLogos, interactive) {
  const name = textElement(network.name, box.x + 72, box.y + 37, { fill: theme.text, size: 17, weight: 700, maxChars: Math.max(10, Math.floor((box.w - 88) / 9)) });
  const kind = textElement(network.kind, box.x + 72, box.y + 61, { fill: theme.muted, size: 12, weight: 550, maxChars: Math.max(10, Math.floor((box.w - 88) / 7)), maxLines: 2, lineHeight: 15 });
  const logos = [logo, network.secondaryIcon].filter(Boolean);
  const iconBackground = logos.length === 1
    ? `<rect x="${box.x + 16}" y="${box.y + 25}" width="42" height="42" rx="8" fill="${network.accent}" fill-opacity="0.11"/>`
    : `<rect x="${box.x + 16}" y="${box.y + 11}" width="42" height="74" rx="8" fill="${network.accent}" fill-opacity="0.11"/>`;
  const marks = logos.map((id, index) => {
    const size = logos.length === 1 ? 36 : 26;
    const x = box.x + (logos.length === 1 ? 19 : 24);
    const y = box.y + (logos.length === 1 ? 28 : 18 + index * 34);
    const plate = logoPlate(id, themeName, customLogos);
    return `${plate ? `<rect x="${x - 3}" y="${y - 3}" width="${size + 6}" height="${size + 6}" rx="7" fill="${plate}"/>` : ''}<image href="${logoDataUri(id, customLogos)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  }).join('');
  const editor = interactive ? ` data-network="${network.id}" role="button" tabindex="0" aria-label="Edit ${escapeXml(network.name)}"` : '';
  return `<g${editor}><title>${escapeXml(network.name)}</title><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="${theme.card}" stroke="${theme.line}" stroke-opacity=".78"/>${iconBackground}${marks}${name}${kind}</g>`;
}

function renderService(service, x, y, width, height, theme, themeName, secondary, customLogos) {
  const center = x + width / 2;
  const geometry = serviceTileGeometry(service.name, width, height, secondary);
  const plate = logoPlate(service.logo, themeName, customLogos);
  const plateRect = plate ? `<rect x="${center - geometry.plateSize / 2}" y="${y + geometry.plateY}" width="${geometry.plateSize}" height="${geometry.plateSize}" rx="5" fill="${plate}"/>` : '';
  const name = textElement(service.name, center, y + geometry.firstBaseline, { fill: theme.text, size: geometry.fontSize, weight: 400, anchor: 'middle', maxChars: Math.max(5, Math.floor(width / (geometry.fontSize * .55))), maxLines: 2, lineHeight: geometry.lineHeight });
  const badge = service.count > 1 ? textElement(`×${service.count}`, x + width - 6, y + 11, { fill: theme.muted, size: 9, weight: 600, anchor: 'end', maxChars: 3 }) : '';
  return `<g data-service="${service.id}"><title>${escapeXml(service.name)}${service.count > 1 ? ` ×${service.count}` : ''}</title><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${theme.tile}" stroke="${theme.line}"/>${plateRect}<image href="${logoDataUri(service.logo, customLogos)}" x="${center - geometry.logoSize / 2}" y="${y + geometry.logoY}" width="${geometry.logoSize}" height="${geometry.logoSize}" preserveAspectRatio="xMidYMid meet"/>${name}${badge}</g>`;
}

function renderServiceRow(service, x, y, width, height, theme, themeName, compact, customLogos) {
  const geometry = serviceRowGeometry(service.name, width, height, compact, service.count > 1);
  const plate = logoPlate(service.logo, themeName, customLogos);
  const iconY = y + (height - geometry.logoSize) / 2;
  const plateY = y + (height - geometry.plateSize) / 2;
  const plateRect = plate ? `<rect x="${x + 10}" y="${plateY}" width="${geometry.plateSize}" height="${geometry.plateSize}" rx="6" fill="${plate}"/>` : '';
  const name = textElement(service.name, x + geometry.textX + 10, y + geometry.firstBaseline, { fill: theme.text, size: geometry.fontSize, weight: 400, maxChars: Math.max(6, Math.floor((width - geometry.textX - geometry.countWidth - 22) / (geometry.fontSize * .55))), maxLines: 2, lineHeight: geometry.lineHeight });
  const badge = service.count > 1 ? textElement(`×${service.count}`, x + width - 12, y + height / 2 + 4, { fill: theme.muted, size: 11, weight: 600, anchor: 'end', maxChars: 3 }) : '';
  return `<g data-service="${service.id}"><title>${escapeXml(service.name)}${service.count > 1 ? ` ×${service.count}` : ''}</title><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7" fill="${theme.tile}" stroke="${theme.line}"/>${plateRect}<image href="${logoDataUri(service.logo, customLogos)}" x="${x + 13}" y="${iconY}" width="${geometry.logoSize}" height="${geometry.logoSize}" preserveAspectRatio="xMidYMid meet"/>${name}${badge}</g>`;
}

function renderCard(device, box, theme, themeName, customLogos, interactive) {
  const innerX = box.x + 20;
  const innerWidth = box.w - 40;
  const plate = logoPlate(device.icon, themeName, customLogos);
  const iconPlate = plate ? `<rect x="${box.x + box.w - 72}" y="${box.y + 22}" width="52" height="52" rx="7" fill="${plate}"/>` : '';
  const roleY = box.y + (box.secondary ? 24 : 29);
  const nameY = box.y + (box.secondary ? 53 : 74);
  const nameExtra = (box.name.lines - 1) * box.name.lineHeight;
  const headingX = innerX + 14;
  const role = textElement(device.role.toUpperCase(), headingX, roleY, { fill: device.accent, size: box.secondary ? 10 : 11, weight: 600, maxChars: Math.max(8, Math.floor((box.w - 112) / 7)) });
  const name = textElement(device.name, headingX, nameY, { fill: theme.text, size: box.name.size, weight: 700, maxChars: box.name.maxChars, maxLines: 2, lineHeight: box.name.lineHeight });
  const network = textElement(device.network, headingX, box.y + (box.secondary ? 75 : 101) + nameExtra, { fill: theme.muted, size: box.secondary ? 11 : 12, weight: 400, maxChars: Math.max(8, Math.floor((innerWidth - 14) / 7)) });
  let y = box.y + box.headerHeight;
  let hardware = '';
  if (device.hardware.length > 1) hardware += `<rect x="${innerX}" y="${y + box.hardwareFacts[0].height}" width="${innerWidth}" height="${box.hardwareHeight - box.hardwareFacts[0].height - 8}" rx="7" fill="${theme.tile}" stroke="${theme.line}"/>`;
  device.hardware.forEach((fact, index) => {
    const geometry = box.hardwareFacts[index];
    const factX = innerX + (index ? 10 : geometry.markWidth);
    const baseline = y + geometry.size + (index ? 5 : 0);
    const labeled = geometry.label && fact.match(/^(.+?):\s+(.+)$/u);
    if (labeled) {
      const [, label, value] = labeled;
      hardware += textElement(`${label}:`, factX, baseline, { fill: device.accent, size: geometry.size, weight: 600, maxChars: 25 });
      hardware += textElement(value, factX + geometry.labelWidth, baseline, { fill: index ? theme.muted : theme.text, size: geometry.size, weight: index ? 400 : 500, maxChars: geometry.chars, maxLines: 4, lineHeight: geometry.lineHeight });
    } else hardware += textElement(fact, factX, baseline, { fill: index ? theme.muted : theme.text, size: geometry.size, weight: index ? 400 : 500, maxChars: geometry.chars, maxLines: 4, lineHeight: geometry.lineHeight });
    if (geometry.mark) {
      const markPlate = logoPlate(geometry.mark, themeName);
      hardware += `${markPlate ? `<rect x="${innerX}" y="${y}" width="46" height="24" rx="5" fill="${markPlate}"/>` : ''}<image href="${logoDataUri(geometry.mark)}" x="${innerX + 3}" y="${y + 3}" width="40" height="18" preserveAspectRatio="xMidYMid meet"/>`;
    }
    y += geometry.height;
  });
  if (device.hardware.length) y += device.hardware.length > 1 ? 14 : 6;
  const groups = device.groups.map((group, groupIndex) => {
    const geometry = box.groups[groupIndex];
    const groupX = innerX + geometry.padding;
    const groupWidth = innerWidth - geometry.padding * 2;
    const groupTop = y;
    const inset = geometry.inset ? `<rect x="${innerX}" y="${groupTop}" width="${innerWidth}" height="${geometry.height - (box.compact ? 8 : 12)}" rx="8" fill="${theme.tile}" fill-opacity=".38" stroke="${theme.line}"/>` : '';
    const groupName = textElement(group.name.toUpperCase(), groupX, y + geometry.padding + (box.compact ? 12 : 14), { fill: device.accent, size: box.compact ? 10 : 11, weight: 600, maxChars: geometry.nameChars, maxLines: 2, lineHeight: box.compact ? 15 : 17 });
    y += geometry.padding + geometry.headerHeight;
    const tileGap = geometry.gap;
    const tileWidth = (groupWidth - tileGap * (geometry.columns - 1)) / geometry.columns;
    const services = group.services.map((service, index) => {
      const x = groupX + (index % geometry.columns) * (tileWidth + tileGap);
      const serviceY = y + Math.floor(index / geometry.columns) * (geometry.itemHeight + tileGap);
      return geometry.mode === 'rows' ? renderServiceRow(service, x, serviceY, tileWidth, geometry.itemHeight, theme, themeName, box.compact, customLogos) : renderService(service, x, serviceY, tileWidth, geometry.itemHeight, theme, themeName, box.secondary, customLogos);
    }).join('');
    y = groupTop + geometry.height;
    return `<g>${inset}${groupName}${services}</g>`;
  }).join('');
  const editor = interactive ? ` data-device="${device.id}" role="button" tabindex="0" aria-label="Edit ${escapeXml(device.name)}"` : '';
  return `<g${editor}><title>${escapeXml(device.name)}</title><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="12" fill="${theme.card}" stroke="${theme.line}"/><rect x="${innerX}" y="${box.y + 22}" width="3" height="58" rx="1.5" fill="${device.accent}"/>${iconPlate}<image href="${logoDataUri(device.icon, customLogos)}" x="${box.x + box.w - 67}" y="${box.y + 27}" width="42" height="42" preserveAspectRatio="xMidYMid meet"/>${role}${name}${network}${hardware}${groups}</g>`;
}

function connectionLines(project, layout, theme) {
  const points = new Map();
  const networkIds = new Set(project.networks.map(network => network.id));
  layout.networks.forEach(box => points.set(box.id, { x: box.x + box.w / 2, top: box.y, bottom: box.y + box.h }));
  layout.cards.forEach(box => points.set(box.id, { x: box.x + box.w / 2, top: box.y, bottom: box.y + box.h }));
  return project.connections.filter(connection => layout.drawable(connection)).map(connection => {
    const from = points.get(connection.from);
    const to = points.get(connection.to);
    if (networkIds.has(connection.from) && networkIds.has(connection.to)) {
      const fromBox = layout.networks.find(item => item.id === connection.from);
      const toBox = layout.networks.find(item => item.id === connection.to);
      const forward = from.x < to.x;
      const startX = forward ? fromBox.x + fromBox.w : fromBox.x;
      const endX = forward ? toBox.x : toBox.x + toBox.w;
      return `<path d="M ${startX} ${(from.top + from.bottom) / 2} H ${endX}" fill="none" stroke="${theme.muted}" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    }
    const network = networkIds.has(connection.from) ? from : to;
    const device = network === from ? to : from;
    const gapX = layout.vlanRouteXs.reduce((best, x) => Math.abs(x - network.x) < Math.abs(best - network.x) ? x : best);
    const laneTop = layout.vlans.length ? layout.vlans[0].y - 14 : network.bottom + 12;
    const path = `M ${network.x} ${network.bottom} V ${laneTop} H ${gapX} V ${layout.routingLaneY} H ${device.x} V ${device.top}`;
    return `<g><path d="${path}" fill="none" stroke="${theme.muted}" stroke-width="1.4"/><circle cx="${gapX}" cy="${layout.routingLaneY}" r="3" fill="${theme.teal}"/><circle cx="${device.x}" cy="${layout.routingLaneY}" r="3" fill="${theme.teal}"/></g>`;
  }).join('');
}

export function renderProject(project, { displayProject = project, interactive = true } = {}) {
  validateProject(project);
  const layout = layoutProject(project);
  const theme = palettes[project.theme];
  const serviceCount = project.devices.reduce((sum, device) => sum + device.groups.reduce((groupSum, group) => groupSum + group.services.length, 0), 0);
  const titleLines = wrapText(project.title, layout.titleMaxChars, 2);
  const title = textElement(displayProject.title, layout.margin, 103, { fill: theme.text, size: 68, weight: 700, maxChars: layout.titleMaxChars, maxLines: 2, lineHeight: 74 });
  const subtitleY = 136 + (titleLines.length - 1) * 74;
  const subtitle = textElement(displayProject.subtitle, layout.margin, subtitleY, { fill: theme.muted, size: 15, weight: 500, maxChars: Math.max(24, Math.floor((layout.width - layout.margin * 2) / 8)), maxLines: 2, lineHeight: 19 });
  const statsY = layout.oneColumnHeader ? subtitleY + 58 : 70;
  const statStart = layout.oneColumnHeader ? layout.margin : layout.width - layout.margin - 360;
  const statWidth = layout.oneColumnHeader ? (layout.width - layout.margin * 2) / 3 : 120;
  const stats = [[project.devices.length, 'HOSTS'], [serviceCount, 'SERVICES'], [project.vlans.length, 'VLANS']].map(([value, label], index) => `${textElement(String(value).padStart(2, '0'), statStart + index * statWidth, statsY, { fill: index ? theme.text : theme.teal, size: 44, weight: 600, maxChars: 3 })}${textElement(label, statStart + index * statWidth, statsY + 28, { fill: theme.muted, size: 10, weight: 600, maxChars: 10 })}`).join('');
  const networkLogos = new Map(project.networks.map(network => [network.id, networkLogoId(network)]));
  const networks = displayProject.networks.map(network => renderNetwork(network, networkLogos.get(network.id), layout.networks.find(box => box.id === network.id), theme, project.theme, project.customLogos, interactive)).join('');
  const vlans = displayProject.vlans.map(vlan => {
    const box = layout.vlans.find(item => item.id === vlan.id);
    const label = textElement(vlan.name, box.x + 20, box.y + 29, { fill: theme.text, size: 13, weight: 650, maxChars: Math.max(8, Math.floor((box.w - 30) / 7)) });
    return `<g><title>${escapeXml(vlan.name)}</title><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="6" fill="${theme.tile}" stroke="${theme.line}"/><rect x="${box.x + 9}" y="${box.y + 12}" width="3" height="22" rx="1.5" fill="${vlan.color}"/>${label}</g>`;
  }).join('');
  const cards = layout.cards.map(box => renderCard(displayProject.devices.find(device => device.id === box.id), box, theme, project.theme, project.customLogos, interactive)).join('');
  const names = new Map([...displayProject.networks, ...displayProject.devices].map(item => [item.id, item.name]));
  const relationships = layout.relationships.map((_, index) => {
    const connection = displayProject.connections[index];
    const column = index % layout.relationshipColumns;
    const row = Math.floor(index / layout.relationshipColumns);
    const columnWidth = (layout.width - layout.margin * 2) / layout.relationshipColumns;
    const x = layout.margin + column * columnWidth;
    const y = layout.relationshipsY + 25 + row * 32;
    const endpoints = textElement(`${names.get(connection.from)} → ${names.get(connection.to)}`, x, y, { fill: theme.muted, size: 11, weight: 550, maxChars: Math.floor(columnWidth / 7) });
    const label = connection.label ? textElement(connection.label, x, y + 14, { fill: theme.text, size: 11, weight: 650, maxChars: Math.floor(columnWidth / 7) }) : '';
    return `${endpoints}${label}`;
  }).join('');
  const relationshipTitle = layout.relationships.length ? `<text x="${layout.margin}" y="${layout.relationshipsY - 14}" fill="${theme.muted}" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="1.5">RELATIONSHIPS</text>` : '';
  const footer = `<line x1="${layout.margin}" y1="${layout.footerY}" x2="${layout.width - layout.margin}" y2="${layout.footerY}" stroke="${theme.line}"/><text x="${layout.margin}" y="${layout.footerY + 28}" fill="${theme.muted}" font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="1.5">HOMELAB ATLAS</text><text x="${layout.width - layout.margin}" y="${layout.footerY + 28}" fill="${theme.muted}" font-family="${FONT}" font-size="10" text-anchor="end">Logical links · Service groups</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${escapeXml(displayProject.title)}"><defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${theme.line}" opacity="0.22"/></pattern><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="${theme.muted}" stroke-width="1.2"/></marker></defs><rect width="100%" height="100%" fill="${theme.bg}"/><rect width="100%" height="100%" fill="url(#dots)"/><line x1="${layout.margin}" y1="42" x2="${layout.margin + 38}" y2="42" stroke="${theme.teal}" stroke-width="4" stroke-linecap="round"/><text x="${layout.margin + 52}" y="46" fill="${theme.muted}" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="2">BUILT AT HOME</text>${title}${subtitle}${stats}${connectionLines(project, layout, theme)}${networks}${vlans}${cards}${relationshipTitle}${relationships}${footer}</svg>`;
}
