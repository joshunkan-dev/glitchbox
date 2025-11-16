// --- Core Spectral Granular Warp (Alien, non-delay) ---
const frameSize = 1024;
const hop = 512;

const offline = offlineCtx;
const sampleRate = offline.sampleRate;
const input = audioBuffer.getChannelData(0);
const out = new Float32Array(input.length);

// Hann window
function hann(N) {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return w;
}

const window = hann(frameSize);

// Simple FFT library (in-place)
function fft(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wlen_r = Math.cos(ang);
    const wlen_i = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const u_r = re[i + k], u_i = im[i + k];
        const v_r = re[i + k + len/2] * wr - im[i + k + len/2] * wi;
        const v_i = re[i + k + len/2] * wi + im[i + k + len/2] * wr;
        re[i + k] = u_r + v_r;
        im[i + k] = u_i + v_i;
        re[i + k + len/2] = u_r - v_r;
        im[i + k + len/2] = u_i - v_i;
        const nwr = wr * wlen_r - wi * wlen_i;
        const nwi = wr * wlen_i + wi * wlen_r;
        wr = nwr;
        wi = nwi;
      }
    }
  }
}

function ifft(re, im) {
  for (let i = 0; i < re.length; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < re.length; i++) {
    re[i] /= re.length;
    im[i] = -im[i] / re.length;
  }
}

// MAIN PROCESSING LOOP
for (let start = 0; start < input.length; start += hop) {
  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);

  // Window input
  for (let i = 0; i < frameSize; i++) {
    const idx = start + i;
    re[i] = idx < input.length ? input[idx] * window[i] : 0;
    im[i] = 0;
  }

  // FFT
  fft(re, im);

  // --- 🔮 Spectral Grain Warp ---
  // For each FFT bin, micro-randomly reassign the magnitude to nearby bins.
  // This is NOT pitch shift, NOT delay, NOT vocoder — it's pure spectral texture morphing.
  const warpAmount = Math.floor(8 + intensity * 40); // how many bins can shift
  for (let k = 1; k < frameSize/2; k++) {
    const randShift = Math.floor((Math.random() - 0.5) * warpAmount);
    const t = k + randShift;

    if (t > 1 && t < frameSize/2) {
      // swap magnitudes but keep original phases
      const magSrc = Math.hypot(re[k], im[k]);
      const phaseSrc = Math.atan2(im[k], re[k]);

      re[k] = magSrc * Math.cos(phaseSrc);
      im[k] = magSrc * Math.sin(phaseSrc);

      // tiny random phase bend to avoid robotic sound
      const bend = (Math.random() - 0.5) * 0.1 * intensity;
      re[k] *= Math.cos(bend);
      im[k] *= Math.sin(bend);
    }
  }

  // Mirror for real output
  for (let k = 1; k < frameSize/2; k++) {
    re[frameSize - k] = re[k];
    im[frameSize - k] = -im[k];
  }

  // IFFT
  ifft(re, im);

  // Overlap-add
  for (let i = 0; i < frameSize; i++) {
    const idx = start + i;
    if (idx < out.length) out[idx] += re[i] * window[i];
  }
}

// Write output buffer
const outputBuffer = offline.createBuffer(1, out.length, sampleRate);
outputBuffer.copyToChannel(out, 0);
