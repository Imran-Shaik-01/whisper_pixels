import {HEADER_SIZE, decryptBytes, decryptWithKey, deriveKey, encryptBytes, makeHeader, parseHeader} from './crypto.js';
import {decodeInvisible, encodeInvisible} from './zerowidth.js';

(() => {
  'use strict';

  const MAX_IMAGE_SIZE = 40 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 12000000;
  const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder('utf-8', {fatal: true});
  const $ = id => document.getElementById(id);
  const state = {mode: 'hide', carrier: 'image', step: 1, busy: false, selectionId: 0, image: null, imageUrl: null, revealImage: null, attachment: null, resultUrl: null};

  const setThemeButton = () => {
    const light = document.documentElement.classList.contains('light-mode');
    $('theme-toggle').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
    $('theme-toggle').title = `Switch to ${light ? 'dark' : 'light'} theme`;
    $('theme-toggle').innerHTML = light ? '<span aria-hidden="true">☾</span>' : '<span aria-hidden="true">☼</span>';
  };
  setThemeButton();
  $('theme-toggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('light-mode');
    localStorage.setItem('theme', document.documentElement.classList.contains('light-mode') ? 'light' : 'dark');
    setThemeButton();
  });

  function toast(message) {
    let node = document.querySelector('.toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      node.setAttribute('role', 'status');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    window.clearTimeout(toast.timeout);
    toast.timeout = window.setTimeout(() => node.classList.remove('show'), 2600);
  }

  function setError(message) {
    $('alert').textContent = message;
    $('alert').classList.remove('success');
    $('alert').hidden = false;
    $('result').hidden = true;
    $('compare-panel').hidden = true;
  }

  function setSuccess(message) {
    $('alert').textContent = message;
    $('alert').classList.add('success');
    $('alert').hidden = false;
  }

  function setOperationBusy(busy) {
    state.busy = busy;
    $('go-button').disabled = busy;
    document.querySelectorAll('.mode-choice, .carrier-tab, #clear-image, #remove-attachment, #hide-fields input, #hide-fields textarea, #cover-text, #image-input, #attachment-input, #reveal-fields input, #reveal-input, #reveal-text').forEach(control => {
      control.disabled = busy;
    });
  }

  function clearFeedback() {
    $('alert').hidden = true;
    $('alert').classList.remove('success');
    $('result').hidden = true;
  }

  function showProgress(value, label) {
    $('progress-wrap').hidden = false;
    $('progress-bar').value = Math.max(0, Math.min(100, value));
    $('progress-percent').textContent = `${Math.round(value)}%`;
    $('progress-label').textContent = label;
  }

  function finishProgress() {
    $('progress-wrap').hidden = true;
    $('progress-bar').value = 0;
  }

  function setStep(step) {
    state.step = step;
    document.querySelectorAll('[data-step-indicator]').forEach(el => {
      const number = Number(el.dataset.stepIndicator);
      el.classList.toggle('active', number === step);
      el.classList.toggle('done', number < step);
    });
    if (state.mode === 'hide') {
      $('step-kicker').textContent = step === 1 ? 'STEP 01 — CHOOSE A CARRIER' : step === 2 ? 'STEP 02 — WRITE & PROTECT' : 'STEP 03 — DOWNLOAD & VERIFY';
      $('workspace-title').textContent = step === 1 ? 'Choose what to hide in' : step === 2 ? 'Write message and password' : 'Your secret is ready';
      $('divider-label').textContent = step === 1 ? 'YOUR SECRET' : 'MESSAGE & SECURITY';
      $('hide-fields').hidden = step !== 2;
      $('go-button').hidden = step === 3;
      $('go-button').innerHTML = step === 1 ? 'Continue to message <span aria-hidden="true">→</span>' : 'Encrypt, verify & download <span aria-hidden="true">→</span>';
      $('result').hidden = step !== 3 && $('result').hidden;
    } else {
      $('step-kicker').textContent = step === 1 ? 'STEP 01 — CHOOSE A CARRIER' : step === 2 ? 'STEP 02 — ENTER PASSWORD' : 'STEP 03 — REVEAL';
      $('workspace-title').textContent = step === 1 ? 'Choose the stego image or text' : step === 2 ? 'Enter the password' : 'Your secret is revealed';
      $('divider-label').textContent = 'REVEAL YOUR SECRET';
      $('reveal-fields').hidden = step !== 2;
      $('go-button').hidden = step === 3;
      $('go-button').innerHTML = step === 1 ? 'Continue to password <span aria-hidden="true">→</span>' : 'Reveal secret <span aria-hidden="true">→</span>';
    }
  }

  function setMode(mode) {
    state.mode = mode;
    $('hide-mode').classList.toggle('active', mode === 'hide');
    $('reveal-mode').classList.toggle('active', mode === 'reveal');
    $('hide-mode').setAttribute('aria-pressed', String(mode === 'hide'));
    $('reveal-mode').setAttribute('aria-pressed', String(mode === 'reveal'));
    $('image-carrier').hidden = mode === 'reveal' || state.carrier !== 'image';
    $('text-carrier').hidden = mode === 'reveal' || state.carrier !== 'text';
    $('reveal-panel').hidden = mode !== 'reveal';
    $('carrier-tabs').hidden = mode === 'reveal';
    $('hide-fields').hidden = mode !== 'hide' || state.step !== 2;
    $('reveal-fields').hidden = mode !== 'reveal' || state.step !== 2;
    $('result').hidden = true;
    $('compare-panel').hidden = true;
    $('go-button').hidden = false;
    clearFeedback();
    setStep(1);
    updateCapacity();
  }

  document.querySelectorAll('.mode-choice').forEach(button => button.addEventListener('click', () => {
    if (!state.busy) setMode(button.id === 'hide-mode' ? 'hide' : 'reveal');
  }));
  document.querySelectorAll('.carrier-tab').forEach(button => button.addEventListener('click', () => {
    if (state.busy) return;
    state.carrier = button.dataset.carrier;
    document.querySelectorAll('.carrier-tab').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    $('image-carrier').hidden = state.carrier !== 'image';
    $('text-carrier').hidden = state.carrier !== 'text';
    updateCapacity();
    clearFeedback();
  }));

  function bytesToSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatCount(count) {
    return new Intl.NumberFormat().format(count);
  }

  function passwordStrength(password) {
    return !password ? 0 : Math.min(4, [password.length >= 8, password.length >= 13, /[A-Z]/.test(password) && /[a-z]/.test(password), /\d/.test(password) && /[^A-Za-z0-9]/.test(password)].filter(Boolean).length);
  }

  function countCodePoints(value) {
    let count = 0;
    for (let index = 0; index < value.length; index++, count++) {
      if (value.codePointAt(index) > 0xffff) index++;
    }
    return count;
  }

  function countTextContent(value) {
    let visible = 0;
    let markers = 0;
    for (const character of value) {
      if (/[\u200b\u200c\u2063\u2064]/u.test(character)) markers++;
      else visible++;
    }
    return {visible, markers};
  }

  function sampleTextMarkers(value) {
    const samples = [];
    for (const character of value) {
      if (!/[\u200b\u200c\u2063\u2064]/u.test(character)) continue;
      samples.push({codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`, bit: character === '\u200c' ? '1' : character === '\u200b' ? '0' : 'frame'});
      if (samples.length === 5) break;
    }
    return samples;
  }

  function messagePreview(message) {
    let preview = '';
    let count = 0;
    for (const character of message) {
      if (count++ === 120) return `${preview}…`;
      preview += character;
    }
    return preview;
  }

  function createExplainReport({message, password, method, direction, payloadBits, capacityBits, sourceFormat, width, height, samples = [], sampleBits = '', coverPreview = '', coverChars = 0, stegoChars = 0, markerCount = 0, attachmentBytes = 0, encryption = true}) {
    const messageBytes = textEncoder.encode(message);
    return {
      version: 1,
      method,
      direction,
      messagePreview: messagePreview(message),
      messageChars: countCodePoints(message),
      messageBytes: messageBytes.length,
      messageBits: [...messageBytes.subarray(0, 7)].map(byte => byte.toString(2).padStart(8, '0')).join(' '),
      encryption: encryption ? {algo: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iterations: 310000} : null,
      payloadBits,
      capacityBits,
      usedPercent: capacityBits ? payloadBits / capacityBits * 100 : 0,
      totalPixels: width && height ? width * height : 0,
      width: width || 0,
      height: height || 0,
      samples,
      sampleBits,
      coverPreview: messagePreview(coverPreview),
      coverChars,
      stegoChars,
      markerCount,
      attachmentBytes,
      sourceFormat: sourceFormat || '',
      passwordStrength: password ? passwordStrength(password) : null
    };
  }

  function addExplainLink(report) {
    const link = document.createElement('a');
    link.href = 'inspector.html#explain';
    link.className = 'explain-result-link';
    link.textContent = '✨ Explain what happened';
    link.addEventListener('click', event => {
      try {
        sessionStorage.setItem('whisperPixelsExplainReport', JSON.stringify(report));
      } catch (error) {
        event.preventDefault();
        setError(`Could not prepare the local explainer report: ${error.message}`);
      }
    });
    $('result-actions').append(link);
  }

  function updateCapacity() {
    $('capacity-panel').hidden = !state.image;
    if (!state.image) return;
    const carrierBytes = Math.max(0, Math.floor((state.image.width * state.image.height * 3 - HEADER_SIZE * 8) / 8) - 16);
    const approximateChars = Math.floor(carrierBytes / 1.4);
    const messageBytes = textEncoder.encode($('secret-message').value).length;
    const attachmentBytes = state.attachment?.size || 0;
    const usedBytes = messageBytes + attachmentBytes + 32;
    $('capacity-copy').textContent = `~${formatCount(approximateChars)} characters · ${formatCount([...$('secret-message').value].length)} + ${bytesToSize(attachmentBytes)} used`;
    $('capacity-fill').style.width = `${Math.min(100, Math.max(0, usedBytes / Math.max(1, carrierBytes) * 100))}%`;
    $('capacity-fill').style.background = usedBytes > carrierBytes ? 'var(--danger)' : 'var(--green)';
  }

  function drawBitplane(bitmap) {
    const canvas = $('bitplane-canvas');
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const scratch = document.createElement('canvas');
    scratch.width = 240;
    scratch.height = 120;
    const scratchContext = scratch.getContext('2d', {willReadFrequently: true});
    scratchContext.drawImage(bitmap, 0, 0, scratch.width, scratch.height);
    const pixels = scratchContext.getImageData(0, 0, scratch.width, scratch.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = pixels.data[i] & 1 ? 245 : 18;
      pixels.data[i + 1] = pixels.data[i + 1] & 1 ? 175 : 24;
      pixels.data[i + 2] = pixels.data[i + 2] & 1 ? 255 : 35;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  }

  async function selectImage(file, reveal = false) {
    if (!file) return;
    const selectionId = ++state.selectionId;
    clearFeedback();
    if (reveal) {
      state.revealImage = null;
      $('reveal-meta').hidden = true;
    } else {
      state.image = null;
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = null;
      $('image-preview').hidden = true;
      $('image-dropzone').hidden = false;
      $('capacity-panel').hidden = true;
      $('visual-tools').hidden = true;
    }
    if (!file.type.startsWith('image/')) {
      setError('This file is not an image. Choose a PNG, JPEG, WebP or BMP image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError(`This image is too large (${bytesToSize(file.size)}). Choose an image smaller than 40 MB.`);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (selectionId !== state.selectionId) {
        bitmap.close();
        return;
      }
      if (bitmap.width < 16 || bitmap.height < 16) {
        bitmap.close();
        setError('This image is too small. Choose an image at least 16 × 16 pixels.');
        return;
      }
      if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
        bitmap.close();
        setError('This image has too many pixels for safe browser processing. Choose an image below 12 megapixels.');
        return;
      }
      if (reveal) {
        state.revealImage = file;
        $('reveal-name').textContent = file.name;
        $('reveal-details').textContent = `${bitmap.width} × ${bitmap.height} · ${bytesToSize(file.size)} · ${file.type || 'unknown format'}`;
        $('reveal-meta').hidden = false;
      } else {
        state.image = {file, width: bitmap.width, height: bitmap.height};
        if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
        state.imageUrl = URL.createObjectURL(file);
        $('cover-preview').src = state.imageUrl;
        $('cover-name').textContent = file.name;
        $('cover-details').textContent = `${bitmap.width} × ${bitmap.height} · ${bytesToSize(file.size)} · ${file.type || 'unknown format'}`;
        $('image-preview').hidden = false;
        $('image-dropzone').hidden = true;
        $('capacity-panel').hidden = false;
        $('visual-tools').hidden = false;
        drawBitplane(bitmap);
        updateCapacity();
      }
      bitmap.close();
    } catch (error) {
      console.error('Image could not be opened:', error);
      setError('This image could not be opened by your browser. Try exporting it as PNG first.');
    }
  }

  $('image-input').addEventListener('change', event => selectImage(event.target.files[0]));
  $('reveal-input').addEventListener('change', event => selectImage(event.target.files[0], true));
  $('clear-image').addEventListener('click', () => {
    state.image = null;
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    state.imageUrl = null;
    $('cover-preview').removeAttribute('src');
    $('image-input').value = '';
    $('image-preview').hidden = true;
    $('image-dropzone').hidden = false;
    $('visual-tools').hidden = true;
    $('capacity-panel').hidden = true;
    clearFeedback();
  });

  for (const [zoneId, inputId, reveal] of [['image-dropzone', 'image-input', false], ['reveal-dropzone', 'reveal-input', true]]) {
    const zone = $(zoneId);
    for (const eventName of ['dragenter', 'dragover']) zone.addEventListener(eventName, event => {
      event.preventDefault();
      zone.classList.add('dragover');
    });
    for (const eventName of ['dragleave', 'drop']) zone.addEventListener(eventName, event => {
      event.preventDefault();
      zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', event => selectImage(event.dataTransfer.files[0], reveal));
    zone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        $(inputId).click();
      }
    });
  }

  $('attachment-input').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      event.target.value = '';
      setError(`That file is too large (${bytesToSize(file.size)}). Attachments are limited to 20 MB.`);
      return;
    }
    state.attachment = file;
    $('attachment-meta').textContent = `${file.name} · ${bytesToSize(file.size)} · ${file.type || 'unknown type'}`;
    $('attachment-meta').hidden = false;
    $('remove-attachment').hidden = false;
    updateCapacity();
    clearFeedback();
  });
  $('remove-attachment').addEventListener('click', () => {
    state.attachment = null;
    $('attachment-input').value = '';
    $('attachment-meta').hidden = true;
    $('remove-attachment').hidden = true;
    updateCapacity();
  });

  $('secret-message').addEventListener('input', () => {
    const length = [...$('secret-message').value].length;
    $('message-count').textContent = `${formatCount(length)} character${length === 1 ? '' : 's'}`;
    updateCapacity();
  });
  $('hide-password').addEventListener('input', () => {
    const password = $('hide-password').value;
    const score = passwordStrength(password);
    $('strength-fill').style.width = `${score * 25}%`;
    $('strength-fill').style.background = score < 2 ? 'var(--danger)' : score < 4 ? 'var(--warn)' : 'var(--green)';
    $('strength-label').textContent = ['Password strength', 'Weak — use 8+ characters', 'Fair — add more variety', 'Good password', 'Strong passphrase'][score];
  });
  document.querySelectorAll('.show-password').forEach(button => button.addEventListener('click', () => {
    const input = $(button.dataset.target);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
  }));

  function createPlaintext(message, fileName, mimeType, expiry, fileBytes) {
    const msg = textEncoder.encode(message);
    const name = textEncoder.encode(fileName);
    const mime = textEncoder.encode(mimeType);
    const expiryBytes = textEncoder.encode(expiry);
    if (name.length > 65535 || mime.length > 65535 || expiryBytes.length > 65535) throw new Error('The attachment metadata is too long.');
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    header[0] = 1;
    view.setUint32(1, msg.length);
    view.setUint16(5, name.length);
    view.setUint16(7, mime.length);
    view.setUint16(9, expiryBytes.length);
    view.setUint16(11, 0);
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, fileBytes.length);
    const output = new Uint8Array(header.length + size.length + msg.length + name.length + mime.length + expiryBytes.length + fileBytes.length);
    let offset = 0;
    for (const part of [header, size, msg, name, mime, expiryBytes, fileBytes]) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function parsePlaintext(bytes) {
    if (bytes.length < 17 || bytes[0] !== 1) throw new Error('The hidden payload is damaged or uses an unsupported format.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const messageLength = view.getUint32(1);
    const nameLength = view.getUint16(5);
    const mimeLength = view.getUint16(7);
    const expiryLength = view.getUint16(9);
    const fileLength = view.getUint32(13);
    let offset = 17;
    if (offset + messageLength + nameLength + mimeLength + expiryLength + fileLength !== bytes.length) throw new Error('The hidden payload is incomplete or damaged.');
    const readText = length => {
      const result = textDecoder.decode(bytes.subarray(offset, offset + length));
      offset += length;
      return result;
    };
    const message = readText(messageLength);
    const fileName = readText(nameLength);
    const mimeType = readText(mimeLength);
    const expiry = readText(expiryLength);
    const fileBytes = bytes.slice(offset);
    return {message, fileName, mimeType, expiry, fileBytes};
  }

  function equalBytes(left, right) {
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
  }

  function readHeader(pixels) {
    const header = new Uint8Array(HEADER_SIZE);
    const channelCount = (pixels.length / 4) * 3;
    if (channelCount < HEADER_SIZE * 8) throw new Error('This image is too small to contain a Whisper Pixels message.');
    for (let bit = 0; bit < HEADER_SIZE * 8; bit++) {
      const channel = Math.floor(bit / 3) * 4 + bit % 3;
      header[bit >> 3] |= (pixels[channel] & 1) << (7 - (bit & 7));
    }
    return header;
  }

  function readImageData(bitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) throw new Error('Your browser could not create an image canvas.');
    context.drawImage(bitmap, 0, 0);
    let imageData;
    try {
      imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    } catch (error) {
      throw new Error('The image pixels could not be read. Try a different image.');
    }
    return {canvas, context, imageData};
  }

  function runPixelWorker(action, imageData, options, onProgress) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('js/image-worker.js');
      const pixels = imageData.data.buffer;
      const message = {
        ...options,
        bytes: options.bytes?.slice(0),
        header: options.header?.slice(0),
        action,
        pixels,
        width: imageData.width,
        height: imageData.height,
        headerBytes: HEADER_SIZE
      };
      worker.onmessage = event => {
        if (event.data.error) {
          worker.terminate();
          reject(new Error(event.data.error));
        } else if (typeof event.data.progress === 'number') {
          onProgress?.(event.data.progress);
        } else {
          worker.terminate();
          if (action === 'embed') resolve({pixels: new Uint8ClampedArray(event.data.pixels), stats: event.data.stats});
          else if (options.includeSamples) resolve({bytes: new Uint8Array(event.data.bytes), samples: event.data.samples});
          else resolve(new Uint8Array(event.data.bytes));
        }
      };
      worker.onerror = event => {
        worker.terminate();
        reject(new Error(event.message || 'The image worker stopped unexpectedly.'));
      };
      const transfers = [pixels];
      if (message.bytes) transfers.push(message.bytes);
      if (message.header) transfers.push(message.header);
      worker.postMessage(message, transfers);
    });
  }

  async function getPixelsFromFile(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      return readImageData(bitmap);
    } finally {
      bitmap?.close();
    }
  }

  async function decryptPayload(header, encrypted, password) {
    try {
      const {plaintext, seed} = await decryptBytes(password, header.salt, header.iv, encrypted);
      return {data: parsePlaintext(plaintext), seed};
    } catch (error) {
      if (error.name === 'OperationError') throw new Error('Wrong password, or the encrypted data was changed. AES-GCM could not authenticate this hidden payload.');
      if (error.message === 'The hidden payload is incomplete or damaged.' || error.message.includes('unsupported')) throw error;
      throw new Error(`Could not decrypt this payload: ${error.message}`);
    }
  }

  async function revealFromImage(file, password) {
    if (!file) throw new Error('Choose an image file to reveal a message from.');
    if (!file.type.startsWith('image/')) throw new Error('Wrong format: choose an image file (PNG recommended).');
    const {imageData} = await getPixelsFromFile(file);
    const header = parseHeader(readHeader(imageData.data));
    if (!header) throw new Error('No hidden message found in this file. Use the original Whisper Pixels PNG; compression or resizing can erase it.');
    const capacity = Math.floor(((imageData.data.length / 4) * 3 - HEADER_SIZE * 8) / 8);
    if (header.length > capacity) throw new Error('This image is too small for the payload recorded in its header, or it has been damaged.');
    showProgress(5, 'Deriving your key…');
    const {key, seed} = await deriveKey(password, header.salt);
    showProgress(17, 'Reading scattered image pixels…');
    const extracted = await runPixelWorker('extract', imageData, {length: header.length, seed, includeSamples: true}, progress => showProgress(17 + progress * 65, 'Reading scattered image pixels…'));
    const encrypted = extracted.bytes;
    showProgress(85, 'Authenticating and decrypting…');
    try {
      const data = parsePlaintext(await decryptWithKey(key, header.iv, encrypted));
      const capacityBits = Math.max(0, imageData.width * imageData.height * 3 - HEADER_SIZE * 8);
      const report = createExplainReport({
        message: data.message,
        method: 'image-lsb',
        direction: 'reveal',
        payloadBits: header.length * 8,
        capacityBits,
        sourceFormat: file.type,
        width: imageData.width,
        height: imageData.height,
        attachmentBytes: data.fileBytes.length,
        samples: extracted.samples,
        sampleBits: [...encrypted.subarray(0, 8)].map(byte => byte.toString(2).padStart(8, '0')).join(' ')
      });
      return {data, report};
    } catch (error) {
      if (error.name === 'OperationError') throw new Error('Wrong password, or the encrypted data was changed. AES-GCM could not authenticate this hidden payload.');
      throw new Error('The hidden payload is damaged or incomplete and could not be decrypted.');
    }
  }

  async function revealFromText(text, password) {
    const bytes = decodeInvisible(text);
    if (!bytes) throw new Error('No hidden message found in this text. Paste the original text including its invisible marks.');
    const header = parseHeader(bytes.subarray(0, HEADER_SIZE));
    if (!header) throw new Error('No hidden message found in this text, or its hidden marks were changed.');
    if (bytes.length !== HEADER_SIZE + header.length) throw new Error('The hidden text payload is incomplete or damaged.');
    showProgress(20, 'Deriving your key…');
    const {data} = await decryptPayload(header, bytes.subarray(HEADER_SIZE), password);
    const textStats = countTextContent(text);
    const report = createExplainReport({
      message: data.message,
      method: 'text-zero-width',
      direction: 'reveal',
      payloadBits: header.length * 8,
      capacityBits: Math.max(0, 2 * 1024 * 1024 - text.length),
      sourceFormat: 'text/plain',
      coverPreview: text.replace(/[\u200b\u200c\u2063\u2064]/gu, ''),
      coverChars: textStats.visible,
      stegoChars: textStats.visible + textStats.markers,
      markerCount: textStats.markers,
      attachmentBytes: data.fileBytes.length,
      samples: sampleTextMarkers(text),
      sampleBits: [...bytes.subarray(HEADER_SIZE, HEADER_SIZE + 8)].map(byte => byte.toString(2).padStart(8, '0')).join(' ')
    });
    return {data, report};
  }

  function showRevealed(data, report) {
    $('result').hidden = false;
    $('result-title').textContent = 'Secret revealed';
    const expired = data.expiry && new Date(`${data.expiry}T23:59:59`) < new Date();
    $('result-description').textContent = expired ? `This message has an expiry date of ${data.expiry}. Expiry is a convenience only and is not tamper-proof.` : 'The password authenticated successfully. Your message is shown below.';
    $('revealed-message').hidden = !data.message;
    $('revealed-message').textContent = data.message;
    $('revealed-file').hidden = !data.fileName;
    $('result-actions').replaceChildren();
    if (data.fileName) {
      const blob = new Blob([data.fileBytes], {type: data.mimeType || 'application/octet-stream'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = data.fileName;
      link.textContent = `Download ${data.fileName} · ${bytesToSize(data.fileBytes.length)}`;
      $('result-actions').append(link);
      $('revealed-file').textContent = `Attached file: ${data.fileName} (${bytesToSize(data.fileBytes.length)})`;
    }
    if (data.message) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy message';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(data.message);
          toast('Message copied.');
        } catch (error) {
          setError(`Clipboard access failed: ${error.message}`);
        }
      });
      $('result-actions').append(copy);
    }
    addExplainLink(report);
    setStep(3);
  }

  async function hideSecret() {
    const message = $('secret-message').value;
    const password = $('hide-password').value;
    const confirmation = $('confirm-password').value;
    const textCarrier = $('cover-text').value;
    if (!message.trim() && !state.attachment) throw new Error('Write a message or attach a file before continuing.');
    if (password.length < 8) throw new Error('Choose a password with at least 8 characters.');
    if (password !== confirmation) throw new Error('The passwords do not match. Check both fields and try again.');
    if (state.carrier === 'image' && !state.image) throw new Error('Choose a cover image before continuing.');
    if (state.carrier === 'text' && !textCarrier.trim()) throw new Error('Write a cover sentence before continuing.');
    const fileBytes = state.attachment ? new Uint8Array(await state.attachment.arrayBuffer()) : new Uint8Array();
    const plaintext = createPlaintext(message, state.attachment?.name || '', state.attachment?.type || '', $('expiry-date').value, fileBytes);
    showProgress(4, 'Deriving a key from your password…');
    const {salt, iv, ciphertext, seed, key} = await encryptBytes(password, plaintext);
    showProgress(12, 'Encrypted with AES-256-GCM…');
    const header = makeHeader(salt, iv, ciphertext.length);
    const combined = new Uint8Array(header.length + ciphertext.length);
    combined.set(header);
    combined.set(ciphertext, HEADER_SIZE);
    if (state.carrier === 'text') {
      const cover = textCarrier;
      const max = 2 * 1024 * 1024;
      if (combined.length * 8 + cover.length > max) throw new Error('This secret is too large for the invisible text format. Use an image carrier instead.');
      const invisible = encodeInvisible(combined);
      const stegoText = `${cover} ${invisible}`;
      const verified = decodeInvisible(stegoText);
      const decrypted = await decryptPayload(parseHeader(verified.subarray(0, HEADER_SIZE)), verified.subarray(HEADER_SIZE), password);
      if (decrypted.data.message !== message || !equalBytes(decrypted.data.fileBytes, fileBytes)) throw new Error('Verification failed: the hidden text did not decode exactly.');
      $('result').hidden = false;
      $('result-title').textContent = 'Secret hidden in text';
      $('result-description').textContent = 'Verified by reading the hidden bytes back. Copy the complete text and share it without rich-text formatting.';
      $('revealed-message').hidden = false;
      $('revealed-message').textContent = stegoText;
      $('result-actions').replaceChildren();
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy stego text';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(stegoText);
          toast('Stego text copied.');
        } catch (error) {
          setError(`Clipboard access failed: ${error.message}`);
        }
      });
      $('result-actions').append(copy);
      const capacityBits = Math.max(1, max - cover.length);
      const markerSamples = sampleTextMarkers(invisible);
      const textReport = createExplainReport({
        message,
        password,
        method: 'text-zero-width',
        direction: 'hide',
        payloadBits: combined.length * 8,
        capacityBits,
        sourceFormat: 'text/plain',
        coverPreview: cover,
        coverChars: countCodePoints(cover),
        stegoChars: countCodePoints(stegoText),
        markerCount: countCodePoints(invisible),
        attachmentBytes: fileBytes.length,
        samples: markerSamples,
        sampleBits: [...combined.subarray(0, 8)].map(byte => byte.toString(2).padStart(8, '0')).join(' ')
      });
      addExplainLink(textReport);
      setSuccess('Verified: your hidden text round-trips correctly.');
      setStep(3);
      return textReport;
    }

    const {canvas, context, imageData} = await getPixelsFromFile(state.image.file);
    const channelCount = (imageData.data.length / 4) * 3;
    const capacity = Math.floor((channelCount - HEADER_SIZE * 8) / 8);
    if (ciphertext.length > capacity) {
      const available = Math.max(0, capacity - 16);
      throw new Error(`This image is too small. It can hold about ${formatCount(available)} bytes, but this message and attachment need ${formatCount(plaintext.length)} bytes. Choose a larger image or remove the attachment.`);
    }
    showProgress(18, 'Embedding data across the image…');
    const {pixels: modified, stats: imageStats} = await runPixelWorker('embed', imageData, {
      bytes: ciphertext.buffer,
      header: header.buffer,
      seed
    }, progress => showProgress(18 + progress * 57, 'Embedding encrypted data across the image…'));
    context.putImageData(new ImageData(modified, canvas.width, canvas.height), 0, 0);
    showProgress(78, 'Exporting lossless PNG…');
    const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG export failed. Try a different image.')), 'image/png'));
    showProgress(85, 'Verifying the downloaded image…');
    const outputBitmap = await createImageBitmap(blob);
    try {
      const outputData = readImageData(outputBitmap).imageData;
      const outputHeader = parseHeader(readHeader(outputData.data));
      if (!outputHeader || outputHeader.length !== ciphertext.length) throw new Error('Verification failed: the PNG did not preserve the embedded header.');
      const outputCiphertext = await runPixelWorker('extract', outputData, {length: ciphertext.length, seed});
      const parsed = parsePlaintext(await decryptWithKey(key, iv, outputCiphertext));
      if (parsed.message !== message || !equalBytes(parsed.fileBytes, fileBytes)) throw new Error('Verification failed: the encoded image did not decode to the original message.');
    } finally {
      outputBitmap.close();
    }
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(blob);
    $('result').hidden = false;
    $('result-title').textContent = 'Secret hidden & verified';
    $('result-description').textContent = 'The PNG was decoded again and authenticated successfully. Download this exact file; avoid compression or resizing.';
    $('revealed-message').hidden = true;
    $('result-actions').replaceChildren();
    $('compare-original').src = state.imageUrl;
    $('compare-stego').src = state.resultUrl;
    $('compare-original').hidden = false;
    $('compare-stego').hidden = false;
    $('diff-canvas').hidden = true;
    $('compare-slider').value = '50';
    $('compare-stego').style.clipPath = 'inset(0 50% 0 0)';
    $('heatmap-toggle').textContent = 'Show amplified difference';
    $('compare-panel').hidden = false;
    const download = document.createElement('a');
    download.href = state.resultUrl;
    download.download = `${state.image.file.name.replace(/\.[^.]+$/, '')}-whisper.png`;
    download.textContent = '↓ Download verified PNG';
    $('result-actions').append(download);
    const capacityBits = Math.max(0, channelCount - HEADER_SIZE * 8);
    const pixelReport = createExplainReport({
      message,
      password,
      method: 'image-lsb',
      direction: 'hide',
      payloadBits: ciphertext.length * 8,
      capacityBits,
      sourceFormat: state.image.file.type,
      width: canvas.width,
      height: canvas.height,
      attachmentBytes: fileBytes.length,
      samples: imageStats.samples,
      sampleBits: [...ciphertext.subarray(0, 8)].map(byte => byte.toString(2).padStart(8, '0')).join(' ')
    });
    Object.assign(pixelReport, imageStats, {pixelsChanged: imageStats.changedPixels});
    addExplainLink(pixelReport);
    setSuccess('Verified: the secret and attachment were read back intact.');
    setStep(3);
    return pixelReport;
  }

  async function revealSecret() {
    const password = $('reveal-password').value;
    if (!password) throw new Error('Enter the password used to hide this secret.');
    let result;
    if (state.revealImage) {
      result = await revealFromImage(state.revealImage, password);
    } else {
      const text = $('reveal-text').value;
      if (!text) throw new Error('Choose a stego image or paste the text that contains the hidden message.');
      result = await revealFromText(text, password);
    }
    showProgress(96, 'Preparing your revealed secret…');
    showRevealed(result.data, result.report);
    return result.report;
  }

  $('go-button').addEventListener('click', async () => {
    clearFeedback();
    if (state.step === 1) {
      if (state.mode === 'hide' && state.carrier === 'image' && !state.image) {
        setError('Choose a cover image before continuing.');
        return;
      }
      if (state.mode === 'hide' && state.carrier === 'text' && !$('cover-text').value.trim()) {
        setError('Write a cover sentence before continuing.');
        return;
      }
      if (state.mode === 'reveal' && !state.revealImage && !$('reveal-text').value) {
        setError('Choose an image or paste stego text before continuing.');
        return;
      }
      setStep(2);
      (state.mode === 'hide' ? $('secret-message') : $('reveal-password')).focus();
      return;
    }
    setOperationBusy(true);
    try {
      if (state.mode === 'hide') await hideSecret();
      else await revealSecret();
    } catch (error) {
      console.error('Steganography operation failed:', error);
      setError(error.message || 'The operation could not be completed.');
    } finally {
      setOperationBusy(false);
      finishProgress();
    }
  });

  $('reveal-text').addEventListener('input', () => {
    if ($('reveal-text').value) {
      state.revealImage = null;
      $('reveal-input').value = '';
      $('reveal-meta').hidden = true;
    }
  });

  $('cover-text').addEventListener('input', () => {
    if (state.carrier === 'text') updateCapacity();
  });

  setMode('hide');

  $('compare-slider').addEventListener('input', event => {
    $('compare-stego').style.clipPath = `inset(0 ${100 - Number(event.target.value)}% 0 0)`;
  });

  $('heatmap-toggle').addEventListener('click', async () => {
    const canvas = $('diff-canvas');
    if (!canvas.hidden) {
      canvas.hidden = true;
      $('compare-original').hidden = false;
      $('compare-stego').hidden = false;
      $('heatmap-toggle').textContent = 'Show amplified difference';
      return;
    }
    try {
      const [original, stegoResponse] = await Promise.all([createImageBitmap(state.image.file), fetch(state.resultUrl)]);
      const stego = await createImageBitmap(await stegoResponse.blob());
      const scale = Math.min(1, 600 / original.width, 400 / original.height);
      canvas.width = Math.max(1, Math.round(original.width * scale));
      canvas.height = Math.max(1, Math.round(original.height * scale));
      const originalCanvas = document.createElement('canvas');
      originalCanvas.width = canvas.width;
      originalCanvas.height = canvas.height;
      const originalContext = originalCanvas.getContext('2d', {willReadFrequently: true});
      const diffContext = canvas.getContext('2d');
      originalContext.drawImage(original, 0, 0, canvas.width, canvas.height);
      diffContext.drawImage(stego, 0, 0, canvas.width, canvas.height);
      const before = originalContext.getImageData(0, 0, canvas.width, canvas.height).data;
      const after = diffContext.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < before.length; i += 4) {
        const changed = before[i] !== after.data[i] || before[i + 1] !== after.data[i + 1] || before[i + 2] !== after.data[i + 2];
        after.data[i] = changed ? 255 : 12;
        after.data[i + 1] = changed ? 64 : 12;
        after.data[i + 2] = changed ? 230 : 18;
        after.data[i + 3] = 255;
      }
      diffContext.putImageData(after, 0, 0);
      $('compare-original').hidden = true;
      $('compare-stego').hidden = true;
      canvas.hidden = false;
      $('heatmap-toggle').textContent = 'Back to image comparison';
      original.close();
      stego.close();
    } catch (error) {
      console.error('Difference heatmap could not be created:', error);
      setError(`Difference view failed: ${error.message}`);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(error => console.error('Offline support could not be registered:', error));
  }
})();
