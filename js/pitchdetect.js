window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var DEBUGCANVAS = null;
var mediaStreamSource = null;

var detectorElem, 
    canvasElem,
    waveCanvas,
    pitchElem,
    noteElem,
    detuneElem,
    detuneAmount;

// Variables for the frequency scrolling plot
var plotCanvas = null;
var plotCtx = null;
var plotData = [];
var plotWidth = 2000;      // Width of the plotting area
var plotHeight = 500;     // Height of the plotting area
var plotMaxFreq = 700;    // Maximum frequency to display on the plot
var yAxisWidth = 60;      // Width reserved for the y-axis labels

// Variables for the notes visualization
var noteCanvas = null;
var noteCtx = null;
var frequencies = [];     // Array to store frequency data points

// Define the note names in an octave
var noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Define minimum frequency
var minFreq = 87; // in Hz

// Variables for y-axis
var notesInRange = [];
var logMin = 0;
var logMax = 0;

// Define proximity threshold for connecting points (in pixels)
const proximityThreshold = 50;
// Maximum number of connections per point to optimize performance
const maxConnections = 5;

// Time window for visualization (in milliseconds)
const timeWindow = 5000; // 5 seconds

window.onload = function() {
    audioContext = new AudioContext();
    MAX_SIZE = Math.max(4, Math.floor(audioContext.sampleRate / 5000)); // corresponds to a 5kHz signal

    detectorElem = document.getElementById("detector");
    canvasElem = document.getElementById("output");
    DEBUGCANVAS = document.getElementById("waveform");
    if (DEBUGCANVAS) {
        waveCanvas = DEBUGCANVAS.getContext("2d");
        waveCanvas.strokeStyle = "black";
        waveCanvas.lineWidth = 1;
    }
    pitchElem = document.getElementById("pitch");
    noteElem = document.getElementById("note");
    detuneElem = document.getElementById("detune");
    detuneAmount = document.getElementById("detune_amt");

    // Initialize the frequency plot canvas and context
    plotCanvas = document.getElementById("frequencyPlot");
    if (plotCanvas) {
        plotCtx = plotCanvas.getContext("2d");
    }

    // Initialize the notes canvas and context
    noteCanvas = document.getElementById("noteCanvas");
    if (noteCanvas) {
        noteCtx = noteCanvas.getContext("2d");
    }

    // Generate notes within the frequency range
    notesInRange = generateNotes(minFreq, plotMaxFreq);
    logMin = Math.log(minFreq);
    logMax = Math.log(plotMaxFreq);

    // Initial draw of the y-axis
    if (plotCtx) {
        drawYAxis(notesInRange, logMin, logMax, plotHeight);
    }

    // Initial draw of the notes (empty)
    if (noteCtx) {
        drawNotes();
    }
}

// Function to calculate frequency from MIDI note number
function frequencyFromNoteNumber(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

// Generate a list of notes within the frequency range
function generateNotes(minFreq, maxFreq) {
    var notes = [];
    for (var midi = 12; midi <= 108; midi++) { // MIDI notes from C0 (12) to C8 (108)
        var freq = frequencyFromNoteNumber(midi);
        if (freq >= minFreq && freq <= maxFreq) {
            var octave = Math.floor(midi / 12) - 1;
            var noteName = noteNames[midi % 12] + octave;
            notes.push({ midi: midi, freq: freq, label: noteName });
        }
    }
    return notes;
}

// Function to draw the y-axis with note labels
function drawYAxis(notes, logMin, logMax, plotHeight) {
    if (!plotCtx) return;

    // Clear existing y-axis
    plotCtx.clearRect(plotWidth, 0, yAxisWidth, plotHeight);

    // Set font for labels
    plotCtx.font = "12px Arial";
    plotCtx.fillStyle = "black";
    plotCtx.textAlign = "left";
    plotCtx.textBaseline = "middle";

    notes.forEach(function(note) {
        // Calculate the y position for the note
        var logFreq = Math.log(note.freq);
        var normalized = (logFreq - logMin) / (logMax - logMin);
        var y = plotHeight - normalized * plotHeight;

        // Draw a horizontal line for reference (optional)
        plotCtx.strokeStyle = "#e0e0e0";
        plotCtx.beginPath();
        plotCtx.moveTo(0, y);
        plotCtx.lineTo(plotWidth, y);
        plotCtx.stroke();

        // Draw the note label on the right side
        plotCtx.fillStyle = "black";
        plotCtx.fillText(note.label, plotWidth + 5, y); // 5 pixels padding from the plot edge
    });

    // Optionally, draw the y-axis line
    plotCtx.strokeStyle = "black";
    plotCtx.beginPath();
    plotCtx.moveTo(plotWidth, 0);
    plotCtx.lineTo(plotWidth, plotHeight);
    plotCtx.stroke();
}

// Function to start pitch detection
function startPitchDetect() {
    // grab an audio context
    audioContext = new AudioContext();

    // Attempt to get audio input
    navigator.mediaDevices.getUserMedia({
        "audio": {
            "mandatory": {
                "googEchoCancellation": "false",
                "googAutoGainControl": "false",
                "googNoiseSuppression": "false",
                "googHighpassFilter": "false"
            },
            "optional": []
        },
    }).then((stream) => {
        // Create an AudioNode from the stream.
        mediaStreamSource = audioContext.createMediaStreamSource(stream);

        // Connect it to the analyser.
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        mediaStreamSource.connect(analyser);
        updatePitch();
    }).catch((err) => {
        // always check for errors at the end.
        console.error(`${err.name}: ${err.message}`);
        alert('Stream generation failed.');
    });
}

// Toggle live input (start/stop)
function toggleLiveInput() {
    if (isPlaying) {
        // Stop playing and return
        sourceNode.stop(0);
        sourceNode = null;
        analyser = null;
        isPlaying = false;
        if (!window.cancelAnimationFrame)
            window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame(rafID);
        return;
    }

    // Start live input using navigator.mediaDevices.getUserMedia
    navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false,
            highpassFilter: false
        }
    })
    .then(gotStream)
    .catch((err) => {
        console.error(`${err.name}: ${err.message}`);
        alert('Live input failed.');
    });
}

// Handle the stream
function gotStream(stream) {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    mediaStreamSource.connect(analyser);
    isPlaying = true;
    updatePitch();
}

var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Float32Array(buflen);

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Helper functions for note calculation
function noteFromPitch(frequency) {
    var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
}

function frequencyFromNoteNumber(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

function centsOffFromPitch(frequency, note) {
    return Math.floor(
        1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2)
    );
}

// Autocorrelation approach for pitch detection
function autoCorrelate(buf, sampleRate) {
    // Implements the ACF2+ algorithm
    var SIZE = buf.length;
    var rms = 0;

    for (var i = 0; i < SIZE; i++) {
        var val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) // not enough signal
        return -1;

    var r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (var i = 0; i < SIZE / 2; i++)
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (var i = 1; i < SIZE / 2; i++)
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    var c = new Array(SIZE).fill(0);
    for (var i = 0; i < SIZE; i++)
        for (var j = 0; j < SIZE - i; j++)
            c[i] += buf[j] * buf[j + i];

    var d = 0; 
    while (c[d] > c[d + 1]) d++;
    var maxval = -1, maxpos = -1;
    for (var i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    var T0 = maxpos;

    var x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    var a = (x1 + x3 - 2 * x2) / 2;
    var b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

// Scaling functions
function scaleX(timeDifference) {
    // Map timeDifference to x coordinate
    // timeDifference should be within [0, timeWindow]
    return (timeDifference / timeWindow) * plotWidth;
}

function scaleY(noteValue) {
    // Map noteValue to y coordinate
    // Assuming noteValue is within the MIDI note range in notesInRange
    var minNote = notesInRange[0].midi;
    var maxNote = notesInRange[notesInRange.length - 1].midi;
    var normalized = (noteValue - minNote) / (maxNote - minNote);
    return plotHeight - normalized * plotHeight;
}

// Function to assign color based on MIDI note number
function colorFromNote(note) {
    // Assign a color based on the MIDI note number
    // Cycle through hues based on note modulo 12
    var hue = (note % 12) * 30; // 12 semitones, 360 degrees
    var saturation = 100; // in percentage
    var lightness = 50; // in percentage

    // Convert HSL to RGB
    return hslToRgb(hue, saturation, lightness);
}

// Helper function to convert HSL to RGB
function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;

    var c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
        m = l - c / 2,
        r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return [r, g, b];
}

// Function to draw notes as circles and connect nearby points
function drawNotes() {
    if (!noteCtx) return;

    var w = noteCanvas.width;
    var h = noteCanvas.height;

    // Clear the canvas
    noteCtx.clearRect(0, 0, w, h);

    var currentTime = Date.now();

    // Convert frequencies -> (x,y) for drawing
    var notes = frequencies.map(function(freqData) {
        var t = freqData.time;
        var f = freqData.frequency;
        var c = freqData.clarity;

        // Convert frequency to MIDI note and cents offset
        var note = noteFromPitch(f); // e.g., 48 for C4
        var centsOff = centsOffFromPitch(f, note);

        var x = scaleX(currentTime - t); // timeDifference should be positive
        var y = scaleY(note + centsOff / 100);

        var color = colorFromNote(note);
        return { time: t, x: x, y: y, clarity: c, color: color };
    });

    // Draw lines between nearby points
    noteCtx.strokeStyle = 'rgba(0,0,0,0.1)';
    noteCtx.lineWidth = 1;
    noteCtx.beginPath();

    for (var i = 0; i < notes.length; i++) {
        var connections = 0;
        for (var j = i + 1; j < notes.length && connections < maxConnections; j++) {
            var dx = notes[i].x - notes[j].x;
            var dy = notes[i].y - notes[j].y;
            var distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= proximityThreshold) {
                noteCtx.moveTo(notes[i].x, notes[i].y);
                noteCtx.lineTo(notes[j].x, notes[j].y);
                connections++;
            }
        }
    }

    noteCtx.stroke();

    // Draw circles for each note
    notes.forEach(function(note) {
        var opacity = Math.min(note.clarity * 0.5, 1);
        noteCtx.fillStyle = `rgba(${note.color[0]}, ${note.color[1]}, ${note.color[2]}, ${opacity})`;
        noteCtx.beginPath();
        noteCtx.arc(note.x, note.y, 3, 0, Math.PI * 2);
        noteCtx.fill();
    });
}

// Function to handle pitch updates
function updatePitch(time) {
    analyser.getFloatTimeDomainData(buf);
    var ac = autoCorrelate(buf, audioContext.sampleRate);

    // This draws the current waveform on the optional debugging canvas
    if (DEBUGCANVAS) {
        waveCanvas.clearRect(0,0,512,256);
        waveCanvas.strokeStyle = "red";
        waveCanvas.beginPath();
        waveCanvas.moveTo(0,0);
        waveCanvas.lineTo(0,256);
        waveCanvas.moveTo(128,0);
        waveCanvas.lineTo(128,256);
        waveCanvas.moveTo(256,0);
        waveCanvas.lineTo(256,256);
        waveCanvas.moveTo(384,0);
        waveCanvas.lineTo(384,256);
        waveCanvas.moveTo(512,0);
        waveCanvas.lineTo(512,256);
        waveCanvas.stroke();
        waveCanvas.strokeStyle = "black";
        waveCanvas.beginPath();
        waveCanvas.moveTo(0, buf[0]);
        for (var i = 1; i < 512; i++) {
            waveCanvas.lineTo(i, 128 + (buf[i] * 128));
        }
        waveCanvas.stroke();
    }

    if (ac == -1) {
        detectorElem.className = "vague";
        pitchElem.innerText = "--";
        noteElem.innerText = "-";
        detuneElem.className = "";
        detuneAmount.innerText = "--";

        // Pass 0 frequency to the plot if no pitch detected
        updatePlot(0);
    } else {
        detectorElem.className = "confident";
        var pitch = ac;
        pitchElem.innerText = Math.round(pitch);
        var note = noteFromPitch(pitch);
        noteElem.innerHTML = noteStrings[note % 12];
        var detune = centsOffFromPitch(pitch, note);
        if (detune == 0) {
            detuneElem.className = "";
            detuneAmount.innerHTML = "--";
        } else {
            if (detune < 0)
                detuneElem.className = "flat";
            else
                detuneElem.className = "sharp";
            detuneAmount.innerHTML = Math.abs(detune);
        }

        // Update frequency plot
        updatePlot(pitch);
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = window.webkitRequestAnimationFrame;
    rafID = window.requestAnimationFrame(updatePitch);
}

// Function to draw the scrolling frequency plot and y-axis
function updatePlot(frequency) {
    if (!plotCtx || !noteCtx) return;

    var currentTime = Date.now();

    // Handle cases where frequency is out of bounds or not detected
    if (frequency < minFreq) {
        frequency = minFreq;
    } else if (frequency > plotMaxFreq) {
        frequency = plotMaxFreq;
    }

    // Apply logarithmic scaling
    var logFreq = Math.log(frequency);

    // Normalize the logarithmic frequency to fit the canvas height
    var y = plotHeight - ((logFreq - logMin) / (logMax - logMin)) * plotHeight;

    // Clamp the y value to ensure it stays within the canvas
    y = Math.max(0, Math.min(plotHeight, y));

    // Add the new data point with timestamp
    plotData.push({ y: y, time: currentTime });

    // If we exceed the time window, remove the oldest point
    while (plotData.length > 0 && (currentTime - plotData[0].time) > timeWindow) {
        plotData.shift();
    }

    // Add to frequencies array for drawNotes
    if (frequency > 0) { // Only add valid frequencies
        frequencies.push({ frequency: frequency, time: currentTime, clarity: 1 }); // clarity can be adjusted based on RMS or other metrics
    }

    // Remove old frequencies outside the time window
    while (frequencies.length > 0 && (currentTime - frequencies[0].time) > timeWindow) {
        frequencies.shift();
    }

    // Clear the plot canvas
    plotCtx.clearRect(0, 0, plotWidth + yAxisWidth, plotHeight);

    // Draw the y-axis with labels
    drawYAxis(notesInRange, logMin, logMax, plotHeight);

    // Draw the notes visualization
    drawNotes();
}

// Function to draw notes as circles and connect nearby points
function drawNotes() {
    if (!noteCtx) return;

    var w = noteCanvas.width;
    var h = noteCanvas.height;

    var currentTime = Date.now();

    // Clear the canvas
    noteCtx.clearRect(0, 0, w, h);

    // Convert frequencies -> (x,y) for drawing
    var notes = frequencies.map(function(freqData) {
        var t = freqData.time;
        var f = freqData.frequency;
        var c = freqData.clarity;

        // Convert frequency to MIDI note and cents offset
        var note = noteFromPitch(f); // e.g., 48 for C4
        var centsOff = centsOffFromPitch(f, note);

        var x = scaleX(currentTime - t); // timeDifference should be positive
        var y = scaleY(note + centsOff / 100);

        var color = colorFromNote(note);
        return { time: t, x: x, y: y, clarity: c, color: color };
    });

    // Draw lines between nearby points
    noteCtx.strokeStyle = 'rgba(0,0,0,0.1)';
    noteCtx.lineWidth = 1;
    noteCtx.beginPath();

    for (var i = 0; i < notes.length; i++) {
        var connections = 0;
        for (var j = i + 1; j < notes.length && connections < maxConnections; j++) {
            var dx = notes[i].x - notes[j].x;
            var dy = notes[i].y - notes[j].y;
            var distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= proximityThreshold) {
                noteCtx.moveTo(notes[i].x, notes[i].y);
                noteCtx.lineTo(notes[j].x, notes[j].y);
                connections++;
            }
        }
    }

    noteCtx.stroke();

    // Draw circles for each note
    notes.forEach(function(note) {
        var opacity = Math.min(note.clarity * 0.5, 1);
        noteCtx.fillStyle = `rgba(${note.color[0]}, ${note.color[1]}, ${note.color[2]}, ${opacity})`;
        noteCtx.beginPath();
        noteCtx.arc(note.x, note.y, 3, 0, Math.PI * 2);
        noteCtx.fill();
    });
}
