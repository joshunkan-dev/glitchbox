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
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"

  // fmt chunk
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  // data chunk
  setUint32(0x61746164); // "data"
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

// --- Process uploaded or recorded vocal ---
async function processVocal(file) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  // Offline context for rendering effect
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length * 1.5, // allow reverb tail
    audioBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  const intensity = parseFloat(document.getElementById("intensity").value);

  // --- Ethereal effect chain ---
  // Base delay widening
  const delayLeft = offlineCtx.createDelay(0.5);
  const delayRight = offlineCtx.createDelay(0.5);
  delayLeft.delayTime.value = 0.02 + 0.03 * intensity;
  delayRight.delayTime.value = 0.04 + 0.05 * intensity;

  // Shimmer layer (simulated by highpass + feedback)
  const shimmer = offlineCtx.createDelay(0.5);
  shimmer.delayTime.value = 0.12;
  const shimmerGain = offlineCtx.createGain();
  shimmerGain.gain.value = 0.35 * intensity;
  const shimmerFilter = offlineCtx.createBiquadFilter();
  shimmerFilter.type = "highpass";
  shimmerFilter.frequency.value = 3500;

  // Feedback loop for shimmer
  shimmer.connect(shimmerFilter);
  shimmerFilter.connect(shimmerGain);
  shimmerGain.connect(shimmer);

  // Reverb simulation (soft lowpass tail)
  const reverb = offlineCtx.createBiquadFilter();
  reverb.type = "lowpass";
  reverb.frequency.value = 2500 + intensity * 2500;

  // LFO for subtle movement
  const lfo = offlineCtx.createOscillator();
  const lfoGain = offlineCtx.createGain();
  lfo.frequency.value = 0.1 + intensity * 0.2; // slow movement
  lfoGain.gain.value = 0.015 * intensity;
  lfo.connect(lfoGain).connect(reverb.frequency);

  // Routing
  const merger = offlineCtx.createChannelMerger(2);
  const wetGain = offlineCtx.createGain();
  const dryGain = offlineCtx.createGain();

  wetGain.gain.value = 0.7 * intensity;
  dryGain.gain.value = 1.0 - 0.4 * intensity;

  const leftChain = offlineCtx.createGain();
  const rightChain = offlineCtx.createGain();

  source.connect(delayLeft).connect(shimmer).connect(reverb).connect(leftChain);
  source.connect(delayRight).connect(shimmer).connect(reverb).connect(rightChain);

  leftChain.connect(merger, 0, 0);
  rightChain.connect(merger, 0, 1);

  merger.connect(wetGain);
  source.connect(dryGain);

  const output = offlineCtx.createGain();
  wetGain.connect(output);
  dryGain.connect(output);
  output.connect(offlineCtx.destination);

  lfo.start();
  source.start(0);

  const rendered = await offlineCtx.startRendering();

  // --- Convert to WAV and auto-download ---
  const wav = audioBufferToWav(rendered);
  const blob = new Blob([new DataView(wav)], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);

  const player = document.getElementById("player");
  player.src = url;
  player.play();

  // ✅ Auto-download
  const fileName = "ethereal_vocal.wav";
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // ✅ Update visible download button (optional)
  const dl = document.getElementById("downloadLink");
  dl.href = url;
  dl.download = fileName;
  dl.textContent = "Re-download Ethereal Vocal";
  dl.classList.remove("hidden");
}

// --- Handle file upload processing ---
document.getElementById("processBtn").addEventListener("click", async () => {
  const fileInput = document.getElementById("audioFile");
  if (fileInput.files.length === 0) {
    alert("Please upload or record a vocal first.");
    return;
  }
  const file = fileInput.files[0];
  await processVocal(file);
});

// --- Recording logic ---
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

const recordBtn = document.getElementById("recordBtn");
const recordStatus = document.getElementById("recordStatus");

recordBtn.addEventListener("click", async () => {
  if (!isRecording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();
      const file = new File([arrayBuffer], "recorded_vocal.wav", {
        type: "audio/wav",
      });

      const fileInput = document.getElementById("audioFile");
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      recordStatus.textContent = "Recording complete — ready to process!";
      recordBtn.style.background = "red";
    };

    mediaRecorder.start();
    isRecording = true;
    recordBtn.style.background = "#800000";
    recordStatus.textContent = "Recording...";
  } else {
    mediaRecorder.stop();
    isRecording = false;
    recordStatus.textContent = "Finalizing...";
  }
});
