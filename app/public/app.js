import { LOGOS, customLogoEntries, logoById, logoDataUri, logoPlate, networkLogoId, searchLogos } from './catalog.js';
import {
  LIMITS, emptyProject, layoutProject, parseProject, removeDevice, removeGroup, removeNetwork, removeService, resetAutoLayout,
  renderProject, sampleProject, setManualCard, uid, validateProject,
} from './model.js';
import { createExportSnapshot } from './export.js';
import { adoptSharedProject, applyProjectChange, fetchSharedProject, filterInventory, keepUnreadableCopy, loadStoredProject, hasStorageConflict, pngDimensions, restoreBeforeShared, SHARED_ETAG_KEY, updateSelection } from './state.js';
import { CUSTOM_LOGO_LIMITS, normalizeLogoUpload, verifyCustomLogoDecodes } from './custom-logos.js';
import {
  applyDiscoveryPlan, captureProjectGuard, discoveryBinding, discoveryBindingLabel, filterDiscoveryFindings, matchDiscoveryLogo,
  parseDiscoverySnapshot, planDiscoveryMerge, projectGuardCurrent, setVisibleDiscoverySelection, suggestDiscoveryDestination,
  suggestDiscoveryGroup, suggestDiscoveryService, validateDiscoverySnapshot, validateNmapBundle,
} from './discovery.js';
import { discoverySetupProgress, discoverySetupSteps, SETUP_COMMANDS, shouldOpenDockerSetup, updateDiscoverySetupAnswers } from './discovery-setup.js';

const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'homelab-atlas.project';
const DISCOVERY_PAGE_SIZE = 50;
const TAB_ID = uid('tab');
const templates = [
  { id: 'server', name: 'Server', icon: 'server', accent: '#38bdf8', services: [] },
  { id: 'nas', name: 'NAS', icon: 'truenas', accent: '#22b8cf', services: [['truenas', 'TrueNAS']] },
  { id: 'hypervisor', name: 'Hypervisor', icon: 'proxmox', accent: '#f97316', services: [['proxmox', 'Proxmox']] },
  { id: 'media', name: 'Media server', icon: 'unraid', accent: '#f59e0b', services: [['jellyfin', 'Jellyfin'], ['sonarr', 'Sonarr'], ['radarr', 'Radarr']] },
  { id: 'ai', name: 'AI server', icon: 'open-webui', accent: '#8b5cf6', services: [['ollama', 'Ollama'], ['open-webui', 'Open WebUI']] },
  { id: 'pi', name: 'Raspberry Pi', icon: 'raspberry-pi', accent: '#ef476f', services: [] },
  { id: 'cloud', name: 'Cloud server', icon: 'server', accent: '#3b82f6', services: [] },
  { id: 'router', name: 'Router', icon: 'router', accent: '#22c55e', network: true },
  { id: 'switch', name: 'Switch', icon: 'switch', accent: '#06b6d4', network: true },
  { id: 'wifi', name: 'Wi-Fi', icon: 'wifi', accent: '#a78bfa', network: true },
  { id: 'internet', name: 'Internet', icon: 'internet', accent: '#f97316', network: true },
];

let project;
let selected = null;
let inspectorOpen = false;
let history = [];
let future = [];
let zoom = 1;
let fitMode = 'width';
let inventoryQuery = '';
let focusMode = false;
let inventoryOpen = false;
let arrangeMode = false;
let inspectorTab = 'details';
let inspectorTabDevice = null;
let gesture = null;
let suppressDiagramClick = false;
let saveTimer;
let lastStored = '';
let conflictRaw = '';
let logoDialogState = null;
let logoSelection = new Set();
let discoveryState = null;
let apiToken = '';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function icon(name) {
  const paths = {
    add: '<path d="M10 4v12M4 10h12"/>',
    close: '<path d="m5 5 10 10M15 5 5 15"/>',
    up: '<path d="m5 12 5-5 5 5"/>',
    down: '<path d="m5 8 5 5 5-5"/>',
  };
  return `<svg viewBox="0 0 20 20" aria-hidden="true">${paths[name]}</svg>`;
}

function logoPlateClass(id) {
  const plate = logoPlate(id, 'navy', project?.customLogos || []);
  return plate === '#f8fafc' ? 'logo-plate-light' : plate ? 'logo-plate-dark' : '';
}

const logoSource = id => logoDataUri(id, project?.customLogos || []);
const logoFor = id => logoById(id, project?.customLogos || []);
const pickerPlateClass = logo => logo.background === 'light' ? 'logo-plate-light' : logo.background === 'dark' ? 'logo-plate-dark' : logoPlateClass(logo.id);

function toast(message, persistent = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(element._timer);
  if (!persistent) element._timer = setTimeout(() => element.classList.remove('show'), 4000);
}

function setSaveStatus(message, warning = false) {
  $('#save-status').textContent = message;
  $('#save-status').classList.toggle('warn', warning);
}

function countServices(source = project) {
  return source.devices.reduce((total, device) => total + device.groups.reduce((sum, group) => sum + group.services.length, 0), 0);
}

function quantity(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function countGroups(source = project) {
  return source.devices.reduce((total, device) => total + device.groups.length, 0);
}

function change(mutator, options = {}) {
  try {
    const previous = project;
    const candidate = applyProjectChange(project, mutator);
    history.push(structuredClone(previous));
    if (history.length > 60) history.shift();
    future = [];
    project = candidate;
    if ('select' in options) selected = options.select;
    render();
    scheduleSave();
    return true;
  } catch (error) {
    render();
    toast(error.message);
    return false;
  }
}

function replaceProject(next) {
  validateProject(next);
  history.push(structuredClone(project));
  if (history.length > 60) history.shift();
  future = [];
  project = structuredClone(next);
  project.revision = history.at(-1).revision + 1;
  selected = null;
  render();
  scheduleSave();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveStatus('Saving…');
  saveTimer = setTimeout(() => saveProject(), 350);
}

function showConflict(raw) {
  conflictRaw = raw;
  $('#conflict-banner').hidden = false;
  setSaveStatus('Save conflict — action needed', true);
}

function hideConflict() {
  conflictRaw = '';
  $('#conflict-banner').hidden = true;
}

function saveProject(force = false) {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (!force && hasStorageConflict(existing, lastStored, TAB_ID)) {
      showConflict(existing);
      return false;
    }
    const raw = JSON.stringify({ tab: TAB_ID, data: JSON.stringify(project) });
    localStorage.setItem(STORAGE_KEY, raw);
    lastStored = raw;
    hideConflict();
    setSaveStatus('Saved locally');
    return true;
  } catch {
    setSaveStatus('Not saved locally — use Save project', true);
    toast('Local storage is full or unavailable. Your edit is still open. Use Save project to download it.', true);
    return false;
  }
}

async function loadProject() {
  const stored = await loadStoredProject({
    storage: localStorage,
    key: STORAGE_KEY,
    parse: parseProject,
    verify: loaded => verifyCustomLogoDecodes(loaded.customLogos),
  });
  if (stored.status === 'unavailable' || stored.status === 'unreadable') {
    project = sampleProject();
    setSaveStatus('Not saved — storage unavailable', true);
    const kept = stored.status === 'unreadable' && keepUnreadableCopy(localStorage, stored.raw);
    toast(`Local project could not be loaded: ${stored.error.message}${kept ? ' The unreadable copy was kept in this browser under its own key, so it can still be recovered by hand.' : ''}`);
    render();
    // An unreadable copy with working storage still gets the shared file offered, as a replacement, so the user is
    // asked first. When storage itself cannot be read the shared file is not offered, as before.
    if (stored.status === 'unreadable') offerSharedProject({ hadStoredProject: true, startRevision: project.revision });
    return;
  }
  const fresh = stored.status === 'empty';
  if (fresh) {
    project = sampleProject();
  } else {
    project = stored.project;
    lastStored = stored.raw;
  }
  render();
  if (fresh) saveProject(); else setSaveStatus('Saved locally');
  // The editor is already usable: the shared file is fetched in the background and never awaited here.
  offerSharedProject({ hadStoredProject: !fresh, startRevision: project.revision });
}

// Offers the optional server-side project file (ATLAS_PROJECT_FILE) once per file version. The
// answer may arrive after the user started editing: whatever is stored by then counts as an
// existing project, so replacing it always needs the user's confirmation.
async function offerSharedProject({ hadStoredProject, startRevision }) {
  let seen = '';
  try { seen = localStorage.getItem(SHARED_ETAG_KEY) || ''; } catch { /* storage unavailable: offer every time */ }
  const result = await fetchSharedProject(fetch.bind(window), seen);
  if (result.status === 'invalid') {
    toast(`The shared project file could not be loaded: ${result.error}`, true);
    return;
  }
  if (result.status !== 'loaded') return;
  try {
    await verifyCustomLogoDecodes(result.project.customLogos);
  } catch (error) {
    toast(`The shared project file could not be loaded: ${error.message}`, true);
    return;
  }
  // What is on screen counts, not what autosave has written so far: an edit made just before the
  // shared file arrived may not be in the browser storage yet.
  const onScreen = () => JSON.stringify({ tab: TAB_ID, data: JSON.stringify(project) });
  const existingRaw = hadStoredProject || project.revision !== startRevision ? onScreen() : '';
  const outcome = await adoptSharedProject({
    shared: result,
    existingRaw,
    currentRaw: onScreen,
    storage: localStorage,
    confirmReplace: () => window.confirm('A shared project file is available on the server. Replace the diagram in this browser with it?\n\nYour current diagram is kept as a backup in this browser.'),
    commit: shared => {
      const previous = project;
      project = shared;
      if (saveProject()) {
        history = [];
        future = [];
        selected = null;
        render();
        return true;
      }
      project = previous;
      return false;
    },
  });
  if (outcome.status === 'adopted') {
    toast('Loaded the shared project file from the server. Your previous browser copy was kept as a backup in this browser.');
  } else if (outcome.status === 'backup-failed') {
    toast('The shared project file was not loaded: the backup of your current diagram could not be saved. Nothing was changed.', true);
  } else if (outcome.status === 'save-failed') {
    toast(outcome.backupKept === false
      ? 'The shared project file was not loaded: it could not be saved in this browser. The diagram on screen is unchanged, but the backup from an earlier replacement could not be put back.'
      : 'The shared project file was not loaded: it could not be saved in this browser. Your current diagram is unchanged.', true);
  }
}

function render() {
  validateProject(project);
  $('#project-title').value = project.title;
  $('#preview').innerHTML = renderProject(project);
  const selectedNode = selected && $(`#preview [data-device="${CSS.escape(selected)}"], #preview [data-network="${CSS.escape(selected)}"]`);
  selectedNode?.classList.add('editor-selected');
  renderInventory();
  renderInspector();
  $('.inspector').classList.toggle('open', inspectorOpen);
  $('.workspace').classList.toggle('inspector-open', inspectorOpen);
  $('.workspace').classList.toggle('focus-mode', focusMode);
  $('.workspace').classList.toggle('drawer-open', inventoryOpen);
  $('#inventory-toggle').setAttribute('aria-expanded', String(inventoryOpen));
  $('#focus-canvas span').textContent = focusMode ? 'Exit focus' : 'Focus canvas';
  $('#focus-canvas').setAttribute('aria-pressed', String(focusMode));
  $('#arrange').setAttribute('aria-pressed', String(arrangeMode));
  $('#diagram-summary').textContent = `${quantity(project.devices.length, 'device')} · ${quantity(countServices(), 'app')}`;
  $('#auto-layout').disabled = project.layout.mode === 'auto';
  $('#arrange-hint').hidden = !arrangeMode;
  $('#undo').disabled = !history.length;
  $('#redo').disabled = !future.length;
  invalidateDiscoveryIfStale();
  requestAnimationFrame(() => fitMode === 'manual' ? applyZoom() : fitPreview(fitMode));
}

function applyZoom(source = project, layout = layoutProject(source), guides = []) {
  const svg = $('#preview svg');
  if (!svg) return;
  const width = svg.viewBox.baseVal.width * zoom;
  const height = svg.viewBox.baseVal.height * zoom;
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  $('#zoom-label').value = `${Math.round(zoom * 100)}%`;
  decorateArrange(source, layout, guides);
}

function fitPreview(mode = fitMode) {
  const svg = $('#preview svg');
  const canvas = $('#canvas');
  if (!svg || !canvas.clientWidth || !canvas.clientHeight) return;
  const style = getComputedStyle(canvas);
  const availableWidth = Math.max(100, canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  const availableHeight = Math.max(100, canvas.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
  zoom = Math.min(1, availableWidth / svg.viewBox.baseVal.width, mode === 'page' ? availableHeight / svg.viewBox.baseVal.height : 1);
  applyZoom();
}

function decorateArrange(source, layout, guides = []) {
  const preview = $('#preview');
  preview.classList.toggle('arranging', arrangeMode);
  preview.querySelectorAll('.resize-hit, .resize-grip, .alignment-guide').forEach(node => node.remove());
  if (!arrangeMode || !selected) return;
  const group = preview.querySelector(`[data-device="${CSS.escape(selected)}"]`);
  const box = layout.cards.find(card => card.id === selected);
  if (!group || !box) return;
  group.classList.add('editor-selected');
  const hit = 20 / zoom;
  const grip = 8 / zoom;
  group.insertAdjacentHTML('beforeend', `<rect class="resize-hit" x="${box.x + box.w - hit}" y="${box.y + box.h - hit}" width="${hit}" height="${hit}" role="button" aria-label="Resize ${escapeHtml(source.devices.find(device => device.id === selected).name)}"/><path class="resize-grip" d="M ${box.x + box.w - grip} ${box.y + box.h} L ${box.x + box.w} ${box.y + box.h - grip} L ${box.x + box.w} ${box.y + box.h} Z"/>`);
  const svg = preview.querySelector('svg');
  for (const guide of guides) svg.insertAdjacentHTML('beforeend', guide.axis === 'x'
    ? `<line class="alignment-guide" x1="${guide.value + layout.margin}" y1="${layout.cardsY}" x2="${guide.value + layout.margin}" y2="${svg.viewBox.baseVal.height}"/>`
    : `<line class="alignment-guide" x1="${layout.margin}" y1="${guide.value + layout.cardsY}" x2="${svg.viewBox.baseVal.width - layout.margin}" y2="${guide.value + layout.cardsY}"/>`);
}

function renderPreview(source = project, guides = []) {
  $('#preview').innerHTML = renderProject(source);
  const node = selected && $(`#preview [data-device="${CSS.escape(selected)}"], #preview [data-network="${CSS.escape(selected)}"]`);
  node?.classList.add('editor-selected');
  const layout = layoutProject(source);
  applyZoom(source, layout, guides);
}

function focusSelectedCard(id = selected) {
  requestAnimationFrame(() => {
    if (!id || selected !== id || !arrangeMode || document.querySelector('dialog[open]') || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
    $(`#preview [data-device="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  });
}

function renderInventory() {
  const devices = filterInventory(project.devices, inventoryQuery, ['name', 'role']);
  const networks = filterInventory(project.networks, inventoryQuery, ['name', 'kind']);
  $('#device-count').textContent = project.devices.length;
  $('#network-count').textContent = project.networks.length;
  $('#inventory-summary').textContent = `${quantity(project.devices.length, 'device')} · ${quantity(countServices(), 'app')}`;
  const deviceList = $('#device-list');
  deviceList.replaceChildren(...devices.map(device => {
    const index = project.devices.indexOf(device);
    const row = document.createElement('div');
    row.className = `inventory-item ${selected === device.id ? 'selected' : ''}`;
    row.dataset.id = device.id;
    row.innerHTML = `<button class="inventory-select" aria-label="Edit ${escapeHtml(device.name)}"><img class="${logoPlateClass(device.icon)}" alt="" src="${logoSource(device.icon)}"><span><strong></strong><small></small></span></button><span class="reorder"><button class="mini" data-move="-1" aria-label="Move up">${icon('up')}</button><button class="mini" data-move="1" aria-label="Move down">${icon('down')}</button></span>`;
    row.querySelector('strong').textContent = device.name;
    row.querySelector('small').textContent = device.role;
    const buttons = row.querySelectorAll('[data-move]');
    buttons[0].disabled = index === 0;
    buttons[1].disabled = index === project.devices.length - 1;
    return row;
  }));
  if (!devices.length) deviceList.innerHTML = '<p class="inventory-empty">No matching devices.</p>';

  const networkList = $('#network-list');
  networkList.replaceChildren(...networks.map(network => {
    const row = document.createElement('div');
    row.className = `inventory-item ${selected === network.id ? 'selected' : ''}`;
    row.dataset.id = network.id;
    const icon = networkLogoId(network);
    row.innerHTML = `<button class="inventory-select" aria-label="Edit ${escapeHtml(network.name)}"><img class="${logoPlateClass(icon)}" alt="" src="${logoSource(icon)}"><span><strong></strong><small></small></span></button>`;
    row.querySelector('strong').textContent = network.name;
    row.querySelector('small').textContent = network.kind;
    return row;
  }));
  if (!networks.length) networkList.innerHTML = '<p class="inventory-empty">No matching network nodes.</p>';
}

function projectForm() {
  return `<div class="settings"><section class="inspector-section"><h3>Appearance</h3><label>Subtitle<input data-project="subtitle" maxlength="120"></label><div class="form-grid"><label>Theme<select data-project="theme"><option value="navy">Navy</option><option value="light">Light</option><option value="midnight">Midnight</option></select></label><label>Columns<select data-project="columns"><option>1</option><option>2</option><option>3</option><option>4</option></select></label></div><label>Density<select data-project="density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label></section><section class="inspector-section"><div class="section-head"><h3>VLANs</h3><button type="button" data-add-vlan>${icon('add')}VLAN</button></div><div id="vlan-list" class="vlan-list"></div></section><section class="inspector-section"><h3>Links</h3><button type="button" data-edit-connections>Edit connections</button></section></div>`;
}

function bindProjectForm(root) {
  for (const key of ['subtitle', 'theme', 'columns', 'density']) root.querySelector(`[data-project=${key}]`).value = project[key];
  root.querySelector('#vlan-list').replaceChildren(...project.vlans.map(vlan => {
    const row = document.createElement('div');
    row.className = 'vlan-row';
    row.dataset.vlan = vlan.id;
    row.innerHTML = `<input data-vlan-name maxlength="120" aria-label="VLAN name"><input data-vlan-color type="color" aria-label="VLAN color"><button type="button" data-remove-vlan class="danger" aria-label="Remove VLAN">${icon('close')}</button>`;
    row.querySelector('[data-vlan-name]').value = vlan.name;
    row.querySelector('[data-vlan-color]').value = vlan.color;
    return row;
  }));
}

function renderInspector() {
  const root = $('#inspector-content');
  const device = project.devices.find(item => item.id === selected);
  const network = project.networks.find(item => item.id === selected);
  if (!device && !network) {
    inspectorTabDevice = null;
    root.innerHTML = `<span class="eyebrow">Project</span><h2>Diagram settings</h2><p class="muted">Select a device or network node to edit it.</p>${projectForm()}`;
    bindProjectForm(root);
    return;
  }
  if (network) {
    inspectorTabDevice = null;
    const logoChoice = (field, label) => {
      const id = field === 'icon' ? networkLogoId(network) : network.secondaryIcon;
      const value = network[field];
      const text = value ? logoFor(value).label : field === 'icon' ? `Auto · ${logoFor(id).label}` : 'None';
      const thumbnail = id ? `<img class="${logoPlateClass(id)}" alt="" src="${logoSource(id)}">` : '<span class="logo-none" aria-hidden="true">—</span>';
      return `<div class="network-logo-field"><span>${label}</span><button type="button" data-network-logo="${field}" aria-haspopup="dialog" aria-label="Choose ${label.toLowerCase()}: ${escapeHtml(text)}">${thumbnail}<span>${escapeHtml(text)}</span></button></div>`;
    };
    const networkIcon = networkLogoId(network);
    root.innerHTML = `<div class="inspector-head"><div class="inspector-identity"><img class="inspector-logo ${logoPlateClass(networkIcon)}" alt="" src="${logoSource(networkIcon)}"><div><span class="eyebrow">Network node</span><h2>${escapeHtml(network.name)}</h2></div></div></div><div class="inspector-actions"><button data-delete-network class="danger">Delete</button></div><section class="inspector-section"><h3>Identity</h3><label>Name<input data-network="name" maxlength="120"></label><div class="form-grid"><label>Kind<input data-network="kind" maxlength="120"></label><label>Accent<input data-network="accent" type="color"></label></div>${logoChoice('icon', 'Logo')}${logoChoice('secondaryIcon', 'Secondary logo')}<p class="help">Add a secondary logo for an optional backup provider in the same node.</p></section>`;
    for (const key of ['name', 'kind', 'accent']) root.querySelector(`[data-network=${key}]`).value = network[key];
    return;
  }
  const deviceLogo = logoFor(device.icon);
  if (inspectorTabDevice !== device.id) {
    inspectorTabDevice = device.id;
    inspectorTab = 'details';
  }
  const diagram = layoutProject(project);
  const card = diagram.cards.find(item => item.id === device.id);
  const position = { x: Math.round(card.x - diagram.margin), y: Math.round(card.y - diagram.cardsY), w: Math.round(card.w), h: Math.round(card.h) };
  const serviceCount = device.groups.reduce((sum, group) => sum + group.services.length, 0);
  const tabs = [
    ['details', 'Details'],
    ['apps', `Apps (${serviceCount})`],
    ['layout', 'Layout'],
  ];
  root.innerHTML = `<div class="inspector-head"><div class="inspector-identity"><img class="inspector-logo ${logoPlateClass(device.icon)}" alt="" src="${logoSource(device.icon)}"><div><span class="eyebrow">Device</span><h2>${escapeHtml(device.name)}</h2></div></div></div><div class="inspector-actions"><button data-duplicate title="Duplicate" aria-label="Duplicate device">Copy</button><button data-delete class="danger">Delete</button></div><div class="inspector-tabs" role="tablist" aria-label="Device inspector">${tabs.map(([id, label]) => `<button id="inspector-tab-${id}" role="tab" aria-selected="${inspectorTab === id}" aria-controls="inspector-panel-${id}" tabindex="${inspectorTab === id ? 0 : -1}" data-inspector-tab="${id}">${label}</button>`).join('')}</div><div id="inspector-panel-details" class="tab-panel" role="tabpanel" aria-labelledby="inspector-tab-details" ${inspectorTab === 'details' ? '' : 'hidden'}><section class="inspector-section"><h3>Identity</h3><label>Name<input data-device="name" maxlength="120"></label><label>Role<input data-device="role" maxlength="120"></label><div class="form-grid"><label>Network / VLAN<input data-device="network" maxlength="120"></label><label>Accent<input data-device="accent" type="color"></label></div><div class="network-logo-field"><span>Device icon</span><button type="button" data-device-logo aria-haspopup="dialog" aria-label="Choose device icon: ${escapeHtml(deviceLogo.label)}"><img class="${logoPlateClass(device.icon)}" alt="" src="${logoSource(device.icon)}"><span>${escapeHtml(deviceLogo.label)}</span></button></div></section><section class="inspector-section"><h3>Hardware</h3><label>Facts <span class="muted">One per line. Optional Label: value.</span><textarea data-hardware maxlength="1451"></textarea></label></section></div><div id="inspector-panel-apps" class="tab-panel" role="tabpanel" aria-labelledby="inspector-tab-apps" ${inspectorTab === 'apps' ? '' : 'hidden'}><section class="inspector-section"><div class="section-head"><h3>Service groups</h3><button data-add-group>${icon('add')}Group</button></div><div id="groups"></div></section></div><div id="inspector-panel-layout" class="tab-panel" role="tabpanel" aria-labelledby="inspector-tab-layout" ${inspectorTab === 'layout' ? '' : 'hidden'}><section class="inspector-section"><h3>Position</h3><div class="position-grid"><label>X<input data-position="x" type="number" min="0" max="100000" step="1" value="${position.x}"></label><label>Y<input data-position="y" type="number" min="0" max="100000" step="1" value="${position.y}"></label><label>Width<input data-position="w" type="number" min="240" max="100000" step="1" value="${position.w}"></label><label>Height<input data-position="h" type="number" min="100" max="100000" step="1" value="${position.h}"></label></div><p class="help">Positions use diagram units. Content sets the minimum height.</p></section></div>`;
  for (const key of ['name', 'role', 'network', 'accent']) root.querySelector(`[data-device=${key}]`).value = device[key];
  root.querySelector('[data-hardware]').value = device.hardware.join('\n');
  root.querySelector('#groups').replaceChildren(...device.groups.map(groupElement));
}

function groupElement(group) {
  const element = document.createElement('section');
  element.className = 'group';
  element.dataset.group = group.id;
  element.innerHTML = `<div class="group-head"><input data-group-name maxlength="120" aria-label="Group name"><button data-add-services>${icon('add')}Apps</button><button data-remove-group class="danger" aria-label="Remove group">${icon('close')}</button></div><div class="service-list"></div>`;
  element.querySelector('[data-group-name]').value = group.name;
  element.querySelector('.service-list').replaceChildren(...group.services.map(service => {
    const row = document.createElement('div');
    row.className = 'service-row';
    row.dataset.service = service.id;
    row.innerHTML = `<button type="button" data-service-logo class="service-logo" aria-haspopup="dialog" aria-label="Change logo for ${escapeHtml(service.name)}"><img class="${logoPlateClass(service.logo)}" alt="" src="${logoSource(service.logo)}"></button><input data-service-name maxlength="120" aria-label="Service name"><div class="service-controls"><input data-service-count type="number" min="1" max="99" step="1" aria-label="Instance count"><button data-service-up class="mini" aria-label="Move up">${icon('up')}</button><button data-service-down class="mini" aria-label="Move down">${icon('down')}</button><button data-remove-service class="mini danger" aria-label="Remove service">${icon('close')}</button></div>`;
    row.querySelector('[data-service-name]').value = service.name;
    row.querySelector('[data-service-count]').value = service.count;
    return row;
  }));
  return element;
}

function selectInventoryItem(id) {
  if (id !== selected) inspectorTabDevice = null;
  selected = id;
  inspectorOpen = true;
  focusMode = false;
  inventoryOpen = false;
  render();
}

for (const id of ['device-list', 'network-list']) {
  const list = $(`#${id}`);
  list.addEventListener('click', event => {
    const item = event.target.closest('[data-id]');
    if (!item) return;
    const move = event.target.closest('[data-move]');
    if (move) {
      event.stopPropagation();
      const deviceId = item.dataset.id;
      change(candidate => {
        const index = candidate.devices.findIndex(device => device.id === deviceId);
        const target = index + Number(move.dataset.move);
        candidate.devices.splice(target, 0, candidate.devices.splice(index, 1)[0]);
      });
      return;
    }
    selectInventoryItem(item.dataset.id);
  });
}

$('#project-title').addEventListener('change', event => change(candidate => { candidate.title = event.target.value; }));

$('#inspector-content').addEventListener('change', event => {
  const deviceId = project.devices.some(item => item.id === selected) ? selected : null;
  const networkId = project.networks.some(item => item.id === selected) ? selected : null;
  if (event.target.dataset.position && deviceId) {
    const key = event.target.dataset.position;
    const value = Number(event.target.value);
    if (!Number.isInteger(value)) { render(); return toast('Position values must be whole numbers.'); }
    change(candidate => setManualCard(candidate, deviceId, { [key]: value }));
  } else if (event.target.dataset.device && deviceId) {
    const key = event.target.dataset.device;
    change(candidate => { candidate.devices.find(item => item.id === deviceId)[key] = event.target.value; });
  } else if (event.target.matches('[data-hardware]') && deviceId) {
    const facts = event.target.value.split('\n').map(value => value.trim()).filter(Boolean);
    if (facts.length > LIMITS.hardware || facts.some(value => value.length > LIMITS.text)) {
      render();
      return toast(`Use at most ${LIMITS.hardware} hardware lines, each no longer than ${LIMITS.text} characters.`);
    }
    change(candidate => { candidate.devices.find(item => item.id === deviceId).hardware = facts; });
  } else if (event.target.dataset.network && networkId) {
    const key = event.target.dataset.network;
    change(candidate => { candidate.networks.find(item => item.id === networkId)[key] = event.target.value; });
  } else if (event.target.dataset.project) {
    const key = event.target.dataset.project;
    const value = key === 'columns' ? Number(event.target.value) : event.target.value;
    change(candidate => { candidate[key] = value; });
  } else if (event.target.matches('[data-group-name]') && deviceId) {
    const groupId = event.target.closest('[data-group]').dataset.group;
    change(candidate => { candidate.devices.find(item => item.id === deviceId).groups.find(group => group.id === groupId).name = event.target.value; });
  } else if (event.target.matches('[data-service-name], [data-service-count]') && deviceId) {
    const groupId = event.target.closest('[data-group]').dataset.group;
    const serviceId = event.target.closest('[data-service]').dataset.service;
    const count = Number(event.target.value);
    if (event.target.matches('[data-service-count]') && (!Number.isInteger(count) || count < 1 || count > 99)) {
      render();
      return toast('Instance count must be a whole number from 1 to 99.');
    }
    change(candidate => {
      const service = candidate.devices.find(item => item.id === deviceId).groups.find(group => group.id === groupId).services.find(item => item.id === serviceId);
      if (event.target.matches('[data-service-count]')) service.count = count; else service.name = event.target.value;
    });
  } else if (event.target.matches('[data-vlan-name], [data-vlan-color]')) {
    const vlanId = event.target.closest('[data-vlan]').dataset.vlan;
    const key = event.target.matches('[data-vlan-name]') ? 'name' : 'color';
    change(candidate => { candidate.vlans.find(vlan => vlan.id === vlanId)[key] = event.target.value; });
  }
});

$('#inspector-content').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.inspectorTab) {
    inspectorTab = button.dataset.inspectorTab;
    for (const tab of $('#inspector-content').querySelectorAll('[role="tab"]')) {
      const active = tab === button;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $(`#${tab.getAttribute('aria-controls')}`).hidden = !active;
    }
    return;
  }
  const deviceId = project.devices.some(item => item.id === selected) ? selected : null;
  const networkId = project.networks.some(item => item.id === selected) ? selected : null;
  if (button.matches('[data-delete]') && deviceId) {
    const name = project.devices.find(device => device.id === deviceId).name;
    if (confirm(`Delete ${name} and its connections?`)) change(candidate => removeDevice(candidate, deviceId), { select: null });
  } else if (button.matches('[data-delete-network]') && networkId) {
    const name = project.networks.find(network => network.id === networkId).name;
    if (confirm(`Delete ${name} and its connections?`)) change(candidate => removeNetwork(candidate, networkId), { select: null });
  } else if (button.matches('[data-network-logo]') && networkId) {
    openNetworkLogoDialog(networkId, button.dataset.networkLogo, button);
  } else if (button.matches('[data-device-logo]') && deviceId) {
    openSingleLogoDialog('device', { deviceId }, button);
  } else if (button.matches('[data-duplicate]') && deviceId) {
    const source = project.devices.find(device => device.id === deviceId);
    const sourceServices = source.groups.reduce((sum, group) => sum + group.services.length, 0);
    if (project.devices.length >= LIMITS.devices) return toast('Device limit reached.');
    if (countGroups() + source.groups.length > LIMITS.groups) return toast('Group limit reached.');
    if (countServices() + sourceServices > LIMITS.services) return toast('Service limit reached.');
    change(candidate => {
      const original = candidate.devices.find(device => device.id === deviceId);
      const copy = structuredClone(original);
      copy.id = uid('dev');
      copy.name = `${copy.name.slice(0, LIMITS.text - 5)} copy`;
      for (const group of copy.groups) {
        group.id = uid('grp');
        for (const service of group.services) service.id = uid('svc');
      }
      candidate.devices.splice(candidate.devices.findIndex(device => device.id === deviceId) + 1, 0, copy);
    });
  } else if (button.matches('[data-add-group]') && deviceId) {
    if (countGroups() >= LIMITS.groups) return toast('Group limit reached.');
    change(candidate => { candidate.devices.find(device => device.id === deviceId).groups.push({ id: uid('grp'), name: 'Services', services: [] }); });
  } else if (button.matches('[data-add-vlan]')) {
    if (project.vlans.length >= LIMITS.networks) return toast('VLAN limit reached.');
    change(candidate => { candidate.vlans.push({ id: uid('vlan'), name: 'New VLAN', color: '#34d399' }); });
  } else if (button.matches('[data-remove-vlan]')) {
    const vlanId = event.target.closest('[data-vlan]').dataset.vlan;
    change(candidate => { candidate.vlans = candidate.vlans.filter(vlan => vlan.id !== vlanId); });
  } else if (button.matches('[data-edit-connections]')) {
    openConnections();
  } else {
    const groupElement = event.target.closest('[data-group]');
    if (!groupElement || !deviceId) return;
    const groupId = groupElement.dataset.group;
    if (button.matches('[data-remove-group]')) {
      change(candidate => removeGroup(candidate, deviceId, groupId));
    } else if (button.matches('[data-add-services]')) {
      openLogoDialog(deviceId, groupId, button);
    } else {
      const row = event.target.closest('[data-service]');
      if (!row) return;
      const serviceId = row.dataset.service;
      if (button.matches('[data-service-logo]')) return openSingleLogoDialog('service', { deviceId, groupId, serviceId }, button);
      const action = ['data-remove-service', 'data-service-up', 'data-service-down'].find(attribute => button.hasAttribute(attribute));
      if (!action) return;
      change(candidate => {
        const services = candidate.devices.find(item => item.id === deviceId).groups.find(group => group.id === groupId).services;
        const index = services.findIndex(service => service.id === serviceId);
        if (button.matches('[data-remove-service]')) removeService(candidate, deviceId, groupId, serviceId);
        else if (button.matches('[data-service-up]') && index > 0) services.splice(index - 1, 0, services.splice(index, 1)[0]);
        else if (button.matches('[data-service-down]') && index < services.length - 1) services.splice(index + 1, 0, services.splice(index, 1)[0]);
      });
    }
  }
});

$('#inspector-content').addEventListener('keydown', event => {
  const tab = event.target.closest('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[index].click();
  tabs[index].focus();
});

function buildTemplates() {
  $('#template-grid').replaceChildren(...templates.map(template => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'template';
    button.dataset.template = template.id;
    button.innerHTML = `<img class="${logoPlateClass(template.icon)}" alt="" src="${logoSource(template.icon)}"><span><strong>${escapeHtml(template.name)}</strong><small class="muted">${template.network ? 'Network node' : 'Device'}</small></span>`;
    return button;
  }));
}

$('#add-device').addEventListener('click', () => $('#device-dialog').showModal());
$('#template-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-template]');
  if (!button) return;
  const template = templates.find(item => item.id === button.dataset.template);
  if (template.network) {
    if (project.networks.length >= LIMITS.networks) return toast('Network node limit reached.');
    const id = uid('net');
    if (change(candidate => { candidate.networks.push({ id, name: template.name, kind: template.name, accent: template.accent, icon: '', secondaryIcon: '' }); }, { select: id })) inspectorOpen = true;
  } else {
    if (project.devices.length >= LIMITS.devices || countGroups() >= LIMITS.groups) return toast('Device or group limit reached.');
    if (countServices() + template.services.length > LIMITS.services) return toast('Service limit reached.');
    const id = uid('dev');
    change(candidate => {
      candidate.devices.push({
        id, name: template.name, role: template.name, icon: template.icon, accent: template.accent, network: 'Main', hardware: [],
        groups: [{ id: uid('grp'), name: 'Services', services: template.services.map(([logo, name]) => ({ id: uid('svc'), logo, name, count: 1 })) }],
      });
    }, { select: id });
    inspectorOpen = true;
  }
  $('#device-dialog').close();
  render();
});

function openLogoDialog(deviceId, groupId, opener) {
  openLogoPicker({ mode: 'service-add', deviceId, groupId }, opener);
}

function openNetworkLogoDialog(networkId, field, opener) {
  openLogoPicker({ mode: 'network', networkId, field }, opener);
}

function openSingleLogoDialog(mode, target, opener) {
  openLogoPicker({ mode, ...target }, opener);
}

function openLogoPicker(target, opener) {
  logoDialogState = { ...target, opener, project, drafts: new Map(), filter: 'all', upload: null };
  logoSelection = new Set();
  $('#logo-search').value = '';
  $('#logo-search').placeholder = target.mode === 'network' ? 'Provider, country, or network…' : 'Jellyfin, device, backup…';
  $('#logo-dialog-eyebrow').textContent = target.mode === 'service-add' ? 'Service catalog' : 'Logo catalog';
  $('#logo-dialog-title').textContent = target.mode === 'service-add' ? 'Add services' : target.mode === 'network' ? (target.field === 'icon' ? 'Choose network logo' : 'Choose secondary logo') : target.mode === 'device' ? 'Choose device icon' : 'Change service logo';
  const multiple = target.mode === 'service-add';
  for (const id of ['selection-count', 'add-custom', 'add-selected']) $(`#${id}`).hidden = !multiple;
  $('#logo-browser').hidden = false;
  $('#logo-preview').hidden = true;
  $('#logo-file').value = '';
  updateLogoFilters();
  renderLogos();
  $('#logo-dialog').showModal();
  $('#logo-search').focus();
}

function pickerTargetExists(state = logoDialogState, source = project) {
  if (!state || state.project !== source) return false;
  if (state.mode === 'network') return source.networks.some(network => network.id === state.networkId);
  const device = source.devices.find(item => item.id === state.deviceId);
  if (!device) return false;
  if (state.mode === 'device') return true;
  const group = device.groups.find(item => item.id === state.groupId);
  return Boolean(group && (state.mode === 'service-add' || group.services.some(service => service.id === state.serviceId)));
}

function currentPickerLogo() {
  const state = logoDialogState;
  if (state.mode === 'network') return project.networks.find(item => item.id === state.networkId)?.[state.field] ?? '';
  const device = project.devices.find(item => item.id === state.deviceId);
  if (state.mode === 'device') return device?.icon;
  return device?.groups.find(item => item.id === state.groupId)?.services.find(item => item.id === state.serviceId)?.logo;
}

function renderLogos() {
  if (!logoDialogState) return;
  const query = $('#logo-search').value.trim();
  const networkMode = logoDialogState.mode === 'network';
  const uploaded = [...customLogoEntries(project.customLogos), ...customLogoEntries([...logoDialogState.drafts.values()])];
  const bundled = networkMode
    ? [...LOGOS.filter(logo => logo.category.startsWith('ISP ·')).sort((a, b) => a.label.localeCompare(b.label)), ...LOGOS.filter(logo => !logo.category.startsWith('ISP ·'))]
    : LOGOS;
  const available = logoDialogState.filter === 'uploaded' ? uploaded : [...uploaded, ...bundled];
  const matches = searchLogos(available, query);
  const grid = $('#logo-grid');
  const emptyMessage = logoDialogState.filter === 'uploaded' && !uploaded.length
    ? 'No uploaded logos yet. Use Upload logo to add one.'
    : 'No matching logos. Try another search or use Upload logo.';
  if (logoDialogState.mode !== 'service-add') {
    const selectedLogo = currentPickerLogo();
    const emptyLabel = logoDialogState.field === 'icon' ? 'Auto' : 'None';
    const emptyDetail = logoDialogState.field === 'icon' ? 'Use the kind-based logo' : 'No secondary logo';
    const empty = networkMode ? `<button type="button" class="logo-option logo-choice ${selectedLogo === '' ? 'selected' : ''}" data-logo-choice="" aria-pressed="${selectedLogo === ''}"><span class="logo-none" aria-hidden="true">—</span><span>${emptyLabel}<small class="muted">${emptyDetail}</small></span></button>` : '';
    grid.innerHTML = `${empty}${matches.map(logo => `<button type="button" class="logo-option logo-choice ${selectedLogo === logo.id ? 'selected' : ''}" data-logo-choice="${logo.id}" aria-pressed="${selectedLogo === logo.id}"><img class="${pickerPlateClass(logo)}" alt="" src="${logo.dataUrl || logoSource(logo.id)}"><span>${escapeHtml(logo.label)}<small class="muted">${escapeHtml(logo.category)}</small></span></button>`).join('')}${matches.length ? '' : `<p class="no-results">${emptyMessage}</p>`}`;
  } else if (!matches.length) {
    grid.innerHTML = `<p class="no-results">${emptyMessage}</p>`;
  } else {
    grid.innerHTML = matches.map(logo => `<label class="logo-option"><input type="checkbox" value="${logo.id}" ${logoSelection.has(logo.id) ? 'checked' : ''}><img class="${pickerPlateClass(logo)}" alt="" src="${logo.dataUrl || logoSource(logo.id)}"><span>${escapeHtml(logo.label)}<small class="muted">${escapeHtml(logo.category)}</small></span></label>`).join('');
  }
  $('#selection-count').textContent = `${logoSelection.size} selected`;
}

$('#logo-search').addEventListener('input', renderLogos);
for (const input of [$('#logo-search'), $('#upload-name')]) input.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
$('#logo-dialog form').addEventListener('submit', event => { if (event.submitter?.value !== 'cancel') event.preventDefault(); });
$('#logo-grid').addEventListener('change', event => {
  if (logoDialogState?.mode !== 'service-add' || !event.target.matches('input[type=checkbox]')) return;
  logoSelection = updateSelection(logoSelection, event.target.value, event.target.checked);
  $('#selection-count').textContent = `${logoSelection.size} selected`;
});
$('#logo-grid').addEventListener('click', event => {
  const choice = event.target.closest('[data-logo-choice]');
  if (!choice || !logoDialogState || logoDialogState.mode === 'service-add' || !pickerTargetExists()) return;
  const state = logoDialogState;
  if (change(candidate => assignPickerLogo(candidate, state, choice.dataset.logoChoice))) $('#logo-dialog').close();
});

function assignPickerLogo(candidate, state, id) {
  if (state.mode === 'network') candidate.networks.find(network => network.id === state.networkId)[state.field] = id;
  else if (state.mode === 'device') candidate.devices.find(device => device.id === state.deviceId).icon = id;
  else candidate.devices.find(device => device.id === state.deviceId).groups.find(group => group.id === state.groupId).services.find(service => service.id === state.serviceId).logo = id;
}

$('#add-selected').addEventListener('click', event => {
  event.preventDefault();
  if (logoDialogState?.mode !== 'service-add' || !pickerTargetExists()) return;
  const state = logoDialogState;
  const { deviceId, groupId } = state;
  const ids = [...logoSelection];
  if (!ids.length) return toast('Select at least one service.');
  if (countServices() + ids.length > LIMITS.services) return toast('Service limit reached.');
  if (change(candidate => {
    candidate.customLogos.push(...ids.filter(id => state.drafts.has(id)).map(id => state.drafts.get(id)));
    const group = candidate.devices.find(device => device.id === deviceId).groups.find(item => item.id === groupId);
    group.services.push(...ids.map(id => ({ id: uid('svc'), logo: id, name: state.drafts.get(id)?.label || logoFor(id).label, count: 1 })));
  })) $('#logo-dialog').close();
});
$('#add-custom').addEventListener('click', () => {
  if (logoDialogState?.mode !== 'service-add' || !pickerTargetExists()) return;
  const name = prompt('Custom service name:')?.trim();
  if (!name) return;
  if (name.length > LIMITS.text) return toast(`Service names must be ${LIMITS.text} characters or fewer.`);
  if (countServices() >= LIMITS.services) return toast('Service limit reached.');
  const { deviceId, groupId } = logoDialogState;
  if (change(candidate => {
    candidate.devices.find(device => device.id === deviceId).groups.find(group => group.id === groupId).services.push({ id: uid('svc'), logo: 'generic', name, count: 1 });
  })) $('#logo-dialog').close();
});

function updateLogoFilters() {
  document.querySelectorAll('[data-logo-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.logoFilter === logoDialogState?.filter)));
}

document.querySelectorAll('[data-logo-filter]').forEach(button => button.addEventListener('click', () => {
  logoDialogState.filter = button.dataset.logoFilter;
  updateLogoFilters();
  renderLogos();
}));

$('#upload-logo').addEventListener('click', () => $('#logo-file').click());
$('#logo-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !logoDialogState) return;
  const state = logoDialogState;
  const token = Symbol('upload');
  state.uploadToken = token;
  $('#upload-logo').disabled = true;
  $('#add-selected').disabled = true;
  $('#upload-error').textContent = '';
  const base = file.name.replace(/\.[^.]+$/, '').trim().slice(0, LIMITS.text) || 'Uploaded logo';
  const allIds = new Set([...LOGOS.map(logo => logo.id), ...project.customLogos.map(logo => logo.id), ...state.drafts.keys(), ...project.networks.map(item => item.id), ...project.devices.flatMap(device => [device.id, ...device.groups.flatMap(group => [group.id, ...group.services.map(service => service.id)])])]);
  let id;
  do { id = uid('custom'); } while (allIds.has(id));
  try {
    const logo = await normalizeLogoUpload(file, { id, label: base, background: 'none' });
    if (logoDialogState !== state || state.uploadToken !== token || state.project !== project || !pickerTargetExists(state)) return;
    state.upload = logo;
    $('#upload-name').value = logo.label;
    $('#upload-background').value = logo.background;
    $('.upload-preview-surface').classList.remove('preview-light', 'preview-dark');
    $('#upload-preview-image').src = logo.dataUrl;
    $('#use-upload').textContent = state.mode === 'service-add' ? 'Add to selection' : 'Use logo';
    $('#logo-browser').hidden = true;
    $('#logo-preview').hidden = false;
    $('#upload-name').focus();
  } catch (error) {
    if (logoDialogState === state && state.uploadToken === token) toast(error.message);
  } finally {
    if (logoDialogState === state && state.uploadToken === token) {
      $('#upload-logo').disabled = false;
      $('#add-selected').disabled = false;
    }
  }
});

$('#back-to-logos').addEventListener('click', () => {
  if (!logoDialogState) return;
  logoDialogState.upload = null;
  $('#logo-preview').hidden = true;
  $('#logo-browser').hidden = false;
  $('#logo-search').focus();
});

$('#upload-background').addEventListener('change', event => {
  const surface = $('.upload-preview-surface');
  surface.classList.toggle('preview-light', event.target.value === 'light');
  surface.classList.toggle('preview-dark', event.target.value === 'dark');
});

$('#use-upload').addEventListener('click', () => {
  const state = logoDialogState;
  if (!state?.upload || !pickerTargetExists(state)) return;
  const name = $('#upload-name').value.trim();
  if (!name || name.length > LIMITS.text) return $('#upload-error').textContent = 'Enter a name of 120 characters or fewer.';
  const logo = { ...state.upload, label: name, background: $('#upload-background').value };
  if (state.mode === 'service-add') {
    state.drafts.set(logo.id, logo);
    logoSelection.add(logo.id);
    state.upload = null;
    $('#logo-preview').hidden = true;
    $('#logo-browser').hidden = false;
    renderLogos();
    $('#logo-search').focus();
  } else if (project.customLogos.length >= CUSTOM_LOGO_LIMITS.count) {
    toast('Custom logo limit reached.');
  } else if (change(candidate => {
    candidate.customLogos.push(logo);
    assignPickerLogo(candidate, state, logo.id);
  })) $('#logo-dialog').close();
});

$('#logo-dialog').addEventListener('close', () => {
  const state = logoDialogState;
  const opener = state?.opener;
  logoDialogState = null;
  logoSelection = new Set();
  $('#logo-search').value = '';
  $('#logo-file').value = '';
  $('#upload-logo').disabled = false;
  $('#add-selected').disabled = false;
  $('#upload-preview-image').removeAttribute('src');
  $('#logo-browser').hidden = false;
  $('#logo-preview').hidden = true;
  if (opener?.isConnected) opener.focus();
  else if (state?.mode === 'network' && selected === state.networkId) $(`#inspector-content [data-network-logo="${state.field}"]`)?.focus();
  else if (state?.mode === 'device' && selected === state.deviceId) $('#inspector-content [data-device-logo]')?.focus();
  else if (state?.mode === 'service' && selected === state.deviceId) $(`#inspector-content [data-service="${CSS.escape(state.serviceId)}"] [data-service-logo]`)?.focus();
  else if (state?.mode === 'service-add' && selected === state.deviceId) $(`#inspector-content [data-group="${CSS.escape(state.groupId)}"] [data-add-services]`)?.focus();
});

$('#add-network').addEventListener('click', () => {
  if (project.networks.length >= LIMITS.networks) return toast('Network node limit reached.');
  $('#network-form').reset();
  $('#network-form').elements.accent.value = '#34d399';
  $('#network-dialog').showModal();
});
document.querySelectorAll('#network-dialog [data-close]').forEach(button => button.addEventListener('click', () => $('#network-dialog').close()));
$('#network-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const id = uid('net');
  if (change(candidate => { candidate.networks.push({ id, name: form.get('name'), kind: form.get('kind'), accent: form.get('accent'), icon: '', secondaryIcon: '' }); }, { select: id })) {
    inspectorOpen = true;
    $('#network-dialog').close();
  }
});

function renderConnections() {
  const endpoints = [...project.networks, ...project.devices];
  const options = endpoints.map(endpoint => `<option value="${endpoint.id}">${escapeHtml(endpoint.name)}</option>`).join('');
  $('#connection-from').innerHTML = options;
  $('#connection-to').innerHTML = options;
  $('#connection-list').innerHTML = project.connections.map(connection => `<div class="connection-row" data-connection="${connection.id}"><span>${escapeHtml(endpoints.find(item => item.id === connection.from)?.name)} → ${escapeHtml(endpoints.find(item => item.id === connection.to)?.name)}</span><input maxlength="120" value="${escapeHtml(connection.label)}" aria-label="Connection label"><button type="button" class="danger">Delete</button></div>`).join('');
}

function openConnections() {
  renderConnections();
  $('#connections-dialog').showModal();
}
$('#connection-add').addEventListener('click', () => {
  const from = $('#connection-from').value;
  const to = $('#connection-to').value;
  const label = $('#connection-label').value;
  if (project.connections.length >= LIMITS.connections) return toast('Connection limit reached.');
  if (!from || !to || from === to) return toast('Choose two different endpoints.');
  if (change(candidate => { candidate.connections.push({ id: uid('conn'), from, to, label }); })) renderConnections();
});
$('#connection-list').addEventListener('click', event => {
  const row = event.target.closest('[data-connection]');
  if (row && event.target.closest('button') && change(candidate => { candidate.connections = candidate.connections.filter(connection => connection.id !== row.dataset.connection); })) renderConnections();
});
$('#connection-list').addEventListener('change', event => {
  const row = event.target.closest('[data-connection]');
  if (row) change(candidate => { candidate.connections.find(connection => connection.id === row.dataset.connection).label = event.target.value; });
});

const HOMELAB_PORTS = '22,53,80,443,445,1883,2283,3000,5000,5055,5432,6379,6767,7878,8000,8006,8080,8081,8090,8096,8123,8443,8686,8888,8920,8989,9000,9090,9443,9696,11434,32400';

function setDiscoveryStatus(message, error = false, details = '') {
  $('#discovery-status').textContent = message;
  $('#discovery-status').classList.toggle('error', error);
  $('#discovery-error-details').hidden = !details;
  $('#discovery-error-details pre').textContent = details;
}

function setDiscoveryStep(step, focus = false) {
  $('#discovery-choose').hidden = step !== 'choose';
  $('#discovery-find').hidden = step !== 'find';
  $('#discovery-results').hidden = step !== 'review';
  $('#discovery-apply').hidden = step !== 'review';
  $('#discovery-summary').hidden = step !== 'review';
  for (const name of ['choose', 'find', 'review']) {
    const item = $(`#discovery-progress-${name}`);
    if (name === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  }
  discoveryState.step = step;
  if (focus) $(`#discovery-${step}-title`)?.focus();
}

function cancelDiscoveryWork() {
  if (!discoveryState) return;
  discoveryState.controller?.abort();
  discoveryState.requestToken = Symbol('method-changed');
  discoveryState.pendingNmapFile = null;
  discoveryState.pendingNetworkScan = null;
  discoveryState.pendingDockerSource = null;
  discoveryState.pendingAuthToken = null;
  setNetworkScanning(false);
  if (discoveryState.authRequired) showDiscoveryAuth(); else hideDiscoveryAuth();
}

function commandRow(command) {
  return `<span class="command-row"><code>${escapeHtml(command)}</code><button type="button" data-copy-command>Copy</button></span>`;
}

function setupStepContent(step) {
  const docs = 'https://aiden0rchad.github.io/homelab-atlas/discovery';
  const content = {
    'docker-location': ['Where is Docker running?', '<p>Choose the server whose containers you want to list.</p>', [['same', 'Same server as Atlas', 'Best for Atlas Compose installs.'], ['another', 'Another server', 'Use a one-time snapshot or configure a remote collector.']]],
    'docker-install': ['How did you install Atlas?', '<p>This selects the instructions and command that match your install.</p>', [['released', 'Downloaded Compose file', 'You use compose.release.yaml.'], ['source', 'Source checkout', 'You cloned the repository.'], ['native', 'Native Go', 'You run the Atlas binary directly.']]],
    'nmap-install': ['How is Atlas installed?', '<p>Nmap must be installed on the same server or container that runs Atlas.</p>', [['compose', 'Docker Compose', 'Requires a source checkout or extracted release ZIP.'], ['native', 'Native Go', 'Install Nmap on the Atlas machine.']]],
  };
  if (content[step]) {
    const [title, body, choices] = content[step];
    const key = step.endsWith('location') ? 'location' : 'install';
    return { title, body: `${body}<div class="setup-choices">${choices.map(([value, label, help]) => `<label><input type="radio" name="setup-choice" value="${value}" data-setup-answer="${key}"${discoveryState.setup.answers[key] === value ? ' checked' : ''}><span><strong>${label}</strong><small>${help}</small></span></label>`).join('')}</div>` };
  }
  const pages = {
    'docker-token': ['Prepare a collector token', `<p>This token protects the restricted collector. Run this command on the Atlas server:</p>${commandRow(SETUP_COMMANDS.token)}<p class="discovery-notice">Do not enter or paste this token into the browser.</p>`],
    'docker-env': ['Save the token in .env', `<p>Open the existing <code>.env</code> beside <code>${discoveryState.setup.answers.install === 'released' ? 'compose.release.yaml' : 'compose.yaml'}</code>. Add this line without overwriting other settings:</p>${commandRow(SETUP_COMMANDS.collectorEnv)}<p class="discovery-notice">The collector needs access to Docker. The main Atlas editor does not.</p>`],
    'docker-start-released': ['Start the collector', `<p>From that Compose folder, run only the command for the downloaded Compose file:</p>${commandRow(SETUP_COMMANDS.composeRelease)}`],
    'docker-start-source': ['Start the collector', `<p>From the source checkout, run:</p>${commandRow(SETUP_COMMANDS.composeSource)}`],
    'docker-check': ['Check your setup', '<p>Atlas will reload the configured server list. This check does not scan Docker; scanning starts only when you choose <strong>Find Docker apps</strong>.</p>'],
    'docker-native': ['Use the native or remote collector guide', `<p>A native install needs a separately configured collector. Atlas cannot grant Docker access or create that service from the browser.</p><p><a href="${docs}#remote-collectors" target="_blank" rel="noopener noreferrer">Open native and remote collector setup</a></p>`],
    'docker-snapshot': ['Import a one-time snapshot', `<p>The simplest path needs no network connection between servers. Run this restricted command on the Docker server:</p>${commandRow(SETUP_COMMANDS.snapshot)}<p>The file contains sanitized inventory for review. For ongoing live discovery, use the <a href="${docs}#remote-collectors" target="_blank" rel="noopener noreferrer">remote collector guide</a>.</p>`],
    'nmap-source': ['Use source files', '<p>The published container image is scanner-free. Use a source checkout or an extracted release ZIP; an environment flag cannot add Nmap to the published image.</p><p><a href="https://github.com/aiden0rchad/homelab-atlas/releases/latest" target="_blank" rel="noopener noreferrer">Download the current source release</a></p>'],
    'nmap-env': ['Enable the Nmap build', `<p>Open the existing <code>.env</code> in that source folder. Add this line without overwriting other settings:</p>${commandRow(SETUP_COMMANDS.nmapEnv)}`],
    'nmap-build': ['Build and start Atlas', `<p>Run this from the source checkout or extracted release folder:</p>${commandRow(SETUP_COMMANDS.nmapBuild)}`],
    'nmap-native': ['Install Nmap on the Atlas server', '<p>Use the operating-system package manager to install Nmap and its service-detection data on the machine running Atlas. Then restart Atlas.</p><p><a href="https://nmap.org/download.html" target="_blank" rel="noopener noreferrer">Official Nmap install downloads</a></p>'],
    'nmap-check': ['Check your setup', '<p>Atlas will check whether the Nmap scanner is available. It will not start a scan.</p>'],
  };
  const [title, body] = pages[step];
  return { title, body };
}

function renderDiscoverySetup(focus = true) {
  const setup = discoveryState?.setup;
  if (!setup) return;
  const steps = discoverySetupSteps(setup.method, setup.answers);
  setup.index = Math.min(setup.index, steps.length - 1);
  const step = steps[setup.index];
  const page = setupStepContent(step);
  const root = $(`#discovery-${setup.method}-setup`);
  const choice = ['docker-location', 'docker-install', 'nmap-install'].includes(step);
  const last = setup.index === steps.length - 1;
  const check = step.endsWith('-check');
  const snapshot = step === 'docker-snapshot';
  const choiceKey = step.endsWith('location') ? 'location' : 'install';
  root.innerHTML = `<div class="setup-step-head"><span>${discoverySetupProgress(setup.method, setup.answers, setup.index)}</span><h4 tabindex="-1">${page.title}</h4></div>${page.body}${setup.feedback ? `<p class="discovery-notice" role="status">${setup.feedback}</p>` : ''}<div class="setup-alternative">${setup.method === 'network' ? '<button type="button" data-setup-import="nmap">Import Nmap XML instead</button>' : ''}</div><div class="setup-nav"><button type="button" data-setup-back>${setup.index ? 'Back' : 'Back to methods'}</button>${check ? `<button type="button" class="primary" data-setup-check="${setup.method}">${setup.feedback ? 'Retry' : 'Check setup'}</button>` : snapshot ? '<button type="button" class="primary" data-setup-import="docker">Import Docker snapshot</button>' : last && step === 'docker-native' ? '' : `<button type="button" class="primary" data-setup-next${choice && !setup.answers[choiceKey] ? ' disabled' : ''}>Continue</button>`}</div>`;
  root.hidden = false;
  if (setup.method === 'docker') $('#discovery-docker-ready').hidden = true;
  else $('#discovery-network-ready').hidden = true;
  if (focus) root.querySelector('h4').focus();
}

function openDiscoverySetup(method, cancel = true) {
  if (!discoveryState || discoveryState.step === 'review') return;
  if (cancel) cancelDiscoveryWork();
  discoveryState.setup = { method, answers: {}, index: 0 };
  renderDiscoverySetup();
  setDiscoveryStatus('');
}

function closeDiscoverySetup() {
  const setup = discoveryState?.setup;
  if (!setup) return;
  $(`#discovery-${setup.method}-setup`).hidden = true;
  discoveryState.setup = null;
  if (setup.method === 'docker' && discoveryState.sources.length) $('#discovery-docker-ready').hidden = false;
  else showDiscoveryChooser();
}

function showDockerError(message, retry) {
  discoveryState.dockerRetry = retry;
  $('#discovery-docker-error span').textContent = message;
  $('#discovery-retry-docker').textContent = retry === 'scan' ? 'Retry scan' : 'Retry check';
  $('#discovery-docker-error').setAttribute('role', 'status');
  $('#discovery-docker-error').setAttribute('aria-live', 'polite');
  $('#discovery-docker-error').hidden = false;
}

function chooseDiscoveryMethod(method, focus = true) {
  if (!discoveryState) return;
  cancelDiscoveryWork();
  discoveryState.method = method;
  discoveryState.bundle = null;
  discoveryState.snapshot = null;
  discoveryState.plan = null;
  discoveryState.reviewCache.clear();
  discoveryState.setup = null;
  $('#discovery-docker-setup').hidden = true;
  $('#discovery-network-setup').hidden = true;
  $('#discovery-docker-ready').hidden = !discoveryState.sources.length;
  $('#discovery-network-ready').hidden = !discoveryState.nmapStatus?.available;
  for (const name of ['docker', 'network', 'import']) $(`#discovery-${name}-panel`).hidden = name !== method;
  const titles = { docker: 'Find Docker apps', network: 'Find network devices with Nmap', import: 'Import saved scan' };
  $('#discovery-find-title').textContent = titles[method];
  setDiscoveryStep('find', focus);
  if (method === 'docker' && shouldOpenDockerSetup(discoveryState.dockerSourcesStatus, discoveryState.sources)) openDiscoverySetup('docker');
  if (method === 'network' && discoveryState.nmapStatus && !discoveryState.nmapStatus.available) openDiscoverySetup('network');
  if (discoveryState.authRequired) showDiscoveryAuth();
  else if (method === 'docker' && ['unknown', 'loading'].includes(discoveryState.dockerSourcesStatus)) setDiscoveryStatus('Checking Docker setup…');
  else setDiscoveryStatus('');
}

function showDiscoveryChooser() {
  cancelDiscoveryWork();
  discoveryState.method = null;
  discoveryState.bundle = null;
  discoveryState.snapshot = null;
  discoveryState.reviewCache.clear();
  setDiscoveryStep('choose', true);
  if (discoveryState.authRequired) showDiscoveryAuth(); else setDiscoveryStatus('');
}

function invalidateDiscoveryIfStale() {
  if (!discoveryState || !$('#discovery-dialog').open || projectGuardCurrent(discoveryState.guard, project)) return;
  if (discoveryState.applying) return;
  discoveryState.controller?.abort();
  discoveryState.requestToken = Symbol('stale-project');
  discoveryState.pendingNmapFile = null;
  discoveryState.pendingNetworkScan = null;
  discoveryState.pendingAuthToken = null;
  setNetworkScanning(false);
  discoveryState.stale = true;
  discoveryState.reviewCache.clear();
  discoveryState.plan = null;
  $('#discovery-apply').disabled = true;
  setDiscoveryStatus('The project changed. Close this review and open discovery again.', true);
}

async function discoveryFetch(url, options = {}, token = apiToken) {
  const headers = new Headers(options.headers || {});
  headers.set('X-Atlas-Request', '1');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

async function boundedResponseJSON(response) {
  const declared = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > 2_000_000) throw new Error('The discovery response is larger than 2 MB.');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) { await reader.cancel(); throw new Error('The discovery response is larger than 2 MB.'); }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new Error('The server returned invalid discovery data.'); }
}

function beginDiscoveryRequest(message, clearResults = false) {
  discoveryState.controller?.abort();
  setNetworkScanning(false);
  const token = Symbol('discovery-request');
  const controller = new AbortController();
  discoveryState.requestToken = token;
  discoveryState.controller = controller;
  if (clearResults) {
    discoveryState.bundle = null;
    discoveryState.pendingNmapFile = null;
    discoveryState.pendingNetworkScan = null;
    discoveryState.pendingDockerSource = null;
    discoveryState.pendingAuthToken = null;
    discoveryState.statusBeforeAuth = null;
    discoveryState.plan = null;
    discoveryState.snapshot = null;
    discoveryState.choices = new Map();
    discoveryState.query = '';
    discoveryState.page = 0;
    $('#discovery-results').hidden = true;
    $('#discovery-apply').disabled = true;
    $('#discovery-findings').replaceChildren();
    $('#discovery-summary').textContent = '';
    $('#discovery-search').value = '';
    $('#discovery-range').textContent = '';
    $('#discovery-host').replaceChildren();
    $('#discovery-host-navigation').hidden = true;
    $('#discovery-host-meta').hidden = true;
    $('#discovery-host-meta').textContent = '';
  }
  setDiscoveryStatus(message);
  return { state: discoveryState, token, controller };
}

function discoveryRequestCurrent(request) {
  return discoveryState === request.state && request.state.requestToken === request.token
    && projectGuardCurrent(request.state.guard, project) && $('#discovery-dialog').open;
}

function hideDiscoveryAuth(clear = true) {
  $('#discovery-auth').hidden = true;
  if (clear) $('#discovery-api-token').value = '';
}

function showDiscoveryAuth(focus = false) {
  $('#discovery-source').disabled = true;
  $('#discovery-scan').disabled = true;
  $('#discovery-network-start').disabled = true;
  $('#discovery-auth').hidden = false;
  setDiscoveryStatus('Access token required. Enter the Atlas server token and choose Unlock.', true);
  if (focus) $('#discovery-api-token').focus();
}

function requestDiscoveryUnlock(request) {
  if (!discoveryRequestCurrent(request)) return;
  discoveryState.authRequired = true;
  if (discoveryState.snapshot && discoveryState.statusBeforeAuth === null) discoveryState.statusBeforeAuth = $('#discovery-status').textContent;
  if (!discoveryState.unlocking) $('#discovery-unlock').disabled = false;
  showDiscoveryAuth(true);
}

function setNetworkScanning(active, request = null) {
  if (!discoveryState) return;
  if (active) {
    if (!request || !discoveryRequestCurrent(request)) return;
    discoveryState.activeNetworkToken = request.token;
  } else if (request) {
    if (discoveryState !== request.state || discoveryState.activeNetworkToken !== request.token) return;
    discoveryState.activeNetworkToken = null;
  } else {
    discoveryState.activeNetworkToken = null;
  }
  $('#discovery-network-start').hidden = active;
  $('#discovery-network-stop').hidden = !active;
  for (const id of ['discovery-targets', 'discovery-port-preset', 'discovery-ports', 'discovery-detect-services']) $(`#${id}`).disabled = active;
  $('#discovery-network-start').textContent = active ? 'Finding devices…' : 'Find devices';
  if (!active) $('#discovery-network-start').disabled = !discoveryState.nmapStatus?.available || !$('#discovery-targets').value.trim();
}

function metadataRequestCurrent(request, field) {
  return discoveryState === request.state && $('#discovery-dialog').open
    && request.state[field] === request.controller && apiToken === request.apiToken;
}

async function boundedResponseText(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  while (size <= 1000) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
  }
  if (size > 1000) await reader.cancel();
  const bytes = new Uint8Array(Math.min(size, 1000)); let offset = 0;
  for (const chunk of chunks) { const part = chunk.subarray(0, bytes.length - offset); bytes.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(bytes).trim();
}

async function loadNmapStatus(expectedState = discoveryState) {
  if (!expectedState || discoveryState !== expectedState) return false;
  expectedState.statusController?.abort();
  const state = expectedState;
  const controller = new AbortController();
  state.statusController = controller;
  const request = { state, controller, apiToken, actionToken: state.requestToken };
  $('#discovery-network-badge').textContent = 'Checking';
  $('#discovery-network-ready').hidden = true;
  if (!state.setup) $('#discovery-network-setup').hidden = true;
  $('#discovery-network-error').hidden = true;
  try {
    const response = await discoveryFetch('/api/discovery/nmap/status', { signal: controller.signal }, request.apiToken);
    if (response.status === 401) {
      if (metadataRequestCurrent(request, 'statusController')) {
        state.pendingAuthToken = state.requestToken;
        requestDiscoveryUnlock({ state, token: state.requestToken, controller: state.controller });
      }
      return false;
    }
    if (response.status === 403) throw new Error('Discovery access is blocked. Add this browser hostname or IP to ATLAS_ALLOWED_HOSTS.');
    if (!response.ok) throw new Error(`Nmap status could not be loaded (${response.status}).`);
    const value = await boundedResponseJSON(response);
    if (!value || Object.keys(value).length !== 4 || typeof value.available !== 'boolean' || !Array.isArray(value.allowedCidrs)
      || value.allowedCidrs.some(item => typeof item !== 'string') || value.maxHosts !== 256 || value.timeoutSeconds !== 120) throw new Error('The server returned invalid Nmap status.');
    if (!metadataRequestCurrent(request, 'statusController')) return false;
    state.nmapStatus = value;
    $('#discovery-network-start').disabled = !value.available || !$('#discovery-targets').value.trim();
    $('#discovery-network-badge').textContent = value.available ? 'Ready' : 'Setup needed';
    $('#discovery-network-ready').hidden = !value.available;
    $('#discovery-network-error').hidden = true;
    $('#discovery-network-help').textContent = value.available
      ? `Runs from this Atlas server. Allowed ranges: ${value.allowedCidrs.join(', ')}. Up to ${value.maxHosts} hosts and ${value.timeoutSeconds} seconds; firewalls may hide hosts.`
      : `Nmap is not installed on this Atlas server. XML import and Docker discovery are still available. Allowed ranges: ${value.allowedCidrs.join(', ')}.`;
    if (!value.available && state.method === 'network' && state.step === 'find') {
      if (state.setup?.method === 'network') {
        const steps = discoverySetupSteps('network', state.setup.answers);
        if (steps[state.setup.index] === 'nmap-check') state.setup.feedback = 'Nmap is still unavailable. Check the build or installation, restart Atlas, then try again.';
        renderDiscoverySetup(false);
      } else openDiscoverySetup('network', false);
    }
    if (value.available && state.setup?.method === 'network' && state.step === 'find') {
      state.setup = null;
      $('#discovery-network-setup').hidden = true;
    }
    return true;
  } catch (error) {
    if (error.name === 'AbortError' || !metadataRequestCurrent(request, 'statusController')) return false;
    $('#discovery-network-start').disabled = true;
    $('#discovery-network-badge').textContent = 'Check failed';
    $('#discovery-network-help').textContent = error.message;
    $('#discovery-network-ready').hidden = true;
    $('#discovery-network-setup').hidden = true;
    $('#discovery-network-error span').textContent = error.message;
    $('#discovery-network-error').hidden = false;
    return false;
  } finally {
    if (metadataRequestCurrent(request, 'statusController')) state.statusController = null;
  }
}

function fillDiscoverySources(sources, updateStatus = true) {
  const select = $('#discovery-source');
  const selectedSource = select.value;
  select.replaceChildren();
  if (!sources.length) {
    select.add(new Option('No configured collectors', ''));
    select.disabled = true;
    $('#discovery-scan').disabled = true;
    $('#discovery-docker-badge').textContent = 'Setup needed';
    $('#discovery-docker-ready').hidden = true;
    $('#discovery-docker-error').hidden = true;
    if (discoveryState?.method === 'docker' && discoveryState.step === 'find') {
      if (discoveryState.setup?.method === 'docker') {
        const steps = discoverySetupSteps('docker', discoveryState.setup.answers);
        if (steps[discoveryState.setup.index] === 'docker-check') discoveryState.setup.feedback = 'No Docker server is configured yet. Check the collector command and token, then try again.';
        renderDiscoverySetup(false);
      } else openDiscoverySetup('docker', false);
    } else $('#discovery-docker-setup').hidden = true;
    if (updateStatus && discoveryState?.method === 'docker') setDiscoveryStatus(discoveryState.setup?.feedback ? '' : 'Connect a Docker server, then check setup.');
    return;
  }
  select.add(new Option('Choose a server…', ''));
  for (const source of sources) select.add(new Option(source.name, source.id));
  if (sources.some(source => source.id === selectedSource)) select.value = selectedSource;
  else if (sources.length === 1) select.value = sources[0].id;
  select.disabled = false;
  $('#discovery-scan').disabled = !select.value;
  $('#discovery-docker-badge').textContent = 'Configured';
  $('#discovery-docker-ready').hidden = false;
  if (discoveryState?.setup?.method === 'docker' && discoveryState.step === 'find') discoveryState.setup = null;
  $('#discovery-docker-setup').hidden = true;
  $('#discovery-docker-error').hidden = true;
  discoveryState.dockerRetry = null;
  if (updateStatus && discoveryState?.method === 'docker') setDiscoveryStatus(sources.length === 1 ? `${sources[0].name} is configured.` : 'Choose a Docker server.');
}

async function loadDiscoverySources(preserveStatus = false, expectedState = discoveryState) {
  if (!expectedState || discoveryState !== expectedState) return false;
  expectedState.sourcesController?.abort();
  const state = expectedState;
  state.dockerSourcesStatus = 'loading';
  const controller = new AbortController();
  state.sourcesController = controller;
  const request = { state, controller, apiToken, actionToken: state.requestToken };
  if (!preserveStatus && expectedState.method === 'docker') setDiscoveryStatus('Checking Docker hosts…');
  $('#discovery-docker-badge').textContent = 'Checking';
  const hadSources = state.sources.length > 0;
  $('#discovery-docker-ready').hidden = !hadSources;
  if (!state.setup) $('#discovery-docker-setup').hidden = true;
  $('#discovery-docker-error').hidden = true;
  $('#discovery-source').disabled = true;
  $('#discovery-scan').disabled = true;
  try {
    const response = await discoveryFetch('/api/discovery/sources', { signal: controller.signal }, request.apiToken);
    if (response.status === 401) {
      if (metadataRequestCurrent(request, 'sourcesController')) {
        state.dockerSourcesStatus = 'error';
        state.pendingAuthToken = state.requestToken;
        requestDiscoveryUnlock({ state, token: state.requestToken, controller: state.controller });
      }
      return false;
    }
    if (response.status === 403) throw new Error('Discovery access is blocked. Add this browser hostname or IP to ATLAS_ALLOWED_HOSTS.');
    if (!response.ok) throw new Error(`Collectors could not be loaded (${response.status}).`);
    const sources = await boundedResponseJSON(response);
    if (!Array.isArray(sources) || sources.length > 16 || sources.some(source => !source || Object.keys(source).length !== 2 || typeof source.id !== 'string' || typeof source.name !== 'string')) throw new Error('The server returned an invalid collector list.');
    if (!metadataRequestCurrent(request, 'sourcesController')) return false;
    state.dockerSourcesStatus = 'loaded';
    state.sources = sources;
    fillDiscoverySources(sources, !preserveStatus && state.requestToken === request.actionToken);
    return true;
  } catch (error) {
    if (error.name === 'AbortError' || !metadataRequestCurrent(request, 'sourcesController')) return false;
    state.dockerSourcesStatus = 'error';
    if (state.sources.length) fillDiscoverySources(state.sources, false);
    else {
      $('#discovery-source').replaceChildren(new Option('No configured servers loaded', ''));
      $('#discovery-source').disabled = true;
      $('#discovery-scan').disabled = true;
    }
    $('#discovery-docker-badge').textContent = 'Check failed';
    $('#discovery-docker-ready').hidden = !state.sources.length;
    showDockerError(error.message, 'sources');
    if (!preserveStatus && state.requestToken === request.actionToken && state.method === 'docker' && state.step === 'find' && !state.authRequired) setDiscoveryStatus('');
    return false;
  } finally {
    if (metadataRequestCurrent(request, 'sourcesController')) state.sourcesController = null;
  }
}

async function refreshDiscoveryMetadata(state) {
  if (!state || discoveryState !== state || !$('#discovery-dialog').open) return false;
  const results = await Promise.all([loadDiscoverySources(true, state), loadNmapStatus(state)]);
  return results.every(Boolean);
}

function discoveryDestination() {
  const value = $('#discovery-device').value;
  return value && value !== '__new' ? project.devices.find(device => device.id === value) : null;
}

function updateDiscoveryDestination(resetActions = false, preferredGroup = '') {
  if (!discoveryState?.snapshot) return;
  const deviceValue = $('#discovery-device').value;
  const newDevice = deviceValue === '__new';
  const device = discoveryDestination();
  $('#discovery-new-device-field').hidden = !newDevice;
  $('#discovery-group-field').hidden = false;
  const group = $('#discovery-group');
  if (device) {
    group.replaceChildren(new Option('New group · Discovered services', '__new'));
    for (const item of device.groups) group.add(new Option(item.name, item.id));
    const suggested = suggestDiscoveryGroup(device);
    group.value = [...group.options].some(option => option.value === preferredGroup) ? preferredGroup : (suggested || '__new');
  } else {
    group.replaceChildren(new Option('New group · Discovered services', '__new'));
  }
  $('#discovery-new-group-field').hidden = !(newDevice || group.value === '__new');
  $('#discovery-group-description').textContent = group.selectedOptions[0]?.textContent ? `· ${group.selectedOptions[0].textContent}` : '';
  if (resetActions) for (const choice of discoveryState.choices.values()) {
    choice.selected = false;
    choice.serviceId = undefined;
  }
  renderDiscoveryFindings();
}

function renderDiscoveryFindings() {
  if (!discoveryState?.snapshot) return;
  const root = $('#discovery-findings');
  const device = discoveryDestination();
  const newDevice = $('#discovery-device').value === '__new';
  const services = device ? device.groups.flatMap(group => group.services.map(service => ({
    id: service.id, label: `Link · ${group.name} · ${service.name}`,
  }))) : [];
  const serviceLabels = new Map(services.map(service => [service.id, service.label]));
  const filtered = filterDiscoveryFindings(discoveryState.snapshot.findings, discoveryState.query);
  const pages = Math.max(1, Math.ceil(filtered.length / DISCOVERY_PAGE_SIZE));
  discoveryState.page = Math.min(discoveryState.page, pages - 1);
  const start = discoveryState.page * DISCOVERY_PAGE_SIZE;
  const visible = filtered.slice(start, start + DISCOVERY_PAGE_SIZE);
  $('#discovery-range').textContent = filtered.length ? `${start + 1}–${start + visible.length} of ${filtered.length}` : '0 of 0';
  $('#discovery-previous').disabled = discoveryState.page === 0;
  $('#discovery-next').disabled = start + visible.length >= filtered.length;
  root.replaceChildren(...visible.map(item => {
    const binding = discoveryBinding(project, discoveryState.snapshot.source.id, item.key);
    const choice = discoveryState.choices.get(item.key);
    const hostFinding = item.kind === 'host';
    if (choice.serviceId === undefined) choice.serviceId = hostFinding ? null : device ? suggestDiscoveryService(item, device) : null;
    if (newDevice) choice.serviceId = null;
    if (binding) choice.selected = false;
    const row = document.createElement('article');
    row.className = `discovery-finding${item.stopped ? ' has-stopped' : ''}${binding ? ' bound' : ''}`;
    const checkLabel = document.createElement('label');
    checkLabel.className = 'discovery-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = choice.selected;
    checkbox.disabled = Boolean(binding);
    checkbox.setAttribute('aria-label', `Select ${item.name}`);
    checkbox.addEventListener('change', () => { choice.selected = checkbox.checked; updateDiscoveryPlan(); });
    checkLabel.append(checkbox);
    const logoId = matchDiscoveryLogo(item);
    const logo = document.createElement('img');
    logo.className = `discovery-logo ${logoPlateClass(logoId)}`;
    logo.src = logoSource(logoId);
    logo.alt = '';
    checkLabel.append(logo);
    const identity = document.createElement('div');
    identity.className = 'discovery-identity';
    const heading = document.createElement('strong');
    heading.textContent = item.name;
    const nmapEndpoint = !hostFinding && discoveryState.snapshot.format === 'homelab-atlas.nmap-discovery';
    const detail = document.createElement('span');
    detail.textContent = hostFinding ? 'Device card' : nmapEndpoint
      ? `${item.protocol.toUpperCase()} port ${item.port}${item.service ? ` · ${item.service}` : ' · unidentified'}`
      : `${item.running} running · ${item.stopped} stopped${item.ports.length ? ` · ${item.ports.slice(0, 2).join(', ')}` : ''}`;
    const status = document.createElement('small');
    status.textContent = hostFinding ? 'Adds or links this device card' : item.count ? `${item.count} ${item.count === 1 ? 'container' : 'containers'}` : [item.product, item.version, item.tunnel].filter(Boolean).join(' · ') || 'Unknown service';
    identity.append(heading, detail);
    if (!nmapEndpoint) identity.append(status);
    const action = document.createElement('div');
    action.className = 'discovery-target';
    const actionLabel = document.createElement('span');
    actionLabel.textContent = binding ? `Already on diagram · ${discoveryBindingLabel(project, binding)}`
      : choice.serviceId && serviceLabels.has(choice.serviceId) ? `Use existing ${serviceLabels.get(choice.serviceId).replace(/^Link · [^·]+ · /, '')}`
      : hostFinding ? (device ? `Use device card ${device.name}` : 'Add a new device card') : 'Add as a new service';
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Action for ${item.name}`);
    select.add(new Option(hostFinding ? (device ? 'Link host to this card' : 'Add host card') : 'Add new service', '__add'));
    if (choice.serviceId && serviceLabels.has(choice.serviceId)) select.add(new Option(serviceLabels.get(choice.serviceId), choice.serviceId));
    select.value = choice.serviceId || '__add';
    select.hidden = hostFinding || Boolean(binding) || newDevice || !device;
    const populateOptions = () => {
      if (select.dataset.populated || select.disabled) return;
      const selected = select.value;
      select.replaceChildren(new Option('Add new service', '__add'));
      for (const service of services) select.add(new Option(service.label, service.id));
      select.value = selected;
      select.dataset.populated = 'true';
    };
    select.addEventListener('focus', populateOptions);
    select.addEventListener('pointerdown', populateOptions);
    select.addEventListener('change', () => { choice.serviceId = select.value === '__add' ? null : select.value; renderDiscoveryFindings(); });
    if (!select.hidden) {
      const change = document.createElement('button');
      change.type = 'button';
      change.textContent = 'Change';
      change.setAttribute('aria-label', `Change target for ${item.name}`);
      change.addEventListener('click', () => { populateOptions(); select.hidden = false; select.focus(); change.hidden = true; });
      select.hidden = true;
      action.append(actionLabel, change, select);
    } else action.append(actionLabel);
    checkLabel.append(identity);
    const technical = document.createElement('details');
    technical.className = 'discovery-technical';
    const technicalSummary = document.createElement('summary');
    technicalSummary.textContent = 'Technical details';
    const technicalText = document.createElement('p');
    technicalText.textContent = hostFinding ? discoveryState.snapshot.host?.addresses.join(', ') || 'No address details'
      : nmapEndpoint ? [item.product, item.version, item.tunnel].filter(Boolean).join(' · ') || 'No additional detection metadata'
      : [item.image || 'Image name unavailable', item.composeProject, item.composeService].filter(Boolean).join(' · ');
    technical.append(technicalSummary, technicalText);
    row.append(checkLabel, action, technical);
    return row;
  }));
  updateDiscoveryPlan();
}

function updateDiscoveryPlan() {
  if (!discoveryState?.snapshot) return;
  discoveryState.plan = null;
  $('#discovery-apply').disabled = true;
  const summary = $('#discovery-summary');
  summary.classList.remove('error');
  if (discoveryState.stale || !projectGuardCurrent(discoveryState.guard, project)) return invalidateDiscoveryIfStale();
  const choices = [...discoveryState.choices.entries()].filter(([, choice]) => choice.selected).map(([key, choice]) => ({ key, serviceId: choice.serviceId ?? null }));
  if (!choices.length) {
    summary.textContent = `0 selected. Choose what to add; existing card positions will be kept.`;
    return;
  }
  const deviceValue = $('#discovery-device').value;
  if (!deviceValue) {
    summary.textContent = 'Choose a destination device.';
    return;
  }
  const serviceAdditions = choices.some(choice => choice.serviceId === null && !choice.key.startsWith('nmap-host:'));
  const groupValue = $('#discovery-group').value;
  if (deviceValue !== '__new' && serviceAdditions && !groupValue) {
    summary.textContent = 'Choose an existing service group or a new group.';
    return;
  }
  try {
    const plan = planDiscoveryMerge(project, discoveryState.snapshot, {
      deviceId: deviceValue === '__new' ? null : deviceValue,
      newDeviceName: $('#discovery-new-device').value,
      groupId: groupValue === '__new' || deviceValue === '__new' ? null : groupValue,
      newGroupName: $('#discovery-new-group').value,
      choices,
    });
    discoveryState.plan = plan;
    const destination = deviceValue === '__new' ? $('#discovery-new-device').value.trim() || discoveryState.snapshot.source.name : discoveryDestination().name;
    const parts = [`${choices.length} selected across all pages`, `${quantity(plan.summary.added, 'service')} to add`, `${quantity(plan.summary.linked, 'service')} to link`, `destination: ${destination}`];
    if (plan.summary.hosts) parts.push(quantity(plan.summary.hosts, 'device card'));
    if (plan.summary.newDevice) parts.push(`new device “${plan.project.devices.at(-1).name}”`);
    if (plan.summary.newGroup) parts.push('new service group');
    if (plan.summary.heightChanges.length) parts.push('the destination card will grow; its position stays fixed');
    summary.textContent = parts.join(' · ');
    $('#discovery-apply').disabled = false;
  } catch (error) {
    summary.textContent = error.message;
    summary.classList.add('error');
  }
}

function saveDiscoveryReview() {
  if (!discoveryState?.snapshot) return;
  discoveryState.reviewCache.set(discoveryState.snapshot.source.id, {
    choices: structuredClone(discoveryState.choices), query: discoveryState.query, page: discoveryState.page,
    device: $('#discovery-device').value, deviceName: $('#discovery-new-device').value,
    group: $('#discovery-group').value, groupName: $('#discovery-new-group').value,
  });
}

function showDiscoverySnapshot(value, message, restore = true) {
  validateDiscoverySnapshot(value);
  if (restore) saveDiscoveryReview();
  if (!value.findings.length) {
    setDiscoveryStep('find', true);
    setDiscoveryStatus('No Docker apps were found. Check the selected host or snapshot, then try again.', true);
    return;
  }
  discoveryState.snapshot = structuredClone(value);
  const cached = restore ? discoveryState.reviewCache.get(value.source.id) : null;
  discoveryState.choices = cached?.choices || new Map(value.findings.map(item => [item.key, { selected: false, serviceId: undefined }]));
  discoveryState.plan = null;
  discoveryState.query = cached?.query || '';
  discoveryState.page = cached?.page || 0;
  $('#discovery-search').value = discoveryState.query;
  setDiscoveryStep('review', true);
  const nmap = value.format === 'homelab-atlas.nmap-discovery';
  $('#discovery-result-source').textContent = nmap && discoveryState.bundle ? `${discoveryState.bundle.scope} · ${value.source.name}` : value.source.name;
  $('#discovery-result-time').textContent = `Scanned ${new Date(value.scannedAt).toLocaleString()}`;
  const multiple = nmap && discoveryState.bundle?.snapshots.length > 1;
  $('#discovery-host-navigation').hidden = !multiple;
  if (multiple) {
    const index = discoveryState.bundle.snapshots.findIndex(snapshot => snapshot.source.id === value.source.id);
    $('#discovery-host').value = String(index);
    $('#discovery-host-count').textContent = `${index + 1} of ${discoveryState.bundle.snapshots.length}`;
    $('#discovery-host-previous').disabled = index === 0;
    $('#discovery-host-next').disabled = index === discoveryState.bundle.snapshots.length - 1;
  }
  $('#discovery-host-meta').hidden = !nmap;
  $('#discovery-host-meta').textContent = nmap ? [`Addresses: ${value.host.addresses.join(', ')}`, value.host.hostnames.length ? `Names: ${value.host.hostnames.join(', ')}` : '', value.host.vendor ? `Vendor: ${value.host.vendor}` : ''].filter(Boolean).join(' · ') : '';
  const device = $('#discovery-device');
  device.replaceChildren(new Option(`New device card · ${value.source.name}`, '__new'));
  for (const item of project.devices) device.add(new Option(item.name, item.id));
  const suggested = suggestDiscoveryDestination(project, value);
  device.value = cached?.device && [...device.options].some(option => option.value === cached.device) ? cached.device : (suggested || '__new');
  $('#discovery-new-device').value = cached?.deviceName || value.source.name;
  $('#discovery-new-group').value = cached?.groupName || 'Discovered services';
  updateDiscoveryDestination(false, cached?.group);
  setDiscoveryStatus(message);
}

async function scanDiscoverySource() {
  if (!discoveryState || !projectGuardCurrent(discoveryState.guard, project)) return invalidateDiscoveryIfStale();
  const sourceId = $('#discovery-source').value;
  if (!sourceId) return setDiscoveryStatus('Choose a collector first.', true);
  const request = beginDiscoveryRequest('Scanning Docker…', true);
  try {
    const response = await discoveryFetch('/api/discovery/scan', {
      method: 'POST', signal: request.controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId }),
    });
    if (response.status === 401) {
      if (!discoveryRequestCurrent(request)) return;
      request.state.pendingDockerSource = sourceId;
      request.state.pendingAuthToken = request.token;
      return requestDiscoveryUnlock(request);
    }
    if (!response.ok) {
      const detail = await boundedResponseText(response);
      if (response.status === 403) throw new Error('This browser address is not allowed by the Atlas server. Check ATLAS_ALLOWED_HOSTS.');
      if (response.status === 502) throw new Error(`The Docker collector could not be reached.${detail ? ` ${detail}` : ''}`);
      if ([408, 504].includes(response.status)) throw new Error('The Docker collector timed out. Check its connection and try again.');
      throw new Error(`Docker discovery failed (${response.status}).${detail ? ` ${detail}` : ''}`);
    }
    const value = await boundedResponseJSON(response);
    validateDiscoverySnapshot(value);
    if (value.source.id !== sourceId) throw new Error('The collector returned a different source identity.');
    if (!discoveryRequestCurrent(request)) return;
    discoveryState.reviewCache.clear();
    showDiscoverySnapshot(value, `Scan complete: ${quantity(value.findings.length, 'finding')}.`, false);
    return true;
  } catch (error) {
    if (error.name === 'AbortError' || !discoveryRequestCurrent(request)) return;
    if (/collector|Docker host/i.test(error.message)) {
      $('#discovery-docker-badge').textContent = 'Check failed';
      $('#discovery-docker-ready').hidden = false;
      showDockerError(error.message, 'scan');
      setDiscoveryStatus('');
    } else setDiscoveryStatus(error.message, true);
    return false;
  }
}

function showNmapBundle(bundle, label) {
  validateNmapBundle(bundle);
  discoveryState.reviewCache.clear();
  discoveryState.bundle = structuredClone(bundle);
  const hostSelect = $('#discovery-host');
  hostSelect.replaceChildren(...bundle.snapshots.map((snapshot, index) => new Option(`${snapshot.source.name} · ${snapshot.host.addresses.join(', ')}`, String(index))));
  if (!bundle.snapshots.length) {
    setDiscoveryStep('find');
    setDiscoveryStatus('No reachable devices were found. Check the address, route, and firewall, then try again.', true,
      `${label}: ${quantity(bundle.skippedHosts, 'host')} and ${quantity(bundle.skippedPorts, 'port')} were not imported.`);
    return;
  }
  showDiscoverySnapshot(bundle.snapshots[0], `${label}: ${quantity(bundle.snapshots.length, 'host')}. ${quantity(bundle.skippedHosts, 'host')} and ${quantity(bundle.skippedPorts, 'port')} were not imported.`, false);
}

function currentNetworkRequest() {
  const preset = $('#discovery-port-preset').value;
  return {
    scope: $('#discovery-scope').value,
    targets: $('#discovery-targets').value,
    ports: preset === 'homelab' ? HOMELAB_PORTS : preset === 'common' ? '' : $('#discovery-ports').value,
    detectServices: $('#discovery-detect-services').checked,
  };
}

async function scanNmapNetwork(retry = null) {
  if (!discoveryState || !projectGuardCurrent(discoveryState.guard, project)) {
    invalidateDiscoveryIfStale();
    return false;
  }
  const input = retry || currentNetworkRequest();
  if (!input.targets.trim()) {
    $('#discovery-targets').setAttribute('aria-invalid', 'true');
    $('#discovery-targets').focus();
    setDiscoveryStatus('Enter a device IP address or network range.', true);
    return false;
  }
  const request = beginDiscoveryRequest('Finding devices… This can take up to two minutes.', true);
  request.input = structuredClone(input);
  setNetworkScanning(true, request);
  try {
    const response = await discoveryFetch('/api/discovery/nmap/scan', {
      method: 'POST', signal: request.controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    if (response.status === 401) {
      if (!discoveryRequestCurrent(request)) return false;
      request.state.pendingNetworkScan = structuredClone(input);
      request.state.pendingAuthToken = request.token;
      setNetworkScanning(false, request);
      requestDiscoveryUnlock(request);
      return false;
    }
    if (!response.ok) throw new Error((await boundedResponseText(response)) || `Network scan failed (${response.status}).`);
    const bundle = await boundedResponseJSON(response);
    validateNmapBundle(bundle);
    if (!discoveryRequestCurrent(request)) return;
    hideDiscoveryAuth();
    discoveryState.pendingNetworkScan = null;
    showNmapBundle(bundle, 'Network scan complete');
    return true;
  } catch (error) {
    if (error.name === 'AbortError' || !discoveryRequestCurrent(request)) return false;
    setDiscoveryStatus(error.message, true);
    return false;
  } finally {
    setNetworkScanning(false, request);
  }
}

async function importNmapXML(file) {
  if (!file || !discoveryState || !projectGuardCurrent(discoveryState.guard, project)) return false;
  const scope = $('#discovery-import-scope').value;
  const request = beginDiscoveryRequest('Parsing Nmap XML…', true);
  discoveryState.pendingNmapFile = file;
  try {
    if (file.size > 2_000_000) throw new Error('Nmap XML is larger than 2 MB.');
    const response = await discoveryFetch(`/api/discovery/nmap?scope=${encodeURIComponent(scope)}`, {
      method: 'POST', signal: request.controller.signal, headers: { 'Content-Type': 'application/xml' }, body: file,
    });
    if (response.status === 401) {
      if (!discoveryRequestCurrent(request)) return false;
      request.state.pendingAuthToken = request.token;
      requestDiscoveryUnlock(request);
      return false;
    }
    if (!response.ok) throw new Error(`Nmap import failed (${response.status}). Check the XML and network name.`);
    const bundle = await boundedResponseJSON(response);
    if (!discoveryRequestCurrent(request)) return;
    hideDiscoveryAuth();
    discoveryState.pendingNmapFile = null;
    showNmapBundle(bundle, 'Nmap import loaded');
    return true;
  } catch (error) {
    if (error.name === 'AbortError' || !discoveryRequestCurrent(request)) return false;
    discoveryState.pendingNmapFile = null;
    setDiscoveryStatus(error.message, true);
    return false;
  }
}

async function importDiscoverySnapshot(file) {
  if (!file || !discoveryState || !projectGuardCurrent(discoveryState.guard, project)) return;
  const request = beginDiscoveryRequest('Reading snapshot…', true);
  try {
    if (file.size > 2_000_000) throw new Error('Snapshot is larger than 2 MB.');
    const value = parseDiscoverySnapshot(await file.text());
    if (!discoveryRequestCurrent(request)) return;
    discoveryState.reviewCache.clear();
    showDiscoverySnapshot(value, `Snapshot loaded: ${quantity(value.findings.length, 'finding')}.`, false);
  } catch (error) {
    if (error.name === 'AbortError' || !discoveryRequestCurrent(request)) return;
    setDiscoveryStatus(error.message, true);
  }
}

function openDiscovery(opener) {
  discoveryState?.controller?.abort();
  discoveryState?.sourcesController?.abort();
  discoveryState?.statusController?.abort();
  discoveryState = { guard: captureProjectGuard(project), opener, step: 'choose', method: null, sources: [], dockerSourcesStatus: 'unknown', nmapStatus: null, setup: null, dockerRetry: null, bundle: null, reviewCache: new Map(), pendingDockerSource: null, pendingNmapFile: null, pendingNetworkScan: null, pendingAuthToken: null, statusBeforeAuth: null, snapshot: null, choices: new Map(), plan: null, controller: null, sourcesController: null, statusController: null, activeNetworkToken: null, requestToken: null, stale: false, applying: false, authRequired: false, query: '', page: 0 };
  $('#discovery-source').replaceChildren(new Option('Loading sources…', ''));
  $('#discovery-device').replaceChildren(new Option('Choose a device…', ''));
  $('#discovery-findings').replaceChildren();
  $('#discovery-summary').textContent = '';
  $('#discovery-search').value = '';
  hideDiscoveryAuth();
  $('#discovery-range').textContent = '';
  $('#discovery-previous').disabled = true;
  $('#discovery-next').disabled = true;
  $('#discovery-apply').disabled = true;
  $('#discovery-file').value = '';
  $('#discovery-nmap-file').value = '';
  $('#discovery-host-navigation').hidden = true;
  $('#discovery-network-start').disabled = true;
  $('#discovery-port-preset').value = 'homelab';
  $('#discovery-ports').value = '';
  $('#discovery-custom-ports').hidden = true;
  $('#discovery-detect-services').checked = true;
  $('#discovery-docker-badge').textContent = 'Checking';
  $('#discovery-network-badge').textContent = 'Checking';
  $('#discovery-docker-ready').hidden = true;
  $('#discovery-docker-setup').hidden = true;
  $('#discovery-docker-error').hidden = true;
  $('#discovery-network-ready').hidden = true;
  $('#discovery-network-setup').hidden = true;
  $('#discovery-network-error').hidden = true;
  setNetworkScanning(false);
  $('#discovery-dialog').showModal();
  setDiscoveryStep('choose');
  setDiscoveryStatus('');
  loadDiscoverySources();
  loadNmapStatus();
}

async function unlockDiscoverySources() {
  if (!discoveryState || discoveryState.unlocking || !$('#discovery-dialog').open || !projectGuardCurrent(discoveryState.guard, project)) return;
  const state = discoveryState;
  const token = $('#discovery-api-token').value;
  if (!token) return setDiscoveryStatus('Enter the API token first.', true);
  apiToken = token;
  const retryCurrent = state.pendingAuthToken === state.requestToken;
  const pendingDocker = retryCurrent && state.method === 'docker' && state.pendingDockerSource === $('#discovery-source').value ? state.pendingDockerSource : null;
  const pendingFile = retryCurrent ? state.pendingNmapFile : null;
  const pendingScan = retryCurrent && state.pendingNetworkScan
    && JSON.stringify(state.pendingNetworkScan) === JSON.stringify(currentNetworkRequest()) ? state.pendingNetworkScan : null;
  const hadReview = Boolean(state.snapshot);
  const statusBeforeAuth = state.statusBeforeAuth;
  state.unlocking = true;
  state.pendingAuthToken = null;
  state.pendingDockerSource = null;
  state.pendingNmapFile = null;
  state.pendingNetworkScan = null;
  $('#discovery-unlock').disabled = true;
  hideDiscoveryAuth(false);
  try {
    let success = true;
    if (pendingDocker) success = await scanDiscoverySource();
    else if (pendingFile) success = await importNmapXML(pendingFile);
    else if (pendingScan) success = await scanNmapNetwork(pendingScan);
    if (success && discoveryState === state) {
      const actionToken = state.requestToken;
      const ready = await refreshDiscoveryMetadata(state);
      if (ready && discoveryState === state && state.requestToken === actionToken) {
        state.authRequired = false;
        hideDiscoveryAuth();
        if (!pendingDocker && !pendingFile && !pendingScan) setDiscoveryStatus(hadReview && statusBeforeAuth ? statusBeforeAuth : 'Discovery is ready.');
        state.statusBeforeAuth = null;
      }
    }
  } finally {
    if (discoveryState === state) {
      state.unlocking = false;
      $('#discovery-unlock').disabled = false;
    }
  }
}

$('#discover-docker').addEventListener('click', event => openDiscovery(event.currentTarget));
document.querySelectorAll('[data-discovery-method]').forEach(button => button.addEventListener('click', () => chooseDiscoveryMethod(button.dataset.discoveryMethod)));
$('#discovery-back').addEventListener('click', showDiscoveryChooser);
$('#discovery-start-over').addEventListener('click', showDiscoveryChooser);
$('#discovery-check-docker').addEventListener('click', () => loadDiscoverySources(false));
$('#discovery-retry-docker').addEventListener('click', () => discoveryState?.dockerRetry === 'scan' ? scanDiscoverySource() : loadDiscoverySources(false));
$('#discovery-retry-network').addEventListener('click', () => loadNmapStatus());
$('#discovery-dialog').addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.openSetup) return openDiscoverySetup(button.dataset.openSetup);
  if (button.id === 'discovery-connect-docker') return openDiscoverySetup('docker');
  if (button.dataset.setupImport) {
    chooseDiscoveryMethod('import');
    return (button.dataset.setupImport === 'docker' ? $('#discovery-file') : $('#discovery-nmap-file')).click();
  }
  if (button.dataset.setupCheck) return button.dataset.setupCheck === 'docker' ? loadDiscoverySources(false) : loadNmapStatus();
  const setup = discoveryState?.setup;
  if (button.hasAttribute('data-setup-back') && setup) {
    if (!setup.index) return closeDiscoverySetup();
    setup.feedback = '';
    setup.index -= 1;
    return renderDiscoverySetup();
  }
  if (button.hasAttribute('data-setup-next') && setup) {
    const selected = $(`#discovery-${setup.method}-setup input[name="setup-choice"]:checked`);
    if (selected) setup.answers = updateDiscoverySetupAnswers(setup.answers, selected.dataset.setupAnswer, selected.value);
    setup.feedback = '';
    setup.index += 1;
    return renderDiscoverySetup();
  }
  if (!button.hasAttribute('data-copy-command')) return;
  const command = button.parentElement.querySelector('code').textContent;
  try {
    await navigator.clipboard.writeText(command);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1500);
  } catch {
    button.parentElement.querySelector('code').tabIndex = 0;
    button.parentElement.querySelector('code').focus();
    setDiscoveryStatus('Copy failed. Select the command text and copy it manually.', true);
  }
});
$('#discovery-dialog').addEventListener('change', event => {
  if (event.target.matches('[data-setup-answer]')) event.target.closest('.discovery-wizard').querySelector('[data-setup-next]').disabled = false;
});
$('#discovery-source').addEventListener('change', () => {
  if (!discoveryState) return;
  discoveryState.dockerRetry = null;
  $('#discovery-docker-error').hidden = true;
  $('#discovery-scan').disabled = !$('#discovery-source').value;
  beginDiscoveryRequest('Docker host changed. Choose Find Docker apps to continue.', true);
});
$('#discovery-scope').addEventListener('change', () => {
  if (!discoveryState) return;
  $('#discovery-import-scope').value = $('#discovery-scope').value;
  beginDiscoveryRequest('Network name changed. Choose Find devices to continue.', true);
});
$('#discovery-import-scope').addEventListener('change', () => {
  if (!discoveryState) return;
  $('#discovery-scope').value = $('#discovery-import-scope').value;
  beginDiscoveryRequest('Import scope changed. Choose the Nmap XML file again.', true);
});
for (const id of ['discovery-targets', 'discovery-port-preset', 'discovery-ports', 'discovery-detect-services']) $(`#${id}`).addEventListener('input', () => {
  if (!discoveryState) return;
  if (id === 'discovery-targets') {
    $('#discovery-targets').removeAttribute('aria-invalid');
    $('#discovery-network-start').disabled = !discoveryState.nmapStatus?.available || !$('#discovery-targets').value.trim();
  }
  if (id === 'discovery-port-preset') $('#discovery-custom-ports').hidden = $('#discovery-port-preset').value !== 'custom';
  discoveryState.pendingNetworkScan = null;
  beginDiscoveryRequest('Scan settings changed. Choose Find devices to start.', true);
  setNetworkScanning(false);
});
$('#discovery-scan').addEventListener('click', scanDiscoverySource);
$('#discovery-network-start').addEventListener('click', () => scanNmapNetwork());
$('#discovery-network-stop').addEventListener('click', () => {
  if (!discoveryState) return;
  discoveryState.controller?.abort();
  discoveryState.requestToken = Symbol('stopped-scan');
  discoveryState.pendingNmapFile = null;
  discoveryState.pendingNetworkScan = null;
  discoveryState.pendingDockerSource = null;
  discoveryState.pendingAuthToken = null;
  setNetworkScanning(false);
  setDiscoveryStatus('Network scan stopped. No results were loaded.');
});
$('#discovery-import').addEventListener('click', () => {
  if (discoveryState) beginDiscoveryRequest('Choose a saved snapshot to import.', true);
  $('#discovery-file').click();
});
$('#discovery-file').addEventListener('change', event => {
  const file = event.target.files[0];
  event.target.value = '';
  importDiscoverySnapshot(file);
});
$('#discovery-nmap-import').addEventListener('click', () => {
  if (discoveryState) beginDiscoveryRequest('Choose Nmap XML to import.', true);
  $('#discovery-nmap-file').click();
});
$('#discovery-nmap-file').addEventListener('change', event => {
  const file = event.target.files[0];
  event.target.value = '';
  importNmapXML(file);
});
$('#discovery-host').addEventListener('change', event => {
  const snapshot = discoveryState?.bundle?.snapshots[Number(event.target.value)];
  if (snapshot) showDiscoverySnapshot(snapshot, 'Review choices for this device are preserved while this scan stays open.');
});
for (const [id, offset] of [['discovery-host-previous', -1], ['discovery-host-next', 1]]) $(`#${id}`).addEventListener('click', () => {
  const index = Number($('#discovery-host').value) + offset;
  const snapshot = discoveryState?.bundle?.snapshots[index];
  if (snapshot) showDiscoverySnapshot(snapshot, 'Review choices for this device are preserved while this scan stays open.');
});
$('#discovery-unlock').addEventListener('click', unlockDiscoverySources);
$('#discovery-api-token').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    unlockDiscoverySources();
  }
});
$('#discovery-device').addEventListener('change', () => {
  updateDiscoveryDestination(true);
  setDiscoveryStatus('Destination changed. Selections and actions were reset.');
});
$('#discovery-group').addEventListener('change', () => {
  $('#discovery-new-group-field').hidden = $('#discovery-group').value !== '__new';
  $('#discovery-group-description').textContent = `· ${$('#discovery-group').selectedOptions[0]?.textContent || 'New group'}`;
  updateDiscoveryPlan();
});
for (const id of ['discovery-new-device', 'discovery-new-group']) $(`#${id}`).addEventListener('input', updateDiscoveryPlan);
$('#discovery-search').addEventListener('input', event => {
  if (!discoveryState?.snapshot) return;
  discoveryState.query = event.target.value;
  discoveryState.page = 0;
  renderDiscoveryFindings();
});
$('#discovery-previous').addEventListener('click', () => {
  if (!discoveryState?.snapshot || discoveryState.page === 0) return;
  discoveryState.page -= 1;
  renderDiscoveryFindings();
});
$('#discovery-next').addEventListener('click', () => {
  if (!discoveryState?.snapshot) return;
  discoveryState.page += 1;
  renderDiscoveryFindings();
});
$('#discovery-select-visible').addEventListener('click', () => {
  if (!discoveryState?.snapshot) return;
  const filtered = filterDiscoveryFindings(discoveryState.snapshot.findings, discoveryState.query);
  const visible = filtered.slice(discoveryState.page * DISCOVERY_PAGE_SIZE, (discoveryState.page + 1) * DISCOVERY_PAGE_SIZE);
  const linked = visible.filter(item => discoveryBinding(project, discoveryState.snapshot.source.id, item.key)).map(item => item.key);
  setVisibleDiscoverySelection(discoveryState.choices, visible.map(item => item.key), linked, true);
  renderDiscoveryFindings();
});
$('#discovery-clear').addEventListener('click', () => {
  if (!discoveryState?.snapshot) return;
  for (const choice of discoveryState.choices.values()) choice.selected = false;
  renderDiscoveryFindings();
});
$('#discovery-apply').addEventListener('click', () => {
  const state = discoveryState;
  if (!state?.plan || !projectGuardCurrent(state.guard, project)) return invalidateDiscoveryIfStale();
  let applied = false;
  state.applying = true;
  try { applied = change(candidate => applyDiscoveryPlan(candidate, state.plan)); } finally { state.applying = false; }
  if (applied) {
    if (state.snapshot.format === 'homelab-atlas.nmap-discovery') {
      state.guard = captureProjectGuard(project);
      state.stale = false;
      state.reviewCache.delete(state.snapshot.source.id);
      showDiscoverySnapshot(state.snapshot, 'Added to the diagram. Undo is available; you can review another device or close.', false);
      toast('Added to diagram. Undo is available.');
    } else {
      $('#discovery-dialog').close();
      toast('Added to diagram. Undo is available.');
    }
  }
});
$('#discovery-form').addEventListener('submit', event => event.preventDefault());
document.querySelectorAll('[data-discovery-close]').forEach(button => button.addEventListener('click', () => $('#discovery-dialog').close()));
$('#discovery-dialog').addEventListener('close', () => {
  const state = discoveryState;
  state?.controller?.abort();
  state?.sourcesController?.abort();
  state?.statusController?.abort();
  if (state) {
    state.requestToken = Symbol('closed-dialog');
    state.pendingNmapFile = null;
    state.pendingNetworkScan = null;
    state.pendingAuthToken = null;
    setNetworkScanning(false);
  }
  discoveryState = null;
  $('#discovery-file').value = '';
  $('#discovery-nmap-file').value = '';
  hideDiscoveryAuth();
  if (state?.opener?.isConnected) state.opener.focus();
});

function closeFileMenu(restoreFocus = false) {
  const menu = $('#file-menu');
  if (!menu.open) return false;
  menu.open = false;
  if (restoreFocus) menu.querySelector('summary').focus();
  return true;
}

document.addEventListener('click', event => {
  if (!event.target.closest('#file-menu')) closeFileMenu();
});
$('#file-menu a').addEventListener('click', () => closeFileMenu());
$('#restore-backup').addEventListener('click', async () => {
  closeFileMenu();
  const onScreen = () => JSON.stringify({ tab: TAB_ID, data: JSON.stringify(project) });
  const outcome = await restoreBeforeShared({
    storage: localStorage,
    currentRaw: onScreen,
    parse: parseProject,
    validate: restored => verifyCustomLogoDecodes(restored.customLogos),
    confirmRestore: () => window.confirm('Restore the browser copy that was kept when the shared project file replaced it?\n\nThe diagram on screen now is kept as the new backup, so you can switch back.'),
    commit: async restored => {
      const previous = project;
      project = restored;
      project.revision = previous.revision + 1;
      if (saveProject()) {
        history = [];
        future = [];
        selected = null;
        render();
        return true;
      }
      project = previous;
      return false;
    },
  });
  if (outcome.status === 'restored') toast('Restored the previous browser copy. The diagram you had on screen is kept as the backup.');
  else if (outcome.status === 'none') toast('There is no previous browser copy to restore.');
  else if (outcome.status === 'unreadable') toast('The backup could not be read, so nothing was changed.', true);
  else if (outcome.status === 'backup-failed') toast('Nothing was restored: the diagram on screen could not be saved as a backup first.', true);
  else if (outcome.status === 'save-failed') toast(outcome.backupKept === false
    ? 'Nothing was restored and the previous copy could not be put back as the backup. Your current diagram is unchanged: use Save project to keep it.'
    : 'Nothing was restored: the restored diagram could not be saved in this browser. Your current diagram and the previous copy are unchanged.', true);
});
$('#sample').addEventListener('click', () => { closeFileMenu(); if (confirm('Replace this project with the example? You can undo afterward.')) replaceProject(sampleProject()); });
$('#empty').addEventListener('click', () => { closeFileMenu(); if (confirm('Start empty? You can undo afterward.')) replaceProject(emptyProject()); });

function undo() {
  if (!history.length) return;
  future.push(structuredClone(project));
  const next = history.pop();
  next.revision = project.revision + 1;
  project = next;
  selected = null;
  render();
  scheduleSave();
}

function redo() {
  if (!future.length) return;
  history.push(structuredClone(project));
  const next = future.pop();
  next.revision = project.revision + 1;
  project = next;
  selected = null;
  render();
  scheduleSave();
}

$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
addEventListener('keydown', event => {
  const editing = event.target.matches('input, select, textarea, [contenteditable=true]');
  if (event.key === 'Escape' && closeFileMenu(true)) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && gesture) {
    event.preventDefault();
    finishGesture(false);
    return;
  }
  if (event.key === 'Escape' && !editing && !document.querySelector('dialog[open]') && focusMode) {
    focusMode = false;
    render();
    return;
  }
  if (event.key === 'Escape' && !editing && !document.querySelector('dialog[open]') && inventoryOpen) {
    inventoryOpen = false;
    render();
    return;
  }
  if (event.key === 'Escape' && !editing && !document.querySelector('dialog[open]') && inspectorOpen) {
    inspectorOpen = false;
    render();
    return;
  }
  if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
  }
});

$('#import').addEventListener('click', () => { closeFileMenu(); $('#file-input').click(); });
$('#file-input').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const current = project;
  try {
    if (file.size > LIMITS.bytes) throw new Error('File is larger than 2 MB.');
    const next = parseProject(await file.text());
    await verifyCustomLogoDecodes(next.customLogos);
    if (project !== current) throw new Error('The project changed while the file was loading. Import it again.');
    replaceProject(next);
    toast('Project imported.');
  } catch (error) {
    toast(`Import failed: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});

const filename = extension => `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'homelab-atlas'}${extension}`;
function download(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$('#save-json').addEventListener('click', () => { closeFileMenu(); download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), filename('.json')); });
const exportOptions = () => ({ hideNetworkDetails: $('#export-hide-network').checked, customTerms: $('#export-custom-terms').value });
let exportPreviewFrame;
function updateExportPreview() {
  exportPreviewFrame = 0;
  try {
    $('#export-preview').innerHTML = createExportSnapshot(project, exportOptions()).svg;
    $('#export-error').textContent = '';
    $('#export-svg').disabled = false;
    $('#export-png').disabled = false;
  } catch (error) {
    $('#export-preview').replaceChildren();
    $('#export-error').textContent = error.message;
    $('#export-svg').disabled = true;
    $('#export-png').disabled = true;
  }
}
function queueExportPreview() {
  cancelAnimationFrame(exportPreviewFrame);
  exportPreviewFrame = requestAnimationFrame(updateExportPreview);
}
$('#export-menu').addEventListener('click', () => {
  $('#export-hide-network').checked = true;
  $('#export-dialog').showModal();
  updateExportPreview();
});
$('#export-hide-network').addEventListener('change', queueExportPreview);
$('#export-custom-terms').addEventListener('input', queueExportPreview);
$('#export-dialog').addEventListener('close', () => {
  cancelAnimationFrame(exportPreviewFrame);
  $('#export-menu').focus();
});
$('#export-svg').addEventListener('click', () => {
  try {
    const snapshot = createExportSnapshot(project, exportOptions(), '.svg');
    $('#export-dialog').close();
    download(new Blob([snapshot.svg], { type: 'image/svg+xml' }), snapshot.filename);
    toast('SVG exported.');
  } catch (error) {
    $('#export-error').textContent = error.message;
    toast(`Export failed: ${error.message}`);
  }
});
$('#export-png').addEventListener('click', () => {
  try {
    const snapshot = createExportSnapshot(project, exportOptions(), '.png');
    $('#export-dialog').close();
    toast('Rendering PNG…', true);
    const svg = snapshot.svg;
    const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const dimensions = pngDimensions(Number(match[1]), Number(match[2]));
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          try {
            if (!blob) return toast('PNG encoder failed.');
            download(blob, snapshot.filename);
            toast(dimensions.reduced ? `PNG exported at ${dimensions.width}×${dimensions.height} to stay within browser limits. Use SVG for unlimited scaling.` : `PNG exported at ${dimensions.width}×${dimensions.height}.`);
          } catch (error) { toast(`PNG export failed: ${error.message}`); }
        }, 'image/png');
      } catch (error) { toast(`PNG export failed: ${error.message}`); }
    };
    image.onerror = () => toast('PNG rendering failed. Use SVG for this diagram.');
    image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } catch (error) {
    $('#export-error').textContent = error.message;
    toast(`Export failed: ${error.message}`);
  }
});

function setZoom(next) {
  fitMode = 'manual';
  zoom = Math.min(1.8, Math.max(0.15, next));
  applyZoom();
}

$('#zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
$('#zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
$('#zoom-fit-page').addEventListener('click', () => { fitMode = 'page'; fitPreview(); });
$('#zoom-fit-width').addEventListener('click', () => { fitMode = 'width'; fitPreview(); });
new ResizeObserver(() => { if (fitMode !== 'manual') fitPreview(); }).observe($('#canvas'));

function selectDiagramTarget(target) {
  const item = target.closest('[data-device], [data-network]');
  if (item) selectInventoryItem(item.dataset.device || item.dataset.network);
}

function diagramPoint(event) {
  const svg = $('#preview svg');
  const rect = svg.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * svg.viewBox.baseVal.width / rect.width, y: (event.clientY - rect.top) * svg.viewBox.baseVal.height / rect.height };
}

function snap(value, candidates, guides, axis) {
  let best = null;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.value - value);
    if (distance <= 8 && (!best || distance < best.distance)) best = { value: candidate.value, distance, guide: candidate.guide };
  }
  if (best) {
    guides.push({ axis, value: best.guide });
    return best.value;
  }
  return Math.round(value / 8) * 8;
}

function gestureRect(event) {
  const point = diagramPoint(event);
  const dx = point.x - gesture.startPoint.x;
  const dy = point.y - gesture.startPoint.y;
  const guides = [];
  let next = { ...gesture.startRect };
  if (gesture.resize) {
    next.w += dx;
    next.h += dy;
  } else {
    next.x += dx;
    next.y += dy;
  }
  if (!event.altKey) {
    const layout = layoutProject(gesture.base);
    const peers = layout.cards.filter(card => card.id !== gesture.id).map(card => ({ x: card.x - layout.margin, y: card.y - layout.cardsY, w: card.w, h: card.h }));
    if (gesture.resize) {
      next.w = snap(next.w, peers.flatMap(peer => [{ value: peer.x - next.x, guide: peer.x }, { value: peer.x + peer.w - next.x, guide: peer.x + peer.w }]), guides, 'x');
      next.h = snap(next.h, peers.flatMap(peer => [{ value: peer.y - next.y, guide: peer.y }, { value: peer.y + peer.h - next.y, guide: peer.y + peer.h }]), guides, 'y');
    } else {
      next.x = snap(next.x, peers.flatMap(peer => [{ value: peer.x, guide: peer.x }, { value: peer.x + peer.w - next.w, guide: peer.x + peer.w }, { value: peer.x + peer.w / 2 - next.w / 2, guide: peer.x + peer.w / 2 }]), guides, 'x');
      next.y = snap(next.y, peers.flatMap(peer => [{ value: peer.y, guide: peer.y }, { value: peer.y + peer.h - next.h, guide: peer.y + peer.h }, { value: peer.y + peer.h + 24, guide: peer.y + peer.h + 24 }, { value: peer.y - next.h - 24, guide: peer.y - 24 }, { value: peer.y + peer.h / 2 - next.h / 2, guide: peer.y + peer.h / 2 }]), guides, 'y');
    }
  }
  const candidate = structuredClone(gesture.base);
  setManualCard(candidate, gesture.id, next);
  gesture.current = candidate.layout.cards.find(card => card.id === gesture.id);
  const layout = layoutProject(candidate);
  const card = layout.cards.find(item => item.id === gesture.id);
  const actual = { x: card.x - layout.margin, y: card.y - layout.cardsY, w: card.w, h: card.h };
  const visibleGuides = guides.filter(guide => (guide.axis === 'x'
    ? [actual.x, actual.x + actual.w, actual.x + actual.w / 2]
    : [actual.y, actual.y + actual.h, actual.y + actual.h / 2]).some(value => Math.abs(value - guide.value) < 0.5));
  renderPreview(candidate, visibleGuides);
}

$('#preview').addEventListener('pointerdown', event => {
  if (!arrangeMode || event.button !== 0) return;
  const item = event.target.closest('[data-device]');
  if (!item) return;
  event.preventDefault();
  const id = item.dataset.device;
  const resize = event.target.classList.contains('resize-hit');
  selected = id;
  fitMode = 'manual';
  const layout = layoutProject(project);
  const card = layout.cards.find(entry => entry.id === id);
  gesture = {
    id, resize, pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, startPoint: diagramPoint(event),
    startRect: { x: card.x - layout.margin, y: card.y - layout.cardsY, w: card.w, h: card.h }, current: null, moved: false, base: structuredClone(project),
  };
  $('#preview').setPointerCapture(event.pointerId);
  renderPreview();
  focusSelectedCard(id);
  renderInventory();
  if (inspectorOpen) renderInspector();
});

$('#preview').addEventListener('pointermove', event => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  if (!gesture.moved && Math.hypot(event.clientX - gesture.startClient.x, event.clientY - gesture.startClient.y) < 4) return;
  gesture.moved = true;
  gestureRect(event);
});

function finishGesture(commit) {
  if (!gesture) return;
  const finished = gesture;
  gesture = null;
  if (finished.moved) suppressDiagramClick = true;
  const changed = finished.current && ['x', 'y', 'w', 'h'].some(key => finished.current[key] !== finished.startRect[key]);
  if (commit && finished.moved && changed) {
    change(candidate => setManualCard(candidate, finished.id, finished.current));
  } else renderPreview();
  focusSelectedCard(finished.id);
}

$('#preview').addEventListener('pointerup', event => { if (gesture?.pointerId === event.pointerId) finishGesture(true); });
$('#preview').addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) finishGesture(false); });
$('#preview').addEventListener('lostpointercapture', () => { if (gesture) finishGesture(false); });
$('#preview').addEventListener('click', event => {
  if (suppressDiagramClick) { suppressDiagramClick = false; return; }
  if (arrangeMode && event.target.closest('[data-device]')) return;
  selectDiagramTarget(event.target);
});
$('#preview').addEventListener('keydown', event => {
  const item = event.target.closest('[data-device]');
  if (arrangeMode && item && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    selected = item.dataset.device;
    const step = event.shiftKey ? 32 : 8;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    const layout = layoutProject(project);
    const card = layout.cards.find(entry => entry.id === selected);
    const rect = { x: card.x - layout.margin, y: card.y - layout.cardsY, w: card.w, h: card.h };
    if (event.altKey) { rect.w += delta[0]; rect.h += delta[1]; } else { rect.x += delta[0]; rect.y += delta[1]; }
    change(candidate => setManualCard(candidate, selected, rect));
    focusSelectedCard();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    const item = event.target.closest('[data-device], [data-network]');
    if (item) { event.preventDefault(); selectDiagramTarget(item); }
  }
});
$('#arrange').addEventListener('click', () => { arrangeMode = !arrangeMode; if (!arrangeMode) gesture = null; render(); });
$('#auto-layout').addEventListener('click', () => { if (project.layout.mode === 'manual') change(candidate => resetAutoLayout(candidate)); });
$('#settings').addEventListener('click', () => { focusMode = false; inventoryOpen = false; selected = null; inspectorOpen = true; render(); });
$('#focus-canvas').addEventListener('click', () => { focusMode = !focusMode; inventoryOpen = false; render(); });
$('#inventory-toggle').addEventListener('click', () => { focusMode = false; inventoryOpen = !inventoryOpen; render(); });
$('#inventory-close').addEventListener('click', () => { inventoryOpen = false; render(); $('#inventory-toggle').focus(); });
$('#inspector-close').addEventListener('click', () => { inspectorOpen = false; render(); });

$('#inventory-search').addEventListener('input', event => {
  inventoryQuery = event.target.value;
  renderInventory();
});

addEventListener('storage', event => {
  if (event.key === STORAGE_KEY && hasStorageConflict(event.newValue, lastStored, TAB_ID)) showConflict(event.newValue);
});
$('#conflict-keep').addEventListener('click', () => saveProject(true));
$('#conflict-load').addEventListener('click', async () => {
  const raw = conflictRaw;
  const current = project;
  try {
    const next = parseProject(JSON.parse(raw).data);
    await verifyCustomLogoDecodes(next.customLogos);
    if (project !== current || conflictRaw !== raw) throw new Error('The saved project changed again. Review the latest conflict.');
    history.push(structuredClone(project));
    future = [];
    project = next;
    lastStored = raw;
    hideConflict();
    setSaveStatus('Saved locally');
    render();
  } catch (error) { toast(`Could not load saved version: ${error.message}`); }
});
$('#conflict-download').addEventListener('click', () => download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), filename('.json')));

buildTemplates();
loadProject();
