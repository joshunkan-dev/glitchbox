let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;
let isRecording = false;

// ------------------------
// RECORD BUTTON (TOGGLE)
// ------------------------
document.getElementById("recordBtn").onclick = async () => {
    if (!isRecording) {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            recordedBlob = null;

            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

            mediaRecorder.onstop = () => {
                recordedBlob = new Blob(audioChunks, { type: "audio/webm" });
                document.getElementById("recordStatus").textContent = "Recording complete!";
            };

            mediaRecorder.start();
            isRecording = true;
            document.getElementById("recordStatus").textContent = "Recording...";
            document.getElementById("recordBtn").style.background = "#800000";

        } catch (err) {
            alert("Microphone access failed.");
            console.error(err);
        }
    } else {
        // Stop recording
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById("recordBtn").style.background = "red";
        document.getElementById("recordStatus").textContent = "Finalizing audio...";
    }
};

// ------------------------------
// PROCESS BUTTON
// ------------------------------
document.getElementById("processBtn").onclick = async () => {

    let file = null;

    // Priority: recorded vocal
    if (recordedBlob) {
        file = recordedBlob;
    }

    // Otherwise: uploaded file
    const fileInput = document.getElementById("audioFile");
    if (!file && fileInput.files.length > 0) {
        file = fileInput.files[0];
    }

    if (!file) {
        alert("Upload or record a vocal first.");
        return;
    }

    const intensity = parseFloat(document.getElementById("intensity").value);

    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // OUTPUT BUFFER
    const processed = audioCtx.createBuffer(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );

    // --- Alien timbre engine ---
    const fib = [1, 2, 3, 5, 8, 13];
    const warpStrength = 0.004 * intensity;
    const phaseSteps = 32;
    const roboBlend = 0.15 + (0.3 * intensity);

    for (let ch = 0; ch < processed.numberOfChannels; ch++) {
        const input = audioBuffer.getChannelData(ch);
        const output = processed.getChannelData(ch);

        for (let i = 0; i < input.length; i++) {
            const sample = input[i];

            // Fibonacci timbre warp (no delay fx)
            let warped = 0;
            for (let f of fib) {
                const offset = Math.floor(f * warpStrength * audioBuffer.sampleRate);
                const ix = i + offset;
                if (ix < input.length) warped += input[ix] * Math.cos(f * 0.4);
            }

            const timbre = sample * 0.75 + warped * 0.25;

            // Phase-quantized robotic smoothing
            const phase = Math.atan2(timbre, 1.0);
            const step = (Math.PI * 2) / phaseSteps;
            const quantized = Math.sin(Math.round(phase / step) * step);

            output[i] = timbre * (1 - roboBlend) + quantized * roboBlend;
        }
    }

    // WAV EXPORT
    const wavBlob = bufferToWav(processed);
    const url = URL.createObjectURL(wavBlob);

    // Update audio player
    const player = document.getElementById("player");
    player.src = url;
    player.play();

    // Auto download
    const a = document.createElement("a");
    a.href = url;
    a.download = "glitchbox-processed.wav";
    a.click();

    // Update download link
    const dl = document.getElementById("downloadLink");
    dl.href = url;
    dl.download = "glitchbox-processed.wav";
    dl.classList.remove("hidden");
    dl.textContent = "Re-download Processed Vocal";

    document.getElementById("recordStatus").textContent = "Processed!";
};


// -------------------------
// WAV ENCODER
// -------------------------
function bufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const dataSize = numFrames * numChannels * 2;

    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    let offset = 0;

    function writeString(s) {
        for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
    }

    writeString("RIFF");
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeString("WAVE");

    writeString("fmt ");
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * 2, true); offset += 4;
    view.setUint16(offset, numChannels * 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;

    writeString("data");
    view.setUint32(offset, dataSize, true); offset += 4;

    let pos = 44;
    for (let ch = 0; ch < numChannels; ch++) {
        const channel = buffer.getChannelData(ch);
        for (let i = 0; i < channel.length; i++) {
            let val = Math.max(-1, Math.min(1, channel[i]));
            view.setInt16(pos, val * 0x7FFF, true);
            pos += 2;
        }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
}
