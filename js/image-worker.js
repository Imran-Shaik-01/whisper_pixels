self.onmessage = ({data}) => {
  const pixels = new Uint8ClampedArray(data.pixels);
  const channels = (pixels.length / 4) * 3;
  const headerBits = data.headerBytes * 8;
  const bytes = data.bytes ? new Uint8Array(data.bytes) : null;
  const totalBits = data.action === 'embed' ? bytes.length * 8 : data.length * 8;
  const usable = channels - headerBits;
  if (usable < 0 || totalBits > usable) {
    self.postMessage({error: 'The image does not have enough capacity for this payload.'});
    return;
  }
  let state = data.seed >>> 0 || 0x6d2b79f5;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return state >>> 0;
  };
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  const slots = usable;
  const start = random() % slots;
  let stride = (random() % slots) || 1;
  while (gcd(stride, slots) !== 1) stride = (stride + 1) % slots || 1;
  const indexAt = n => headerBits + ((start + ((n * stride) % slots)) % slots);
  const pixelIndex = channel => Math.floor(channel / 3) * 4 + channel % 3;
  if (data.action === 'embed') {
    const header = new Uint8Array(data.header);
    const changedPixels = new Map();
    let maxDiff = 0;
    let squaredError = 0;
    const writeBit = (channel, bit) => {
      const index = pixelIndex(channel);
      const before = pixels[index];
      const after = (before & 0xfe) | bit;
      if (before === after) return;
      const pixel = Math.floor(channel / 3);
      if (!changedPixels.has(pixel)) {
        const offset = pixel * 4;
        changedPixels.set(pixel, {pixel, x: pixel % data.width, y: Math.floor(pixel / data.width), before: [pixels[offset], pixels[offset + 1], pixels[offset + 2]]});
      }
      const difference = Math.abs(before - after);
      maxDiff = Math.max(maxDiff, difference);
      squaredError += difference * difference;
      pixels[index] = after;
    };
    for (let bit = 0; bit < header.length * 8; bit++) {
      writeBit(bit, (header[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    for (let bit = 0; bit < totalBits; bit++) {
      writeBit(indexAt(bit), (bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
      if (bit % 262144 === 0) self.postMessage({progress: bit / totalBits});
    }
    const samples = [...changedPixels.values()].slice(0, 5).map(sample => {
      const offset = sample.pixel * 4;
      return {x: sample.x, y: sample.y, before: sample.before, after: [pixels[offset], pixels[offset + 1], pixels[offset + 2]]};
    });
    const mse = squaredError / Math.max(1, data.width * data.height * 3);
    const stats = {changedPixels: changedPixels.size, maxDiff, mse, psnr: mse === 0 ? Infinity : 10 * Math.log10((255 ** 2) / mse), samples};
    self.postMessage({pixels: pixels.buffer, stats}, [pixels.buffer]);
    return;
  }
  const output = new Uint8Array(data.length);
  const samples = [];
  const sampledPixels = new Set();
  for (let bit = 0; bit < totalBits; bit++) {
    const carrierChannel = indexAt(bit);
    const channel = pixelIndex(carrierChannel);
    const value = pixels[channel] & 1;
    output[bit >> 3] |= value << (7 - (bit & 7));
    if (data.includeSamples && samples.length < 5) {
      const pixel = Math.floor(carrierChannel / 3);
      if (!sampledPixels.has(pixel)) {
        sampledPixels.add(pixel);
        const offset = pixel * 4;
        samples.push({x: pixel % data.width, y: Math.floor(pixel / data.width), rgb: [pixels[offset], pixels[offset + 1], pixels[offset + 2]], channel: carrierChannel % 3, bit: value});
      }
    }
    if (bit % 262144 === 0) self.postMessage({progress: bit / totalBits});
  }
  self.postMessage({bytes: output.buffer, samples}, [output.buffer]);
};
