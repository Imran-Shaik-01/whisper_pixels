const $ = id => document.getElementById(id);
const canvas = $('explainer-stage');
const context = canvas.getContext('2d');
const dialog = $('explainer-dialog');
const number = value => new Intl.NumberFormat().format(Math.round(value || 0));
const colors = {purple: '#b998ff', green: '#71e0ad', yellow: '#ffc66d', pink: '#ff97a5', ink: '#171421', muted: '#b8b1c8', white: '#f8f5ff'};

function stepList(report, replay) {
  if (replay) {
    return [
      ['Locate the hidden data', 'locator'],
      ['Read the embedded bits', 'bits'],
      ['Open the package', 'package'],
      ['Authenticate with your password', 'lock'],
      ['Turn encrypted bytes back into text', 'bytes'],
      ['Rebuild your message', 'message'],
      ['Secret revealed', 'result']
    ];
  }
  return [
    ['Your message', 'message'],
    ['Turned into bytes', 'bytes'],
    ['Locked with your password', 'lock'],
    ['Packaged for hiding', 'package'],
    ['Finding hiding spots', 'locator'],
    [report.method === 'text-zero-width' ? 'Adding invisible characters' : 'Hiding the bits', 'embed'],
    ['Your verified result', 'result']
  ];
}

function roundedRect(x, y, width, height, radius, fill, stroke) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function drawText(text, x, y, size = 20, color = colors.white, font = 'system-ui, sans-serif') {
  context.fillStyle = color;
  context.font = `${size}px ${font}`;
  context.fillText(text, x, y);
}

function resetCanvas() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0b0a12';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'middle';
}

function drawMessage(report, replay) {
  const label = replay ? 'RECOVERED MESSAGE' : 'YOUR MESSAGE';
  drawText(label, 42, 48, 14, colors.purple, 'ui-monospace, monospace');
  const preview = report.messagePreview || '(No text message; an attached file was included.)';
  roundedRect(36, 86, 888, 104, 16, '#171421', '#3d354d');
  drawText(preview.slice(0, 70), 62, 130, 25);
  const attachment = report.attachmentBytes ? `  ·  attached file ${number(report.attachmentBytes)} bytes` : '';
  drawText(`${number(report.messageChars)} characters  ·  ${number(report.messageBytes)} UTF-8 bytes${attachment}`, 44, 232, 16, colors.muted);
  if (preview.length > 70) drawText('…', 875, 166, 24, colors.purple);
}

function drawBytes(report) {
  drawText('A computer stores each character as bytes', 42, 47, 15, colors.purple);
  const bitGroups = (report.messageBits || '').split(' ').filter(Boolean).slice(0, 7);
  if (!bitGroups.length) {
    drawText(`No text bytes; attached file contributes ${number(report.attachmentBytes)} bytes.`, 42, 145, 17, colors.muted);
    return;
  }
  bitGroups.forEach((bits, index) => {
    const x = 38 + index * 128;
    roundedRect(x, 91, 116, 105, 12, '#171421', '#3d354d');
    drawText(bits, x + 11, 126, 14, colors.green, 'ui-monospace, monospace');
    const char = String.fromCharCode(parseInt(bits, 2));
    drawText(/[\x20-\x7e]/.test(char) ? JSON.stringify(char) : 'byte', x + 11, 165, 13, colors.muted, 'ui-monospace, monospace');
  });
  drawText('Example byte groups from your message', 42, 236, 14, colors.muted);
}

function drawCipherBits(report) {
  drawText('EXTRACTED CIPHERTEXT BITS', 42, 48, 14, colors.purple, 'ui-monospace, monospace');
  const groups = (report.sampleBits || '').split(' ').filter(Boolean).slice(0, 8);
  groups.forEach((bits, index) => {
    const x = 42 + index * 112;
    roundedRect(x, 96, 100, 74, 10, '#171421', '#3d354d');
    drawText(bits, x + 8, 133, 13, colors.green, 'ui-monospace, monospace');
  });
  drawText(`${number(report.payloadBits)} bits extracted · encrypted bytes are not readable until authenticated`, 42, 226, 14, colors.muted);
}

function drawLock(report) {
  drawText('PASSWORD → PBKDF2 → AES-256-GCM', 42, 46, 15, colors.purple, 'ui-monospace, monospace');
  roundedRect(42, 91, 215, 98, 13, '#171421', '#3d354d');
  drawText('Your password', 62, 133, 18);
  drawText('never shown here', 62, 164, 13, colors.muted);
  drawText('→', 280, 142, 27, colors.purple);
  roundedRect(330, 91, 260, 98, 13, '#171421', '#3d354d');
  drawText('PBKDF2 · 310,000 rounds', 350, 127, 16, colors.yellow);
  drawText('derived key stays private', 350, 159, 13, colors.muted);
  drawText('→', 612, 142, 27, colors.purple);
  roundedRect(664, 91, 250, 98, 13, '#171421', '#3d354d');
  drawText('AES-GCM ciphertext', 684, 127, 17, colors.green);
  drawText((report.sampleBits || '•••••••• ••••••••').slice(0, 24), 684, 159, 13, colors.muted, 'ui-monospace, monospace');
  for (let index = 0; index < 27; index++) {
    const x = 44 + index * 32;
    const bit = (report.sampleBits || '01010101')[index % Math.max(1, (report.sampleBits || '01010101').length)] || '0';
    roundedRect(x, 222 + (bit === '1' ? 10 : 0), 17, 17, 4, bit === '1' ? '#b998ff' : '#393344');
  }
  drawText('Ciphertext looks random; authentication detects wrong passwords or changes.', 42, 274, 13, colors.muted);
}

function drawPackage(report) {
  drawText('A small public header plus authenticated ciphertext', 42, 45, 15, colors.purple);
  const blocks = [
    ['MAGIC', 100, colors.purple],
    ['SALT · 16 B', 170, colors.yellow],
    ['NONCE · 12 B', 170, colors.green],
    [`CIPHERTEXT · ${number(report.payloadBits / 8)} B`, 390, colors.pink]
  ];
  let x = 42;
  blocks.forEach(([label, width, color]) => {
    roundedRect(x, 103, width, 82, 12, `${color}24`, color);
    drawText(label, x + 12, 145, 13, color, 'ui-monospace, monospace');
    x += width + 12;
  });
  drawText(`Header: 36 bytes  ·  payload: ${number(report.payloadBits / 8)} encrypted bytes`, 42, 235, 15, colors.muted);
  drawText('The salt and nonce are not secret; the password-derived key is.', 42, 265, 13, colors.muted);
}

function drawLocator(report) {
  drawText(report.method === 'text-zero-width' ? 'TEXT CARRIER · INVISIBLE MARKERS' : 'IMAGE CARRIER · PASSWORD-SEEDED ORDER', 42, 38, 14, colors.purple, 'ui-monospace, monospace');
  if (report.method === 'text-zero-width') {
    drawText('Visible sentence', 42, 94, 16, colors.muted);
    roundedRect(38, 116, 884, 62, 12, '#171421', '#3d354d');
    drawText((report.coverPreview || 'Your cover text remains visible.').slice(0, 55), 55, 147, 18);
    const marks = report.samples?.length ? report.samples : [{codePoint: 'U+200B', bit: '0'}, {codePoint: 'U+200C', bit: '1'}];
    marks.slice(0, 5).forEach((sample, index) => {
      const color = sample.bit === '1' ? colors.yellow : colors.green;
      roundedRect(48 + index * 128, 208, 115, 42, 8, `${color}28`, color);
      drawText(sample.codePoint || `U+${sample.codePoint}`, 58 + index * 128, 229, 13, color, 'ui-monospace, monospace');
    });
  } else {
    const cols = 32;
    const rows = 7;
    const startX = 72;
    const startY = 72;
    const cell = 23;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const selected = (report.samples || []).some(sample => Math.floor(sample.x / Math.max(1, report.width) * cols) === x && Math.floor(sample.y / Math.max(1, report.height) * rows) === y);
        const fill = selected ? colors.green : (x + y) % 2 ? '#282433' : '#211e2b';
        roundedRect(startX + x * cell, startY + y * cell, 15, 15, 3, fill);
      }
    }
    drawText(`${number(report.totalPixels)} pixels · ${number(report.capacityBits)} available carrier bits`, 42, 266, 13, colors.muted);
  }
}

function drawEmbed(report) {
  if (report.method === 'text-zero-width') {
    drawText('Each ciphertext bit becomes an invisible character', 42, 49, 15, colors.purple);
    const markers = report.samples?.length ? report.samples : [{codePoint: 'U+200B', bit: '0'}, {codePoint: 'U+200C', bit: '1'}];
    markers.slice(0, 5).forEach((sample, index) => {
      const x = 44 + index * 176;
      roundedRect(x, 103, 150, 84, 12, '#171421', '#3d354d');
      drawText(sample.codePoint || 'U+200B', x + 14, 137, 16, sample.bit === '1' ? colors.yellow : colors.green, 'ui-monospace, monospace');
      drawText(`represents ${sample.bit || 'framing'}`, x + 14, 165, 12, colors.muted);
    });
    drawText('The characters are there even though they take no visible width.', 42, 242, 14, colors.muted);
    return;
  }
  const sample = report.samples?.[0];
  if (!sample) {
    drawText('The hidden bits were spread across the image.', 42, 130, 18, colors.muted);
    drawText('This report has no pixel-difference sample to illustrate.', 42, 166, 14, colors.muted);
    return;
  }
  if (!sample.before || !sample.after) {
    const channel = ['R', 'G', 'B'][sample.channel] || 'R';
    const value = sample.rgb?.[sample.channel] ?? 0;
    drawText(`REAL RECOVERED PIXEL · x ${sample.x}, y ${sample.y}`, 42, 54, 14, colors.purple, 'ui-monospace, monospace');
    roundedRect(58, 97, 180, 135, 14, `rgb(${(sample.rgb || [0, 0, 0]).join(',')})`, '#6f687e');
    drawText(`${channel}: ${value} · ${value.toString(2).padStart(8, '0')}`, 288, 138, 20, colors.white, 'ui-monospace, monospace');
    drawText(`Recovered carrier bit: ${sample.bit}`, 288, 183, 18, colors.green);
    drawText('This pixel value is measured from the uploaded stego image.', 42, 270, 13, colors.muted);
    return;
  }
  drawText(`REAL PIXEL SAMPLE · x ${sample.x}, y ${sample.y}`, 42, 44, 14, colors.purple, 'ui-monospace, monospace');
  const before = sample.before || [0, 0, 0];
  const after = sample.after || before;
  const channel = before.findIndex((value, index) => value !== after[index]);
  const channelIndex = channel < 0 ? 2 : channel;
  const value = before[channelIndex];
  const changedValue = after[channelIndex];
  roundedRect(45, 83, 260, 160, 14, `rgb(${before.join(',')})`, '#6f687e');
  roundedRect(655, 83, 260, 160, 14, `rgb(${after.join(',')})`, '#6f687e');
  drawText('BEFORE', 45, 65, 12, colors.muted, 'ui-monospace, monospace');
  drawText('AFTER', 655, 65, 12, colors.muted, 'ui-monospace, monospace');
  drawText(`${['R', 'G', 'B'][channelIndex]}: ${value}  →  ${changedValue}`, 365, 119, 18, colors.white, 'ui-monospace, monospace');
  const beforeBits = value.toString(2).padStart(8, '0');
  const afterBits = changedValue.toString(2).padStart(8, '0');
  context.font = '20px ui-monospace, monospace';
  const prefixWidth = context.measureText(beforeBits.slice(0, 7)).width;
  drawText(beforeBits.slice(0, 7), 365, 159, 20, colors.muted, 'ui-monospace, monospace');
  drawText(beforeBits[7], 365 + prefixWidth, 159, 20, colors.yellow, 'ui-monospace, monospace');
  drawText(afterBits.slice(0, 7), 365, 197, 20, colors.muted, 'ui-monospace, monospace');
  drawText(afterBits[7], 365 + prefixWidth, 197, 20, colors.green, 'ui-monospace, monospace');
  drawText(`Other channels: ${before.filter((_, index) => index !== channelIndex).join(', ')} → ${after.filter((_, index) => index !== channelIndex).join(', ')}`, 42, 276, 13, colors.muted, 'ui-monospace, monospace');
}

function drawResult(report) {
  const stats = [
    [`${number(report.messageChars)} chars`, 'MESSAGE'],
    [`${Number(report.usedPercent || 0).toFixed(3)}%`, 'CAPACITY'],
    [report.pixelsChanged == null ? '—' : number(report.pixelsChanged), 'PIXELS CHANGED'],
    [report.maxDiff == null ? '—' : `${number(report.maxDiff)} / 255`, 'MAX CHANGE']
  ];
  stats.forEach(([value, label], index) => {
    const x = 38 + index * 226;
    roundedRect(x, 92, 204, 112, 13, '#171421', '#3d354d');
    drawText(value, x + 15, 137, 23, index === 2 ? colors.green : colors.white);
    drawText(label, x + 15, 174, 11, colors.muted, 'ui-monospace, monospace');
  });
  const insights = report.psnr === Infinity ? 'No visible RGB differences in this comparison.' : Number.isFinite(report.psnr) ? `PSNR ${report.psnr.toFixed(2)} dB · MSE ${Number(report.mse || 0).toFixed(6)}` : `${number(report.payloadBits)} payload bits · AES-GCM verified`;
  drawText(insights, 42, 252, 14, colors.purple);
}

function drawStage(report, key) {
  resetCanvas();
  if (key === 'message') drawMessage(report, report.direction === 'reveal');
  if (key === 'bytes') drawBytes(report);
  if (key === 'bits') drawCipherBits(report);
  if (key === 'lock') drawLock(report);
  if (key === 'package') drawPackage(report);
  if (key === 'locator') drawLocator(report);
  if (key === 'embed') drawEmbed(report);
  if (key === 'result') drawResult(report);
}

function imageSampleNarration(report, technical) {
  const sample = report.samples?.[0];
  if (sample?.before && sample?.after) {
    return technical
      ? `Pixel (${sample.x}, ${sample.y}) changed RGB ${sample.before.join(',')} → ${sample.after.join(',')}; the observed channel delta is at most ${number(report.maxDiff)}.`
      : `Here is a real changed pixel from your output: RGB ${sample.before.join(', ')} → ${sample.after.join(', ')} at (${sample.x}, ${sample.y}).`;
  }
  if (sample?.rgb) {
    const channel = ['R', 'G', 'B'][sample.channel] || 'R';
    return technical
      ? `At (${sample.x}, ${sample.y}), the stego ${channel} value is ${sample.rgb[sample.channel]}; its extracted least-significant bit is ${sample.bit}.`
      : `This real pixel at (${sample.x}, ${sample.y}) has ${channel} value ${sample.rgb[sample.channel]}; its hidden bit is ${sample.bit}.`;
  }
  return 'The data was embedded in the image’s least-significant color bits.';
}

function narration(report, index, technical, replay) {
  const used = Number(report.usedPercent || 0);
  const image = report.method === 'image-lsb';
  const textMode = report.method === 'text-zero-width';
  const byStep = replay ? [
    ['Your carrier', textMode ? `The stego text has ${number(report.markerCount)} invisible markers among ${number(report.stegoChars)} characters. Its visible cover text has ${number(report.coverChars)} characters.` : `This image contains the hidden payload and measures ${number(report.width)} × ${number(report.height)} pixels.`],
    ['Reading the bits', textMode ? `The ${number(report.payloadBits)} payload bits are decoded from ${number(report.markerCount)} invisible text markers.` : `The ${number(report.payloadBits)} payload bits are read from the spread RGB LSB slots across ${number(report.totalPixels)} pixels.`],
    ['Reading the package', `The payload records ${number(report.payloadBits / 8)} ciphertext bytes. Its header supplies the salt, nonce and ciphertext length.`],
    ['Checking your password', `PBKDF2-SHA-256 runs ${number(report.encryption?.iterations || 310000)} iterations to derive a key. AES-GCM authenticates the ciphertext before decryption.`],
    ['Recovering bytes', `Authenticated decryption reconstructs the original ${number(report.messageBytes)} UTF-8 message bytes. No password or key is included in this report.`],
    ['Rebuilding the message', `Those bytes decode into ${number(report.messageChars)} characters${report.messagePreview ? `, beginning “${report.messagePreview.slice(0, 48)}”` : ''}.`],
    ['Revealed', `The password authenticated successfully. ${number(report.payloadBits)} payload bits were extracted using the ${report.method} method.`]
  ] : [
    ['Your message', `You entered ${number(report.messageChars)} characters, represented as ${number(report.messageBytes)} UTF-8 bytes${report.messagePreview ? ` (for example, “${report.messagePreview.slice(0, 48)}”)` : ''}${report.attachmentBytes ? `, with an attached file of ${number(report.attachmentBytes)} bytes` : ''}.`],
    ['Turned into bytes', `The message becomes ${number(report.messageBytes)} bytes. Here are real byte bits from its beginning: ${report.messageBits || 'no text bytes were included'}.`],
    ['Locked with your password', `Your password is processed with PBKDF2-SHA-256 (${number(report.encryption?.iterations || 310000)} rounds) and AES-256-GCM encrypts the payload. The key itself is never shown or saved in this report.`],
    ['Packaged for hiding', `A 36-byte header carries format information, a random salt, a nonce and length; ${number(report.payloadBits / 8)} ciphertext bytes follow.`],
    ['Finding hiding spots', textMode ? `The text carrier uses invisible U+200B and U+200C characters to represent bits. This payload uses about ${used.toFixed(3)}% of the estimated text allowance.` : `A password-seeded order spreads the payload among ${number(report.totalPixels)} pixels. It uses ${number(report.payloadBits)} of ${number(report.capacityBits)} available carrier bits.`],
    ['Hiding the bits', textMode ? 'The encrypted bits are encoded as zero-width characters. They have no visible width, but some text apps may remove them during formatting.' : imageSampleNarration(report, false)],
    ['Your verified result', image ? `${number(report.pixelsChanged)} of ${number(report.totalPixels)} pixels changed; the maximum channel difference was ${number(report.maxDiff)} out of 255. ${Number.isFinite(report.psnr) && report.psnr > 70 ? `At ${report.psnr.toFixed(2)} dB PSNR, the images are practically identical to the eye.` : ''}` : `The hidden text was decoded and authenticated successfully. ${number(report.payloadBits)} payload bits were embedded.`]
  ];
  const [title, simple] = byStep[index];
  if (!technical) return {title, text: simple};
  const technicalText = replay ? [
    textMode ? `Decode ${number(report.markerCount)} framed Unicode markers from a ${number(report.stegoChars)}-character stego string.` : `The carrier image is ${number(report.width)} × ${number(report.height)} pixels (${number(report.totalPixels)} total pixels).`,
    textMode ? `Decode ${number(report.payloadBits)} payload bits from the text’s zero-width markers; the preview shows actual ciphertext bits.` : `Extract ${number(report.payloadBits)} payload bits from the spread RGB LSB slots; the preview shows actual ciphertext bits.`,
    `Parse the 36-byte WPX2 header and use its 16-byte salt, 12-byte nonce, and ciphertext length to delimit the payload.`,
    `Derive a 256-bit AES key using PBKDF2-HMAC-SHA-256 (${number(report.encryption?.iterations || 310000)} iterations); AES-GCM authentication must succeed before plaintext is returned.`,
    `Authenticated AES-GCM decryption restores ${number(report.messageBytes)} UTF-8 message bytes${report.attachmentBytes ? ` plus ${number(report.attachmentBytes)} attached-file bytes` : ''}.`,
    `UTF-8 decoding reconstructs ${number(report.messageChars)} characters${report.messagePreview ? `; preview: “${report.messagePreview.slice(0, 48)}”` : ''}.`,
    `The recovered payload was authenticated with the ${report.method} method; no password or key is present in the report.`
  ] : [
    `UTF-8 encodes the ${number(report.messageChars)}-character message into ${number(report.messageBytes)} bytes${report.messagePreview ? `; preview: “${report.messagePreview.slice(0, 48)}”` : ''}${report.attachmentBytes ? `; attached-file data adds ${number(report.attachmentBytes)} bytes` : ''}.`,
    `Sample UTF-8 byte bit patterns: ${report.messageBits || 'none (attachment-only payload)'}. The message length is ${number(report.messageBytes)} bytes.`,
    `PBKDF2-HMAC-SHA-256, ${number(report.encryption?.iterations || 310000)} iterations, derives a 256-bit AES key; AES-256-GCM provides confidentiality and authentication.`,
    `The ${number(report.payloadBits / 8)}-byte encrypted payload follows the 36-byte WPX2 header (16-byte salt, 12-byte nonce, 4-byte length plus magic).`,
    `${number(report.payloadBits)} bits use ${number(report.capacityBits)} available carrier slots (${used.toFixed(4)}%). ${textMode ? 'Zero-width marker encoding stores one bit per marker.' : 'A password-derived seed selects a permutation of usable RGB LSB slots.'}`,
    textMode ? 'Payload bits map to U+200B (0) and U+200C (1), framed by U+2063 and U+2064.' : imageSampleNarration(report, true),
    image ? `${number(report.pixelsChanged)} / ${number(report.totalPixels)} pixels changed (${(report.pixelsChanged / Math.max(1, report.totalPixels) * 100).toFixed(4)}%); MSE ${Number(report.mse || 0).toFixed(7)}, PSNR ${Number.isFinite(report.psnr) ? `${report.psnr.toFixed(2)} dB` : 'infinite'}.` : `Round-trip verification authenticated ${number(report.payloadBits)} payload bits.`
  ];
  return {title, text: technicalText[index]};
}

function createExplainer(report) {
  let steps = stepList(report, $('explainer-reveal').checked);
  let current = 0;
  let technical = false;
  let timer = 0;
  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
    $('explainer-play').textContent = '▶ Play';
  };
  const conditionalInsights = () => {
    const insights = [];
    if (report.usedPercent > 70) insights.push('You used a large share of capacity; high payload density can be easier to detect statistically.');
    if (report.sourceFormat === 'image/jpeg') insights.push('The source was JPEG, but the hidden result is exported as PNG. Recompression, resizing or screenshots can destroy hidden bits.');
    if (Number.isFinite(report.psnr) && report.psnr > 70) insights.push('The before/after difference is tiny: PSNR is above 70 dB.');
    if (report.passwordStrength !== null && report.passwordStrength <= 2) insights.push('Consider a longer, less predictable passphrase to improve password resistance.');
    return insights;
  };
  const render = () => {
    const item = steps[current];
    $('explainer-step-label').textContent = `STEP ${String(current + 1).padStart(2, '0')} OF 07 · ${item[0].toUpperCase()}`;
    const copy = narration(report, current, technical, $('explainer-reveal').checked);
    $('explainer-step-title').textContent = copy.title;
    $('explainer-narration').textContent = copy.text;
    $('explainer-progress').value = current + 1;
    $('explainer-progress').textContent = `${current + 1} of 7`;
    $('explainer-prev').disabled = current === 0;
    $('explainer-next').disabled = current === steps.length - 1;
    const insightList = $('explainer-insights');
    insightList.replaceChildren();
    if (current === steps.length - 1) {
      for (const insight of conditionalInsights()) {
        const itemNode = document.createElement('li');
        itemNode.textContent = insight;
        insightList.append(itemNode);
      }
    }
    drawStage(report, item[1]);
    canvas.classList.remove('enter');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !$('explainer-skip').dataset.skip) {
      void canvas.offsetWidth;
      canvas.classList.add('enter');
    }
  };
  const move = step => {
    current = Math.max(0, Math.min(steps.length - 1, step));
    render();
  };
  $('explainer-prev').addEventListener('click', () => { stop(); move(current - 1); });
  $('explainer-next').addEventListener('click', () => { stop(); move(current + 1); });
  $('explainer-play').addEventListener('click', () => {
    if (timer) {
      stop();
      return;
    }
    if (current >= steps.length - 1) move(0);
    $('explainer-play').textContent = 'Ⅱ Pause';
    timer = window.setInterval(() => {
      if (current >= steps.length - 1) stop();
      else move(current + 1);
    }, Number($('explainer-speed').value));
  });
  $('explainer-speed').addEventListener('change', () => {
    if (timer) {
      stop();
      $('explainer-play').click();
    }
  });
  document.querySelectorAll('[data-explainer-level]').forEach(button => button.addEventListener('click', () => {
    technical = button.dataset.explainerLevel === 'technical';
    document.querySelectorAll('[data-explainer-level]').forEach(option => {
      const active = option === button;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    });
    render();
  }));
  $('explainer-reveal').addEventListener('change', () => {
    stop();
    steps = stepList(report, $('explainer-reveal').checked);
    current = 0;
    render();
  });
  $('explainer-skip').addEventListener('click', () => {
    $('explainer-skip').dataset.skip = 'true';
    canvas.classList.remove('enter');
  });
  $('explainer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', stop);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  $('explain-open').addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
  render();
  if (report.direction === 'reveal') {
    $('explainer-reveal').checked = true;
    current = 0;
    render();
  }
}

export function initExplainer(report) {
  const openButton = $('explain-open');
  const status = $('explain-status');
  if (!report) {
    status.textContent = 'Complete a hide or reveal operation in the Studio, then open its private walkthrough here.';
    for (const id of ['explainer-prev', 'explainer-next', 'explainer-play', 'explainer-speed', 'explainer-reveal', 'explainer-skip']) $(id).disabled = true;
    openButton.addEventListener('click', () => {
      $('explainer-step-label').textContent = 'NO OPERATION REPORT';
      $('explainer-step-title').textContent = 'Start in the Studio';
      $('explainer-narration').textContent = 'The explainer uses real values captured from a successful hide or reveal. It does not invent sample measurements.';
      $('explainer-insights').replaceChildren();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#0b0a12';
      context.fillRect(0, 0, canvas.width, canvas.height);
      drawText('Your private walkthrough will appear after an operation.', 42, 150, 20, colors.muted);
      $('explainer-progress').value = 0;
      for (const id of ['explainer-prev', 'explainer-next', 'explainer-play', 'explainer-speed', 'explainer-reveal', 'explainer-skip']) $(id).disabled = true;
      if (!dialog.open) dialog.showModal();
    });
    if (location.hash === '#explain') openButton.click();
    return;
  }
  status.textContent = `${report.direction === 'reveal' ? 'Reveal' : 'Hide'} report ready · ${report.method === 'image-lsb' ? 'image' : 'text'} · generated locally`;
  $('explainer-reveal').checked = report.direction === 'reveal';
  createExplainer(report);
  if (location.hash === '#explain') dialog.showModal();
}
