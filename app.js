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

    const fib = [2, 3, 5, 8, 13];
    const grainSize = 64;           // smooth grains
    const roboticSnap = 0.12;       // how robotic the alignment is
    const warpStrength = 0.25;      // overall timbre warp

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const input = audioBuffer.getChannelData(ch);
        const output = processed.getChannelData(ch);

        for (let i = 0; i < input.length; i++) {
            let sample = input[i];

            // --- SMOOTH GRAIN PHASE ALIGNMENT (robotic) ---
            const grainIndex = Math.floor(i / grainSize);
            const grainPos = i % grainSize;

            // snap phase position using Fibonacci ratios
            let snappedPos = Math.floor(
                grainPos * (1 - roboticSnap) +
                (grainPos * fib[grainIndex % fib.length] % grainSize) * roboticSnap
            );

            // ensure bounds
            snappedPos = Math.min(grainSize - 1, Math.max(0, snappedPos));

            const baseIndex = grainIndex * grainSize + snappedPos;
            const smoothSample = input[baseIndex] || sample;

            // --- TIMBRE WARP (phase lattice) ---
            let warped = 0;
            for (let f of fib) {
                const offset = Math.floor(f * 4); // tiny offsets, not delay
                const idx = i + offset;
                if (idx < input.length) {
                    // soft robotic sheen
                    warped += input[idx] * Math.cos(f * 0.15);
                }
            }

            // combine:
            output[i] = 
                (sample * 0.5) +        // natural voice
                (smoothSample * 0.3) +  // smooth robotic alignment
                (warped * warpStrength);
        }
    }

    const wavBlob = bufferToWav(processed);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(wavBlob);
    a.download = "glitchbox-processed.wav";
    a.click();
};

