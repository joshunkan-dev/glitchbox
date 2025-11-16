let mediaRecorder;
let audioChunks = [];
let recordedBlob = null;
let processedBlob = null;

// ------------------ RECORDING ------------------

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

// ------------------ PROCESS WITHOUT DOWNLOADING ------------------

document.getElementById("processBtn").onclick = async () => {
    if (!recordedBlob) {
        alert("Record something first!");
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

    // Fibonacci timbre-warp factors
    const fib = [1, 2, 3, 5, 8, 13];
    const strength = 0.0035;

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const input = audioBuffer.getChannelData(ch);
        const output = processed.getChannelData(ch);

        for (let i = 0; i < input.length; i++) {
            let sample = input[i];
            let warped = 0;

            for (let f of fib) {
                let offset = Math.floor(f * strength * audioBuffer.sampleRate);
                let index = i + offset;

                if (index < input.length) {
                    warped += input[index] * Math.cos(f * 0.33);
                }
            }

            output[i] = (sample * 0.7) + (warped * 0.3);
        }
    }

    processedBlob = bufferToWav(processed);

    // Audio player preview
    const audioURL = URL.createObjectURL(processedBlob);
    document.getElementById("preview").src = audioURL;

    alert("Processing complete! Listen to preview or download below.");
};

// ------------------ DOWNLOAD BUTTON ------------------

document.getElementById("downloadBtn").onclick = () => {
    if (!processedBlob) {
        alert("You must process audio first!");
        return;
    }

    const a = document.createElement("a");
    a.href = URL.createObjectURL(processedBlob);
    a.download = "glitchbox-processed.wav";
    a.click();
};

// ------------------ WAV ENCODER ------------------

function bufferToWav(buffer) {
    const numOfChannels = buffer.numberOfChannels;
    const length = buffer.length * numOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    let offset = 0;

    function writeString(s) {
        for (let i = 0; i < s.length; i++) {
            view.setUint8(offset++, s.charCodeAt(i));
        }
    }

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
            let val = Math.max(-1, Math.min(1, channel[i]));
            view.setInt16(pos, val * 0x7FFF, true);
            pos += 2;
        }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
}
