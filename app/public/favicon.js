import { svgTextHasUnsafeContent } from './custom-logos.js';

export const FAVICON_LIMITS = {
  uploadBytes: 2_000_000,
  sourceSide: 4096,
  sourcePixels: 16_000_000,
  storedSide: 128,
  minimumSide: 32,
  dataUrlChars: 120_000,
};
export const DEFAULT_FAVICON_PATH = '/favicon.svg';

const DATA_RE = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const fail = message => { throw new Error(message); };

function decodedLength(base64) {
  return Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

function parsePng(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) fail('Favicon must be an empty string or a PNG data URL.');
  if (dataUrl.length > FAVICON_LIMITS.dataUrlChars) fail('Favicon PNG is too large.');
  const match = DATA_RE.exec(dataUrl);
  if (!match || match[1].length % 4) fail('Favicon must be a canonical PNG data URL.');
  const base64 = match[1];
  const length = decodedLength(base64);
  if (length < 45 || length > 150_000) fail('Favicon PNG has invalid data.');
  let binary;
  try { binary = atob(base64); } catch { fail('Favicon PNG has invalid base64 data.'); }
  if (binary.length !== length || btoa(binary) !== base64) fail('Favicon PNG is not canonically encoded.');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value)) fail('Favicon has an invalid PNG signature.');
  const view = new DataView(bytes.buffer);
  let offset = 8;
  let width;
  let height;
  let hasImageData = false;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) fail('Favicon PNG is truncated.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset === 8 && (type !== 'IHDR' || size !== 13)) fail('Favicon PNG has an invalid header.');
    if (type === 'IHDR') {
      if (width !== undefined) fail('Favicon PNG has duplicate headers.');
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (!width || !height || width > FAVICON_LIMITS.storedSide || height > FAVICON_LIMITS.storedSide) fail(`Favicon PNG dimensions must not exceed ${FAVICON_LIMITS.storedSide}px.`);
    }
    if (type === 'IDAT') hasImageData = true;
    offset = end;
    if (type === 'IEND') {
      if (size || offset !== bytes.length) fail('Favicon PNG has an invalid terminator.');
      ended = true;
      break;
    }
  }
  if (!ended || width === undefined || !hasImageData) fail('Favicon PNG is incomplete.');
  return { width, height, bytes: length };
}

export function validateFaviconDataUrl(dataUrl) {
  if (dataUrl === '') return true;
  parsePng(dataUrl);
  return true;
}

export function applyDocumentFavicon(dataUrl) {
  if (typeof document === 'undefined') return;
  let link = document.getElementById('app-favicon');
  if (!link) {
    link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    document.head.append(link);
  }
  const custom = typeof dataUrl === 'string' && dataUrl !== '';
  link.type = custom ? 'image/png' : 'image/svg+xml';
  link.href = custom ? dataUrl : DEFAULT_FAVICON_PATH;
}

const readFile = (file, method) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read that favicon file.'));
  reader[method](file);
});

const decodeImage = source => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('This favicon cannot be decoded by the browser.'));
  image.src = source;
});

export async function normalizeFaviconUpload(file) {
  if (!(file instanceof File) || !file.size) fail('Choose a favicon image.');
  if (file.size > FAVICON_LIMITS.uploadBytes) fail('Favicon files must be 2 MB or smaller.');
  const extensionMime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon' }[file.name.split('.').pop().toLowerCase()];
  let mime = file.type.toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (mime === 'image/vnd.microsoft.icon') mime = 'image/x-icon';
  if (!mime) mime = extensionMime;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon'].includes(mime)) fail('Choose a PNG, JPG, WebP, SVG, or ICO file.');
  let source;
  if (mime === 'image/svg+xml') {
    const text = await readFile(file, 'readAsText');
    if (!svgTextHasUnsafeContent(text)) {
      source = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
    } else {
      fail('This SVG favicon contains unsupported or unsafe content.');
    }
  } else {
    source = await readFile(file, 'readAsDataURL');
  }
  const image = await decodeImage(source);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight || sourceWidth > FAVICON_LIMITS.sourceSide || sourceHeight > FAVICON_LIMITS.sourceSide || sourceWidth * sourceHeight > FAVICON_LIMITS.sourcePixels) fail('Favicon dimensions exceed 4096px or 16 million pixels.');
  let side = Math.min(FAVICON_LIMITS.storedSide, Math.max(FAVICON_LIMITS.minimumSide, sourceWidth, sourceHeight));
  let dataUrl;
  do {
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) fail('This favicon cannot be drawn by the browser.');
    const scale = Math.min(side / sourceWidth, side / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    context.drawImage(image, Math.floor((side - width) / 2), Math.floor((side - height) / 2), width, height);
    dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length <= FAVICON_LIMITS.dataUrlChars) break;
    side = Math.floor(side * .8);
  } while (side >= 16);
  if (dataUrl.length > FAVICON_LIMITS.dataUrlChars) fail('This favicon cannot be stored under the project size limit.');
  validateFaviconDataUrl(dataUrl);
  return dataUrl;
}
