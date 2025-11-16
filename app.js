let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;

// ELEMENTS
const recordBtn = document.getElementById("recordBtn");
const recordStatus = document.getElementById("recordStatus");
const fileInput = document.getElementById("audioFile");
const processBtn = document.getElementById("processBtn");
const player = document.getElementById("player");
const downloadLink = document.getElementById("downloadLink");
const intensitySlider = document.getElementById("intensity");

// -------------------- RECORDING ----------------------

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            recordedBlob = new Blob(audioChunks, { type: "audio/wav" });
            player.src = URL.createObjectURL(recordedBlob);
            recordStatus.textContent = "Recording saved!";
        };

        mediaRecorder.start();
        recordBtn.style.background = "#444";
        recordStatus.textContent = "Recording…";
    } catch (err) {
        recordStatus.textContent = "Mic blocked!";
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recordBtn.style.background = "red";
        recordStatus.textContent = "Stopped";
    }
}

// toggle record
recordBtn.onclick = () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") startRecording();
    else stopRecording();
};

// ------------------- FILE UPLOAD ---------------------

fileInput.onchange = e => {
    recordedBlob = e.target.files[0];
    player.src = URL.createObjectURL(recordedBlob);
};

// ------------------- PROCESSING ----------------------

processBtn.onclick = async () => {
    if (!recordedBlob) {
        recordStatus.textContent = "No audio loaded!";
        return;
    }

    const arrayBuffer = await recordedBlob.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const processed = audioCtx.createBuffer(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );

    // Fibonacci motion pattern
    const fib = [1, 2, 3, 5, 8, 13];
    const amount = parseFloat(intensitySlider.value); // 0-1
    const warpDistance = 0.0003 + amount * 0.002; // smaller = smoother, no volume loss

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const input = audioBuffer.getChannelData(ch);
        const output = processed.getChannelData(ch);

        for (let i = 0; i < input.length; i++) {
            let sample = input[i];

            // --------------- vowel liquification ----------------
            // Formants smear by *blending* near-frequency samples,
            // following a Fibonacci oscillation that shifts phase
            // but preserves loudness.

            let smear = 0;
            let weightSum = 0;

            for (let f of fib) {
                const offset = Math.floor(Math.sin(i * 0.00003 * f) * warpDistance * audioBuffer.sampleRate);

                const index = i + offset;
                if (index >= 0 && index < input.length) {
                    const w = 1 / f; // higher f → lighter contribution (smooth)
                    smear += input[index] * w;
                    weightSum += w;
                }
            }

            // normalized smear (NO volume drop)
            smear = smear / weightSum;

            // blend original + liquified vowel texture
            const intensity = amount * 0.85; // keeps it strong but not destructive
            output[i] = sample * (1 - intensity) + smear * intensity;
        }
    }

    const wavBlob = bufferToWav(processed);

    // preview
    player.src = URL.createObjectURL(wavBlob);

    // download
    downloadLink.href = URL.createObjectURL(wavBlob);
    downloadLink.download = "liquid-vocal.wav";
    downloadLink.classList.remove("hidden");
    downloadLink.textContent = "Download Processed Vocal";
};

// ----------------------- WAV ENCODER -----------------------

function bufferToWav(buffer) {
    const numOfChannels = buffer.numberOfChannels;
    const length = buffer.length * numOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    let offset = 0;
    const writeString = s => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
    };

    writeString("RIFF");
    view.setUint32(offset, 36 + buffer.length * numOfChannels * 2, true); offset += 4;
    writeString("WAVE");
    writeString("fmt ");
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numOfChannels, true); offset += 2;
    view.setUint32(offset, buffer.sampleRate, true); offset += 4;
    view.setUint32(offset, buffer.sampleRate * numOfChannels * 2, true); offset += 4;
    view.setUint16(offset, numOfChannels * 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString("data");
    view.setUint32(offset, buffer.length * numOfChannels * 2, true); offset += 4;

    let pos = 44;
    for (let ch = 0; ch < numOfChannels; ch++) {
        const channel = buffer.getChannelData(ch);
        for (let i = 0; i < channel.length; i++) {
            const v = Math.max(-1, Math.min(1, channel[i]));
            view.setInt16(pos, v * 0x7FFF, true);
            pos += 2;
        }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
}
