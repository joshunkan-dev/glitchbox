let mediaRecorder;
let audioChunks = [];
let recordedBlob = null;

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
        recordedBlob = new Blob(audioChunks, { type: "audio/wav" });
        audioChunks = [];
        alert("Recording finished!");
    };

    mediaRecorder.start();
    alert("Recording started!");
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
}

document.getElementById("recordBtn").onclick = startRecording;
document.getElementById("stopBtn").onclick = stopRecording;

// ------------------ PROCESS AUDIO (ALIEN TIMBRE + SMOOTH ROBOTIC MODE) ------------------

document.getElementById("processBtn").onclick = async () => {
    if (!recordedBlob) {
        alert("Record first!");
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

    // Fibonacci offsets for phase lensing
    const fib = [1, 2, 3, 5, 8, 13];
    const strength = 0.0035;

    // New robotic smoothing settings
    const roboPhaseSteps = 32;  // more = smoother robot tone
    const roboStrength = 0.18;  // blend amount

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const input = audioBuffer.getChannelData(ch);
        const output = processed.getChannelData(ch);

        for (let i = 0; i < input.length; i++) {
            let sample = input[i];

            // --- TEMPORAL FIBONACCI LENS (ALIEN TIMBRE WARP) ---
            let warped = 0;
            for (let f of fib) {
                let offset = Math.floor(f * strength * audioBuffer.sampleRate);
                let index = i + offset;
                if (index < input.length) {
                    warped += input[index] * Math.cos(f * 0.33);
                }
            }

            // Blend timbre warp into original
            let timbreWarp = (sample * 0.7) + (warped * 0.3);

            // --- SMOOTH ROBOTIC PHASE QUANTIZATION ---
            const phase = Math.atan2(timbreWarp, 1.0); 
            const step = (Math.PI * 2) / roboPhaseSteps;
            const quantizedPhase = Math.round(phase / step) * step;

            const robotic = Math.sin(quantizedPhase);

            // Final blend: smooth robotic + alien timbre
            output[i] = (timbreWarp * (1 - roboStrength)) + (robotic * roboStrength);
        }
    }

    // Export WAV
    const wavBlob = bufferToWav(processed);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(wavBlob);
    a.download = "glitchbox-processed.wav";
    a.click();
};

// -------- WAV ENCODER --------
function bufferToWav(buffer) {
    const numOfChannels = buffer.numberOfChannels;
    const length = buffer.length * numOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    let offset = 0;

    function writeString(str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset++, str.charCodeAt(i));
        }
    }

    // WAV header
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

    // PCM samples
    let pos = 44;
    for (let c = 0; c < numOfChannels; c++) {
        const channel = buffer.getChannelData(c);
        for (let i = 0; i < channel.length; i++) {
            let val = Math.max(-1, Math.min(1, channel[i]));
            view.setInt16(pos, val * 0x7FFF, true);
            pos += 2;
        }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
}
