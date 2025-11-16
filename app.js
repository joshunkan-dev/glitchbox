// --- Convert AudioBuffer to WAV ---
function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels,
    length = buffer.length * numOfChan * 2 + 44,
    bufferArray = new ArrayBuffer(length),
    view = new DataView(bufferArray),
    channels = [],
    sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF header
  setUint32(0x46464952);
  setUint32(length - 8);
  setUint32(0x45564157);

  // fmt chunk
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  // data chunk
  setUint32(0x61746164);
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      const sample = Math.max(-1, Math.min(1, channels[i][offset]));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      pos += 2;
    }
    offset++;
  }

  return bufferArray;
}

// --- FFT helpers ---
function fft(real, imag) {
  const n = real.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wlen_r = Math.cos(angle);
    const wlen_i = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let j2 = 0; j2 < len / 2; j2++) {
        const u_r = real[i + j2];
        const u_i = imag[i + j2];
        const v_r = real[i + j2 + len / 2] * wr - imag[i + j2 + len / 2] * wi;
        const v_i = real[i + j2 + len / 2] * wi + imag[i + j2 + len / 2] * wr;
        real[i + j2] = u_r + v_r;
        imag[i + j2] = u_i + v_i;
        real[i + j2 + len / 2] = u_r - v_r;
        imag[i + j2 + len / 2] = u_i - v_i;
        const next_wr = wr * wlen_r - wi * wlen_i;
        const next_wi = wr * wlen_i + wi * wlen_r;
        wr = next_wr;
        wi = next_wi;
      }
    }
  }
}

function ifft(real, imag) {
  for (let i = 0; i < real.length; i++) imag[i] = -imag[i];
  fft(real, imag);
  for (let i = 0; i < real.length; i++) {
    real[i] /= real.length;
    imag[i] = -imag[i] / real.length;
  }
}

function hann(N) {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  return w;
}

function fibSequence(maxVal) {
  const seq = [1, 1];
  while (seq[seq.length - 1] + seq[seq.length - 2] <= maxVal) {
    seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
  }
  return seq;
}

// --- Fibonacci Spectral Bloom ---
async function processVocal(file) {
  if (!file) return alert("Please upload or record a vocal first.");

  const intensity = parseFloat(document.getElementById("intensity").value) || 0.5;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const input = inputBuffer.getChannelData(0);
  const sr = inputBuffer.sampleRate;

  const winSize = 2048;
  const hop = winSize / 2;
  const window = hann(winSize);
  const fibs = fibSequence(winSize / 2);
  const fibDecay = (f) => Math.exp(-f / 8);

  const output = new Float32Array(input.length);
  const norm = new Float32Array(input.length);
  const real = new Float32Array(winSize);
  const imag = new Float32Array(winSize);

  for (let frame = 0; frame < input.length; frame += hop) {
    for (let i = 0; i < winSize; i++) {
      const idx = frame + i;
      real[i] = idx < input.length ? input[idx] * window[i] : 0;
      imag[i] = 0;
    }

    fft(real, imag);
    const origR = new Float32Array(real);
    const origI = new Float32Array(imag);
    const half = winSize / 2;

    for (let k = 0; k < half; k++) {
      let accR = origR[k];
      let accI = origI[k];
      const freqFactor = 1 - Math.sqrt(k / half) * 0.35;

      for (const f of fibs) {
        const w = intensity * 0.18 * fibDecay(f) * freqFactor;
        const pos = k + f;
        const neg = k - f;
        if (pos < half) {
          accR += origR[pos] * w;
          accI += origI[pos] * w;
        }
        if (neg >= 0) {
          accR += origR[neg] * w * 0.7;
          accI += origI[neg] * w * 0.7;
        }
      }

      real[k] = accR;
      imag[k] = accI;
      if (k > 0) {
        real[winSize - k] = real[k];
        imag[winSize - k] = -imag[k];
      }
    }

    ifft(real, imag);

    for (let i = 0; i < winSize; i++) {
      const idx = frame + i;
      if (idx < output.length) {
        output[idx] += real[i] * window[i];
        norm[idx] += window[i] * window[i];
      }
    }
  }

  for (let i = 0; i < output.length; i++) {
    if (norm[i] > 1e-8) output[i] /= norm[i];
  }

  const offlineCtx = new OfflineAudioContext(1, output.length, sr);
  const outBuffer = offlineCtx.createBuffer(1, output.length, sr);
  outBuffer.getChannelData(0).set(output);

  const source = offlineCtx.createBufferSource();
  source.buffer = outBuffer;
  const filter = offlineCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 12000 - intensity * 4000;
  source.connect(filter).connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  const wav = audioBufferToWav(rendered);
  const blob = new Blob([new DataView(wav)], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);

  const player = document.getElementBy
