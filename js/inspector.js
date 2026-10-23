import {deriveKey, randomBytes} from './crypto.js';
import {decodeInvisible} from './zerowidth.js';
import {initExplainer} from './explainer.js';

const $ = id => document.getElementById(id);
const MAX_PIXELS = 12000000;
const CHANNELS = ['R', 'G', 'B'];
const imageState = {original: null, stego: null, originalPixels: null, stegoPixels: null, width: 0, height: 0, view: 'slider'};
let demoState = null;
let explainReport = null;
let explainReportError = null;
try {
  const storedReport = sessionStorage.getItem('whisperPixelsExplainReport');
  sessionStorage.removeItem('whisperPixelsExplainReport');
  if (storedReport) {
    const candidate = JSON.parse(storedReport);
    const valid = candidate?.version === 1 &&
      ['image-lsb', 'text-zero-width'].includes(candidate.method) &&
      ['hide', 'reveal'].includes(candidate.direction) &&
      typeof candidate.messagePreview === 'string' && candidate.messagePreview.length <= 200 &&
      typeof candidate.coverPreview === 'string' && candidate.coverPreview.length <= 200 &&
      Number.isFinite(candidate.messageChars) && Number.isFinite(candidate.messageBytes) &&
      Number.isFinite(candidate.payloadBits) && Number.isFinite(candidate.capacityBits) &&
      Array.isArray(candidate.samples) && candidate.samples.length <= 5;
    if (!valid) throw new Error('The local explanation report has an unexpected format.');
    explainReport = candidate;
  }
} catch (error) {
  console.error('The local explanation report could not be read:', error);
  explainReportError = error.message;
}
initExplainer(explainReport);
if (explainReportError) $('explain-status').textContent = `Report unavailable: ${explainReportError}`;

function setThemeButton() {
  const light = document.documentElement.classList.contains('light-mode');
  $('theme-toggle').textContent = light ? '☾' : '☼';
  $('theme-toggle').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
}
setThemeButton();
$('theme-toggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('light-mode');
  localStorage.setItem('theme', document.documentElement.classList.contains('light-mode') ? 'light' : 'dark');
  setThemeButton();
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.error('Offline support could not be registered:', error));
}

document.querySelectorAll('.lab-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.lab-tab').forEach(item => {
    const active = item === tab;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.lab-panel').forEach(panel => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
}));

document.querySelectorAll('.show-password').forEach(button => button.addEventListener('click', () => {
  const input = $(button.dataset.target);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'Hide' : 'Show';
  button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
}));

function showError(id, message) {
  $(id).textContent = message;
  $(id).hidden = false;
}

function clearError(id) {
  $(id).textContent = '';
  $(id).hidden = true;
}

function bitmapPixels(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('Your browser could not create an image canvas.');
  context.drawImage(bitmap, 0, 0);
  try {
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    throw new Error('Image pixels could not be read. Try exporting the image as PNG.');
  }
}

function setImageFileLabel(id, file) {
  $(id).textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
}

async function loadPairIfReady() {
  if (!imageState.original || !imageState.stego) return;
  clearError('image-error');
  try {
    const [original, stego] = await Promise.all([
      createImageBitmap(imageState.original),
      createImageBitmap(imageState.stego)
    ]);
    if (original.width !== stego.width || original.height !== stego.height) {
      const dimensions = `Image dimensions must match. Original: ${original.width} × ${original.height}; stego: ${stego.width} × ${stego.height}.`;
      original.close();
      stego.close();
      throw new Error(dimensions);
    }
    if (original.width * original.height > MAX_PIXELS) {
      original.close();
      stego.close();
      throw new Error('These images exceed the 12-megapixel analysis limit. Use smaller images to avoid browser memory issues.');
    }
    const originalPixels = bitmapPixels(original);
    const stegoPixels = bitmapPixels(stego);
    imageState.width = original.width;
    imageState.height = original.height;
    imageState.originalPixels = originalPixels;
    imageState.stegoPixels = stegoPixels;
    $('original-canvas').width = original.width;
    $('original-canvas').height = original.height;
    $('original-canvas').getContext('2d').drawImage(original, 0, 0);
    $('stego-canvas').width = stego.width;
    $('stego-canvas').height = stego.height;
    $('stego-canvas').getContext('2d').drawImage(stego, 0, 0);
    $('stego-canvas').style.clipPath = 'inset(0 0 0 50%)';
    $('comparison-card').hidden = false;
    $('image-tools').hidden = false;
    $('slider-divider').style.left = '50%';
    $('image-slider').value = '50';
    $('original-canvas').hidden = false;
    $('stego-canvas').hidden = false;
    $('heatmap-canvas').hidden = true;
    $('heatmap-note').hidden = true;
    document.querySelectorAll('.view-switch button').forEach(button => button.classList.toggle('active', button.dataset.view === 'slider'));
    $('image-stage').style.cursor = 'crosshair';
    drawHeatmap();
    calculateStatistics();
    drawBitplane();
    drawHistogram();
    original.close();
    stego.close();
  } catch (error) {
    console.error('Image comparison failed:', error);
    showError('image-error', error.message);
    $('comparison-card').hidden = true;
    $('image-tools').hidden = true;
  }
}

for (const [inputId, labelId, key] of [['original-input', 'original-file-label', 'original'], ['stego-input', 'stego-file-label', 'stego']]) {
  $(inputId).addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('image-error', 'Choose an image file. The Inspector Lab compares decoded image pixels.');
      return;
    }
    imageState[key] = file;
    setImageFileLabel(labelId, file);
    loadPairIfReady();
  });
}

for (const [inputId, labelId, key] of [['original-input', 'original-file-label', 'original'], ['stego-input', 'stego-file-label', 'stego']]) {
  const label = $(inputId).closest('.lab-upload');
  for (const eventName of ['dragenter', 'dragover']) label.addEventListener(eventName, event => {
    event.preventDefault();
    label.classList.add('dragover');
  });
  for (const eventName of ['dragleave', 'drop']) label.addEventListener(eventName, event => {
    event.preventDefault();
    label.classList.remove('dragover');
  });
  label.addEventListener('drop', event => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('image-error', 'Choose an image file. The Inspector Lab compares decoded image pixels.');
      return;
    }
    imageState[key] = file;
    setImageFileLabel(labelId, file);
    loadPairIfReady();
  });
}

function drawHeatmap() {
  const {width, height, originalPixels: before, stegoPixels: after} = imageState;
  const canvas = $('heatmap-canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  for (let i = 0; i < before.length; i += 4) {
    const changed = before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2];
    image.data[i] = Math.min(255, Math.abs(before[i] - after[i]) * 255);
    image.data[i + 1] = Math.min(255, Math.abs(before[i + 1] - after[i + 1]) * 255);
    image.data[i + 2] = Math.min(255, Math.abs(before[i + 2] - after[i + 2]) * 255);
    if (changed && image.data[i] + image.data[i + 1] + image.data[i + 2] === 0) image.data[i] = 255;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function getPayloadLength(pixels) {
  if (!pixels || pixels.length < 36 * 8 / 3 * 4) return null;
  const header = new Uint8Array(36);
  for (let bit = 0; bit < 36 * 8; bit++) {
    const channel = Math.floor(bit / 3) * 4 + bit % 3;
    header[bit >> 3] |= (pixels[channel] & 1) << (7 - (bit & 7));
  }
  if (header[0] !== 0x57 || header[1] !== 0x50 || header[2] !== 0x58 || header[3] !== 0x32) return null;
  return new DataView(header.buffer).getUint32(32);
}

function calculateStatistics() {
  const {width, height, originalPixels: before, stegoPixels: after} = imageState;
  let changedPixels = 0;
  let sumSquared = 0;
  let maxDifference = 0;
  const totalPixels = width * height;
  for (let i = 0; i < before.length; i += 4) {
    let changed = false;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(before[i + channel] - after[i + channel]);
      if (delta) changed = true;
      sumSquared += delta * delta;
      maxDifference = Math.max(maxDifference, delta);
    }
    if (changed) changedPixels++;
  }
  const mse = sumSquared / (totalPixels * 3);
  const psnr = mse === 0 ? '∞ dB' : `${(10 * Math.log10((255 ** 2) / mse)).toFixed(2)} dB`;
  $('stat-changed').textContent = `${changedPixels.toLocaleString()} / ${totalPixels.toLocaleString()}`;
  $('stat-percent').textContent = `${(changedPixels / totalPixels * 100).toFixed(4)}%`;
  $('stat-mse').textContent = mse.toFixed(6);
  $('stat-psnr').textContent = psnr;
  $('stat-max').textContent = `${maxDifference} / 255`;
  const payloadBytes = getPayloadLength(after);
  const capacityBytes = Math.max(0, Math.floor((totalPixels * 3 - 36 * 8) / 8));
  $('stat-capacity').textContent = payloadBytes === null ? 'Header not recognized' : `${payloadBytes.toLocaleString()} / ${capacityBytes.toLocaleString()} B`;
}

function drawBitplane() {
  if (!imageState.stegoPixels) return;
  const {width, height} = imageState;
  const pixels = $('bit-stego').checked ? imageState.stegoPixels : imageState.originalPixels;
  const channel = Number($('bit-channel').value);
  const bit = Number($('bit-number').value);
  const canvas = $('bitplane-view');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 4) {
    const value = pixels[i + channel] & (1 << bit) ? 255 : 0;
    image.data[p] = value;
    image.data[p + 1] = value;
    image.data[p + 2] = value;
    image.data[p + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}
['bit-channel', 'bit-number', 'bit-stego'].forEach(id => $(id).addEventListener('change', drawBitplane));

function drawHistogram() {
  const canvas = $('histogram-canvas');
  const context = canvas.getContext('2d');
  const width = canvas.width = 720;
  const height = canvas.height = 175;
  context.clearRect(0, 0, width, height);
  const colors = ['#ff647b', '#64dda6', '#7da9ff'];
  for (let channel = 0; channel < 3; channel++) {
    for (const [pixels, dashed, alpha] of [[imageState.originalPixels, true, .38], [imageState.stegoPixels, false, .5]]) {
      const bins = new Uint32Array(256);
      for (let i = channel; i < pixels.length; i += 4) bins[pixels[i]]++;
      const max = Math.max(1, ...bins);
      context.beginPath();
      context.strokeStyle = colors[channel];
      context.globalAlpha = alpha;
      context.lineWidth = dashed ? 1 : 1.2;
      context.setLineDash(dashed ? [4, 4] : []);
      for (let x = 0; x < 256; x++) {
        const y = height - 5 - bins[x] / max * (height - 12);
        if (x === 0) context.moveTo(0, y);
        else context.lineTo(x / 255 * width, y);
      }
      context.stroke();
    }
  }
  context.globalAlpha = 1;
  context.setLineDash([]);
}

$('image-slider').addEventListener('input', event => {
  const percent = Number(event.target.value);
  $('stego-canvas').style.clipPath = `inset(0 0 0 ${percent}%)`;
  $('slider-divider').style.left = `${percent}%`;
});
document.querySelectorAll('.view-switch button').forEach(button => button.addEventListener('click', () => {
  imageState.view = button.dataset.view;
  document.querySelectorAll('.view-switch button').forEach(item => item.classList.toggle('active', item === button));
  const heatmap = imageState.view === 'heatmap';
  $('original-canvas').hidden = heatmap;
  $('stego-canvas').hidden = heatmap;
  $('slider-divider').hidden = heatmap;
  $('image-slider').hidden = heatmap;
  $('heatmap-canvas').hidden = !heatmap;
  $('heatmap-note').hidden = !heatmap;
}));

function displayPixel(event) {
  if (!imageState.originalPixels) return;
  const rect = $('image-stage').getBoundingClientRect();
  const scale = Math.min(rect.width / imageState.width, rect.height / imageState.height);
  const drawnWidth = imageState.width * scale;
  const drawnHeight = imageState.height * scale;
  const offsetX = (rect.width - drawnWidth) / 2;
  const offsetY = (rect.height - drawnHeight) / 2;
  const x = Math.floor((event.clientX - rect.left - offsetX) / scale);
  const y = Math.floor((event.clientY - rect.top - offsetY) / scale);
  if (x < 0 || y < 0 || x >= imageState.width || y >= imageState.height) return;
  const index = (y * imageState.width + x) * 4;
  const before = imageState.originalPixels;
  const after = imageState.stegoPixels;
  $('pixel-coordinate').textContent = `x: ${x}, y: ${y}`;
  const valueMarkup = CHANNELS.map((channel, offset) => {
    const a = before[index + offset], b = after[index + offset];
    const binaryA = a.toString(2).padStart(8, '0');
    const binaryB = b.toString(2).padStart(8, '0');
    const bits = [...binaryB].map((bit, i) => bit === binaryA[i] ? bit : `<span class="binary-highlight">${bit}</span>`).join('');
    return `${channel}: ${a} (${binaryA}) → ${b} (${bits})`;
  }).join('<br>');
  $('pixel-values').innerHTML = valueMarkup;
  const zoom = $('zoom-canvas');
  const zoomContext = zoom.getContext('2d');
  zoomContext.clearRect(0, 0, zoom.width, zoom.height);
  const startX = Math.max(0, Math.min(imageState.width - 9, x - 4));
  const startY = Math.max(0, Math.min(imageState.height - 9, y - 4));
  const patch = document.createElement('canvas');
  patch.width = 9;
  patch.height = 9;
  const patchContext = patch.getContext('2d');
  for (let row = 0; row < 9; row++) for (let column = 0; column < 9; column++) {
    const px = Math.min(imageState.width - 1, startX + column);
    const py = Math.min(imageState.height - 1, startY + row);
    const at = (py * imageState.width + px) * 4;
    const isChanged = before[at] !== after[at] || before[at + 1] !== after[at + 1] || before[at + 2] !== after[at + 2];
    zoomContext.fillStyle = `rgb(${before[at]},${before[at + 1]},${before[at + 2]})`;
    zoomContext.fillRect(column * 20, row * 20, 20, 20);
    if (isChanged) {
      zoomContext.strokeStyle = '#ffdb62';
      zoomContext.lineWidth = 2;
      zoomContext.strokeRect(column * 20 + 1, row * 20 + 1, 18, 18);
    }
  }
  zoomContext.strokeStyle = '#ad8cff';
  zoomContext.lineWidth = 2;
  zoomContext.strokeRect((x - startX) * 20 + 2, (y - startY) * 20 + 2, 16, 16);
}
$('image-stage').addEventListener('pointermove', displayPixel);
$('image-stage').addEventListener('pointerleave', () => { $('pixel-coordinate').textContent = 'x: —, y: —'; });

function markerName(character) {
  return {'\u2063': ['START', 'marker-start'], '\u200b': ['U+200B', 'marker-zero'], '\u200c': ['U+200C', 'marker-one'], '\u2064': ['END', 'marker-end']}[character];
}

function appendVisibleCharacters(container, text, showInvisible) {
  const fragment = document.createDocumentFragment();
  for (const character of text.slice(0, 20000)) {
    const marker = markerName(character);
    if (marker && showInvisible) {
      const badge = document.createElement('span');
      badge.className = `badge-marker ${marker[1]}`;
      badge.textContent = marker[0];
      badge.title = `${marker[0]} · ${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
      fragment.appendChild(badge);
    } else {
      fragment.appendChild(document.createTextNode(character));
    }
  }
  if (text.length > 20000) fragment.appendChild(document.createTextNode(`… (${text.length - 20000} more characters not displayed)`));
  container.replaceChildren(fragment);
}

function visibleLength(text) {
  return [...text].filter(character => !markerName(character)).length;
}

function renderTextDiff(original, stego) {
  const visibleStego = [...stego].filter(character => !markerName(character)).join('');
  const originalChars = [...original];
  const stegoChars = [...visibleStego];
  let prefix = 0;
  while (prefix < originalChars.length && prefix < stegoChars.length && originalChars[prefix] === stegoChars[prefix]) prefix++;
  let suffix = 0;
  while (suffix < originalChars.length - prefix && suffix < stegoChars.length - prefix && originalChars[originalChars.length - 1 - suffix] === stegoChars[stegoChars.length - 1 - suffix]) suffix++;
  $('diff-original').textContent = original;
  const fragment = document.createDocumentFragment();
  let visibleIndex = 0;
  let markerCount = 0;
  for (const character of [...stego].slice(0, 20000)) {
    const info = markerName(character);
    if (info) {
      if (markerCount++ >= 5000) continue;
      const badge = document.createElement('span');
      badge.className = `badge-marker ${info[1]}`;
      badge.textContent = info[0];
      fragment.appendChild(badge);
    } else {
      const node = document.createTextNode(character);
      if (visibleIndex >= prefix && visibleIndex < stegoChars.length - suffix) {
        const insertion = document.createElement('span');
        insertion.className = 'diff-insert';
        insertion.appendChild(node);
        fragment.appendChild(insertion);
      } else {
        fragment.appendChild(node);
      }
      visibleIndex++;
    }
  }
  const marks = [...stego].filter(character => markerName(character)).length;
  if (marks > 5000) fragment.appendChild(document.createTextNode(`… ${marks - 5000} more hidden markers`));
  if (stego.length > 20000) fragment.appendChild(document.createTextNode(`… (${stego.length - 20000} more characters not displayed)`));
  $('diff-stego').replaceChildren(fragment);
}

function renderByteStrip(bytes) {
  const target = $('binary-strip');
  const shown = bytes.subarray(0, 96);
  const fragment = document.createDocumentFragment();
  for (let offset = 0; offset < shown.length; offset++) {
    const byte = shown[offset];
    const group = document.createElement('span');
    group.className = 'byte-group';
    const binary = document.createElement('code');
    binary.textContent = byte.toString(2).padStart(8, '0');
    const hex = document.createElement('small');
    hex.textContent = byte.toString(16).padStart(2, '0').toUpperCase();
    const char = document.createElement('small');
    char.textContent = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '·';
    char.title = 'Printable ASCII only; encrypted bytes are not message characters';
    group.append(binary, hex, char);
    fragment.appendChild(group);
  }
  target.replaceChildren(fragment);
  $('binary-summary').textContent = `${bytes.length.toLocaleString()} bytes${bytes.length > shown.length ? ` · first ${shown.length} shown` : ''}`;
}

$('inspect-text-button').addEventListener('click', () => {
  clearError('text-error');
  const original = $('plain-text-input').value;
  const stego = $('stego-text-input').value;
  $('text-counts').textContent = `Visible length: ${visibleLength(stego).toLocaleString()} · Real length: ${[...stego].length.toLocaleString()} · Hidden marks: ${([...stego].length - visibleLength(stego)).toLocaleString()}`;
  if (!stego) {
    showError('text-error', 'Paste the text you want to inspect first.');
    $('text-results').hidden = true;
    return;
  }
  const marks = [...stego].filter(character => markerName(character));
  $('marker-count').textContent = `${marks.length.toLocaleString()} markers`;
  appendVisibleCharacters($('revealed-invisibles'), stego, true);
  renderTextDiff(original, stego);
  const decoded = decodeInvisible(stego);
  if (decoded) {
    renderByteStrip(decoded);
    $('text-results').hidden = false;
  } else {
    renderByteStrip(new Uint8Array());
    $('text-results').hidden = false;
    showError('text-error', 'No complete Whisper Pixels zero-width payload was detected. Visible markers may still be present, but the start/end delimiters or byte sequence are incomplete.');
  }
});

function toHex(bytes, limit = 128) {
  const output = [...bytes.subarray(0, limit)].map(byte => byte.toString(16).padStart(2, '0')).join(' ');
  return bytes.length > limit ? `${output} … (${bytes.length - limit} more bytes)` : output;
}

function drawLandingMap(seed, bitCount) {
  const canvas = $('landing-map');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#12111b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let state = seed || 0x6d2b79f5;
  context.fillStyle = '#ad8cff';
  const count = Math.min(140, bitCount);
  for (let i = 0; i < count; i++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const x = (state >>> 0) % canvas.width;
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const y = (state >>> 0) % canvas.height;
    context.globalAlpha = .25 + (i % 6) * .12;
    context.fillRect(x, y, 3, 3);
  }
  context.globalAlpha = 1;
}

async function encryptDemo(message) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const keyInfo = await deriveKey($('demo-password').value, salt);
  const plaintext = new TextEncoder().encode(message);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, keyInfo.key, plaintext));
  return {salt, iv, keyInfo, plaintext, ciphertext};
}

$('run-demo').addEventListener('click', async () => {
  clearError('crypto-error');
  const message = $('demo-message').value;
  const password = $('demo-password').value;
  if (!message) {
    showError('crypto-error', 'Enter a short plaintext message for the demonstration.');
    return;
  }
  if (!password) {
    showError('crypto-error', 'Enter a demo password to derive a key.');
    return;
  }
  if (new TextEncoder().encode(message).length > 256) {
    showError('crypto-error', 'Keep demo messages under 256 UTF-8 bytes so the visualization remains easy to inspect.');
    return;
  }
  $('run-demo').disabled = true;
  $('run-demo').textContent = 'Deriving key…';
  try {
    const result = await encryptDemo(message);
    demoState = result;
    $('pipe-plain').textContent = message;
    $('pipe-bytes').textContent = `${toHex(result.plaintext)}\n${[...result.plaintext].map(byte => byte.toString(2).padStart(8, '0')).join(' ')}`;
    $('pipe-fingerprint').textContent = result.keyInfo.fingerprint;
    $('pipe-cipher').textContent = `${toHex(result.ciphertext)}\n${result.ciphertext.length.toLocaleString()} encrypted bytes (includes 16-byte GCM authentication tag)`;
    $('pipe-bits').textContent = [...result.ciphertext.subarray(0, 16)].map(byte => byte.toString(2).padStart(8, '0')).join(' ') + (result.ciphertext.length > 16 ? ' …' : '');
    drawLandingMap(result.keyInfo.seed, result.ciphertext.length * 8);
    $('pipeline').hidden = false;
    $('demo-extras').hidden = false;
    $('changed-message').value = message;
    $('avalanche-result').textContent = '';
    $('avalanche-score').textContent = '';
    $('wrong-result').textContent = '';
  } catch (error) {
    console.error('Encryption demo failed:', error);
    showError('crypto-error', `The local demo failed: ${error.message}`);
  } finally {
    $('run-demo').disabled = false;
    $('run-demo').textContent = 'Run local demo';
  }
});

$('compare-avalanche').addEventListener('click', async () => {
  if (!demoState) {
    showError('crypto-error', 'Run the pipeline demo first.');
    return;
  }
  const changed = $('changed-message').value;
  if (!changed || changed === $('demo-message').value) {
    showError('crypto-error', 'Change at least one character in the plaintext to compare avalanche effects.');
    return;
  }
  if (new TextEncoder().encode(changed).length > 256) {
    showError('crypto-error', 'Keep the changed message under 256 UTF-8 bytes.');
    return;
  }
  try {
    const changedBytes = new TextEncoder().encode(changed);
    const freshIv = randomBytes(12);
    const freshSalt = randomBytes(16);
    const freshKey = await deriveKey($('demo-password').value, freshSalt);
    const second = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: freshIv}, freshKey.key, changedBytes));
    const maxLength = Math.max(second.length, demoState.ciphertext.length);
    let differentBits = 0;
    for (let i = 0; i < maxLength; i++) {
      const difference = (second[i] || 0) ^ (demoState.ciphertext[i] || 0);
      differentBits += difference.toString(2).replaceAll('0', '').length;
    }
    const totalBits = maxLength * 8;
    $('avalanche-score').textContent = `${differentBits.toLocaleString()} / ${totalBits.toLocaleString()} bits changed`;
    $('avalanche-result').textContent = `Original ciphertext: ${toHex(demoState.ciphertext, 48)}\nChanged ciphertext:  ${toHex(second, 48)}\n${(differentBits / totalBits * 100).toFixed(1)}% of compared ciphertext bits differ. Each run uses a fresh salt and nonce for safety, so those random values also contribute to the change.`;
  } catch (error) {
    console.error('Avalanche comparison failed:', error);
    showError('crypto-error', `Avalanche comparison failed: ${error.message}`);
  }
});

$('wrong-password-demo').addEventListener('click', async () => {
  if (!demoState) {
    showError('crypto-error', 'Run the pipeline demo first.');
    return;
  }
  try {
    const wrongKey = await deriveKey('definitely-not-the-demo-password', demoState.salt);
    await crypto.subtle.decrypt({name: 'AES-GCM', iv: demoState.iv}, wrongKey.key, demoState.ciphertext);
    $('wrong-result').textContent = 'Unexpectedly authenticated. Reset the demo and try again.';
  } catch (error) {
    if (error.name === 'OperationError') {
      $('wrong-result').textContent = 'Authentication failed. AES-GCM refuses to produce plaintext with the wrong password—there is no plausible-looking “garbage output.”';
    } else {
      console.error('Wrong-password demonstration failed:', error);
      $('wrong-result').textContent = `The demo could not run: ${error.message}`;
    }
  }
});
