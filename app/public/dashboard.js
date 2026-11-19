import { applyDocumentFavicon } from './favicon.js';
import { renderProject } from './model.js';
import { DASHBOARD_DEFAULT_KEY, DASHBOARD_STORAGE_KEY, dashboardStats, decodeStoredProject, serviceLinks } from './dashboard-model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = selector => document.querySelector(selector);
const afterPaint = callback => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 0);

function readStoredProject() {
  let raw;
  let defaultRaw;
  try {
    raw = localStorage.getItem(DASHBOARD_STORAGE_KEY);
    defaultRaw = localStorage.getItem(DASHBOARD_DEFAULT_KEY);
  } catch {
    return { ...decodeStoredProject(null), source: 'unavailable' };
  }
  return decodeStoredProject(raw, defaultRaw);
}

function noticeText(decoded) {
  if (decoded.source === 'sample') return 'No saved project in this browser. Showing the example project.';
  if (decoded.source === 'default') return 'No saved project in this browser. Showing your browser default project.';
  if (decoded.source === 'unavailable') return 'Browser storage is unavailable. Showing the example project.';
  const detail = String(decoded.error || 'unknown error').replace(/\.$/, '');
  return `The saved project could not be read (${detail}). Showing the example project.`;
}

function fitDiagram() {
  const container = $('#diagram');
  const svg = container.querySelector('svg');
  if (!svg) return;
  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
  const naturalWidth = viewBox[2];
  const naturalHeight = viewBox[3];
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) return;
  const style = getComputedStyle(container);
  const horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const available = Math.max(100, container.clientWidth - horizontalPadding);
  const width = Math.min(naturalWidth, available);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(naturalHeight * width / naturalWidth));
}

function addServiceLinks(container, project) {
  const tiles = new Map([...container.querySelectorAll('[data-service]')].map(node => [node.dataset.service, node]));
  for (const [id, link] of serviceLinks(project)) {
    const tile = tiles.get(id);
    if (!tile) continue;
    const anchor = document.createElementNS(SVG_NS, 'a');
    anchor.setAttribute('class', 'service-link');
    anchor.setAttribute('href', link.href);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
    anchor.setAttribute('referrerpolicy', 'no-referrer');
    anchor.setAttribute('aria-label', `Open ${link.name} on ${link.device} in a new tab`);
    const title = tile.querySelector('title');
    if (title) title.textContent = `${title.textContent} — open in new tab`;
    tile.parentNode.insertBefore(anchor, tile);
    anchor.appendChild(tile);
  }
}

function render() {
  const decoded = readStoredProject();
  const project = decoded.project;
  const stats = dashboardStats(project);
  const scroll = { x: window.scrollX, y: window.scrollY };
  applyDocumentFavicon(project.favicon);
  document.title = `${project.title} · Homelab Atlas Dashboard`;
  $('#dashboard-title').textContent = project.title;
  $('#dashboard-status').textContent = decoded.source === 'saved'
    ? (stats.services ? `${stats.links} of ${stats.services} services linked` : 'No services yet')
    : decoded.source === 'default' ? 'Browser default'
    : decoded.source === 'sample' ? 'Example project'
    : decoded.source === 'unavailable' ? 'Storage unavailable' : 'Saved project unavailable';

  const notice = $('#dashboard-notice');
  if (decoded.source === 'saved') {
    notice.hidden = true;
  } else {
    notice.hidden = false;
    $('#dashboard-notice-text').textContent = noticeText(decoded);
  }

  const container = $('#diagram');
  container.className = `diagram theme-${project.theme}`;
  try {
    container.innerHTML = renderProject(project);
  } catch (error) {
    container.innerHTML = '';
    notice.hidden = false;
    $('#dashboard-notice-text').textContent = `The project could not be drawn: ${error.message}`;
    return;
  }

  const svg = container.querySelector('svg');
  if (svg) {
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', `${project.title} service dashboard`);
  }
  for (const node of container.querySelectorAll('[data-device], [data-network]')) {
    node.removeAttribute('tabindex');
    node.removeAttribute('role');
    node.removeAttribute('aria-label');
  }
  addServiceLinks(container, project);
  fitDiagram();
  afterPaint(fitDiagram);
  if (typeof window.scrollTo === 'function') {
    try { window.scrollTo(scroll.x, scroll.y); } catch { /* Some embedded browsers disallow programmatic scrolling. */ }
  }
}

$('#refresh').addEventListener('click', render);
addEventListener('storage', event => {
  if (event.key === DASHBOARD_STORAGE_KEY || event.key === DASHBOARD_DEFAULT_KEY || event.key === null) render();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});
addEventListener('pageshow', event => {
  if (event.persisted) render();
});
if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitDiagram()).observe($('#diagram'));

render();
