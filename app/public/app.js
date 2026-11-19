import { LOGOS, customLogoEntries, logoById, logoDataUri, logoPlate, networkLogoId, searchLogos } from './catalog.js';
import {
  LIMITS, emptyProject, isValidLink, layoutProject, parseProject, removeDevice, removeGroup, removeNetwork, removeService, resetAutoLayout,
  renderProject, sampleProject, setManualCard, uid, validateProject,
} from './model.js';
import { createExportSnapshot } from './export.js';
import { applyProjectChange, filterInventory, hasStorageConflict, pngDimensions, updateSelection } from './state.js';
import { CUSTOM_LOGO_LIMITS, normalizeLogoUpload, verifyCustomLogoDecodes } from './custom-logos.js';
import { applyDocumentFavicon, normalizeFaviconUpload } from './favicon.js';
import { DEFAULT_PROJECT_STORAGE_KEY, decodeProjectRecord } from './project-storage.js';

const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'homelab-atlas.project';
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

function hasStoredDefault() {
  try {
    return Boolean(localStorage.getItem(DEFAULT_PROJECT_STORAGE_KEY));
  } catch {
    return false;
  }
}

function updateDefaultProjectActions() {
  const available = hasStoredDefault();
  const clear = $('#clear-default');
  if (clear) clear.hidden = !available;
  const save = $('#save-default');
  if (save) save.title = available ? 'Replace the browser default project with this project' : 'Open this project when no locally saved project exists';
}

function saveDefaultProject() {
  try {
    const raw = JSON.stringify({ tab: TAB_ID, data: JSON.stringify(project) });
    localStorage.setItem(DEFAULT_PROJECT_STORAGE_KEY, raw);
    updateDefaultProjectActions();
    toast('Saved as the browser default project.');
  } catch {
    toast('The browser default could not be saved. Local storage is full or unavailable.', true);
  }
}

function clearDefaultProject() {
  try {
    localStorage.removeItem(DEFAULT_PROJECT_STORAGE_KEY);
    updateDefaultProjectActions();
    toast('Browser default project cleared.');
  } catch {
    toast('The browser default could not be cleared because local storage is unavailable.', true);
  }
}

async function loadProject() {
  let fresh = false;
  let source = 'saved';
  let defaultError = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const loaded = parseProject(JSON.parse(raw).data);
      await verifyCustomLogoDecodes(loaded.customLogos);
      project = loaded;
      lastStored = raw;
    } else {
      const defaultRaw = localStorage.getItem(DEFAULT_PROJECT_STORAGE_KEY);
      if (defaultRaw) {
        try {
          const loaded = decodeProjectRecord(defaultRaw);
          await verifyCustomLogoDecodes(loaded.customLogos);
          project = loaded;
          source = 'default';
        } catch (error) {
          project = sampleProject();
          source = 'default-error';
          defaultError = error;
        }
      } else {
        project = sampleProject();
        fresh = true;
      }
    }
  } catch (error) {
    updateDefaultProjectActions();
    project = sampleProject();
    setSaveStatus('Not saved — storage unavailable', true);
    toast(`Local project could not be loaded: ${error.message}`);
    render();
    return;
  }
  render();
  updateDefaultProjectActions();
  if (fresh) saveProject();
  else if (source === 'default') setSaveStatus('Using browser default');
  else if (source === 'default-error') {
    setSaveStatus('Browser default unavailable', true);
    toast(`Browser default could not be loaded: ${defaultError.message}`);
  } else setSaveStatus('Saved locally');
}

function render() {
  validateProject(project);
  applyDocumentFavicon(project.favicon);
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
  return `<div class="settings"><section class="inspector-section"><h3>Appearance</h3><label>Subtitle<input data-project="subtitle" maxlength="120"></label><div class="form-grid"><label>Theme<select data-project="theme"><option value="navy">Navy</option><option value="light">Light</option><option value="midnight">Midnight</option></select></label><label>Columns<select data-project="columns"><option>1</option><option>2</option><option>3</option><option>4</option></select></label></div><label>Density<select data-project="density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><div class="favicon-setting"><span class="favicon-preview"><img data-favicon-preview alt=""></span><div class="favicon-copy"><strong>Browser tab icon</strong><span>PNG, JPG, WebP, SVG, or ICO. Stored as a PNG up to 128px.</span><div class="favicon-actions"><button type="button" data-favicon-upload>Upload favicon</button><button type="button" class="danger" data-favicon-clear hidden>Remove</button></div></div></div><input data-favicon-file type="file" accept=".png,.jpg,.jpeg,.webp,.svg,.ico,image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon" hidden></section><section class="inspector-section"><div class="section-head"><h3>VLANs</h3><button type="button" data-add-vlan>${icon('add')}VLAN</button></div><div id="vlan-list" class="vlan-list"></div></section><section class="inspector-section"><h3>Links</h3><button type="button" data-edit-connections>Edit connections</button></section></div>`;
}

function bindProjectForm(root) {
  for (const key of ['subtitle', 'theme', 'columns', 'density']) root.querySelector(`[data-project=${key}]`).value = project[key];
  const faviconPreview = root.querySelector('[data-favicon-preview]');
  faviconPreview.src = project.favicon || '/favicon.svg';
  faviconPreview.alt = project.favicon ? 'Custom browser tab icon' : 'Default Homelab Atlas icon';
  root.querySelector('[data-favicon-clear]').hidden = !project.favicon;
  const faviconInput = root.querySelector('[data-favicon-file]');
  root.querySelector('[data-favicon-upload]').addEventListener('click', () => faviconInput.click());
  faviconInput.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const current = project;
    try {
      const favicon = await normalizeFaviconUpload(file);
      if (project !== current) throw new Error('The project changed while the favicon was loading. Try again.');
      if (change(candidate => { candidate.favicon = favicon; })) toast('Browser tab icon updated.');
    } catch (error) {
      toast(error.message);
    }
  });
  root.querySelector('[data-favicon-clear]').addEventListener('click', () => {
    if (change(candidate => { candidate.favicon = ''; })) toast('Browser tab icon reset to default.');
  });
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
    row.innerHTML = `<button type="button" data-service-logo class="service-logo" aria-haspopup="dialog" aria-label="Change logo for ${escapeHtml(service.name)}"><img class="${logoPlateClass(service.logo)}" alt="" src="${logoSource(service.logo)}"></button><input data-service-name maxlength="120" aria-label="Service name"><div class="service-controls"><input data-service-count type="number" min="1" max="99" step="1" aria-label="Instance count"><button data-service-up class="mini" aria-label="Move up">${icon('up')}</button><button data-service-down class="mini" aria-label="Move down">${icon('down')}</button><button data-remove-service class="mini danger" aria-label="Remove service">${icon('close')}</button></div><label class="service-link"><span>Link</span><input data-service-link type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="${LIMITS.link}" placeholder="https://service.example.com" aria-label="Link for ${escapeHtml(service.name)}"></label>`;
    row.querySelector('[data-service-name]').value = service.name;
    row.querySelector('[data-service-count]').value = service.count;
    row.querySelector('[data-service-link]').value = service.link;
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
  } else if (event.target.matches('[data-service-name], [data-service-count], [data-service-link]') && deviceId) {
    const groupId = event.target.closest('[data-group]').dataset.group;
    const serviceId = event.target.closest('[data-service]').dataset.service;
    const count = Number(event.target.value);
    if (event.target.matches('[data-service-count]') && (!Number.isInteger(count) || count < 1 || count > 99)) {
      render();
      return toast('Instance count must be a whole number from 1 to 99.');
    }
    const link = event.target.matches('[data-service-link]') ? event.target.value.trim() : '';
    if (event.target.matches('[data-service-link]') && link && !isValidLink(link)) {
      render();
      return toast(`Service links must be full http:// or https:// URLs up to ${LIMITS.link} characters.`);
    }
    change(candidate => {
      const service = candidate.devices.find(item => item.id === deviceId).groups.find(group => group.id === groupId).services.find(item => item.id === serviceId);
      if (event.target.matches('[data-service-count]')) service.count = count;
      else if (event.target.matches('[data-service-link]')) service.link = link;
      else service.name = event.target.value;
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
        groups: [{ id: uid('grp'), name: 'Services', services: template.services.map(([logo, name]) => ({ id: uid('svc'), logo, name, count: 1, link: '' })) }],
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
    group.services.push(...ids.map(id => ({ id: uid('svc'), logo: id, name: state.drafts.get(id)?.label || logoFor(id).label, count: 1, link: '' })));
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
    candidate.devices.find(device => device.id === deviceId).groups.find(group => group.id === groupId).services.push({ id: uid('svc'), logo: 'generic', name, count: 1, link: '' });
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
$('#sample').addEventListener('click', () => { closeFileMenu(); if (confirm('Replace this project with the example? You can undo afterward.')) replaceProject(sampleProject()); });
$('#empty').addEventListener('click', () => { closeFileMenu(); if (confirm('Start empty? You can undo afterward.')) replaceProject(emptyProject()); });
$('#save-default').addEventListener('click', () => {
  const replacing = hasStoredDefault();
  closeFileMenu();
  if (replacing && !confirm('Replace the browser default project with this project?')) return;
  saveDefaultProject();
});
$('#clear-default').addEventListener('click', () => {
  closeFileMenu();
  if (confirm('Clear the browser default project? The project open in this tab will not change.')) clearDefaultProject();
});

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
  if (event.key === DEFAULT_PROJECT_STORAGE_KEY || event.key === null) updateDefaultProjectActions();
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
