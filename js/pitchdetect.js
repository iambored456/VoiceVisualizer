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
var yAxisWidth = 100;      // Width reserved for the y-axis labels
var plotStartX = yAxisWidth; // Starting position after the left y-axis
var plotWidth = 1150;      // Width of the plotting area
var plotHeight = 500;     // Height of the plotting area
var plotMaxFreq = 700;    // Maximum frequency to display on the plot

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
// Define pitch classes for each column
const ColumnAPitchClasses = ["C", "D", "E", "F#", "G#", "A#"];
const ColumnBPitchClasses = ["C#", "D#", "F", "G", "A", "B"];

/**
 * @param {Array} notes - Array of note objects within the frequency range.
 * @param {number} logMin - Logarithm of the minimum frequency.
 * @param {number} logMax - Logarithm of the maximum frequency.
 * @param {number} plotHeight - Height of the plotting area in pixels.
 */

function drawYAxis(notes, logMin, logMax, plotHeight) {
    if (!plotCtx) return;

    // Clear existing y-axis area
    plotCtx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);

    // Set font and styles for labels
    plotCtx.font = "18px Arial";
    plotCtx.textBaseline = "middle";

    // Column positions for labels
    const rightLeftColumnX = yAxisWidth + plotWidth + 25;
    const rightRightColumnX = yAxisWidth + plotWidth + 75;
    const leftLeftColumnX = yAxisWidth - 25;
    const leftRightColumnX = yAxisWidth - 75;

    // Label background colors
    const labelBackgroundColors = {
        "C": "#f090ae",
        "D": "#ea9e5e",
        "E": "#a8bd61",
        "F": "#76c788",
        "G": "#33c6dc",
        "A": "#94adff",
        "B": "#dd95d6"
    };

    // Initialize previous Y position to handle gray background rows
    let prevY = plotHeight;


    // Iterate through notes to draw labels and grid lines
    notes.forEach(function (note) {
        const logFreq = Math.log(note.freq);
        const normalized = (logFreq - logMin) / (logMax - logMin);
        const y = plotHeight - normalized * plotHeight;

        const pitchClass = note.label.slice(0, -1); // Extract pitch class
        const isColumnA = ColumnAPitchClasses.includes(pitchClass);

        
        // Draw horizontal lines (left y-axis)
        plotCtx.beginPath();
        if (isColumnA) {
            plotCtx.moveTo(0, y);
            plotCtx.lineTo(yAxisWidth / 2, y);
        } else {
            plotCtx.moveTo(yAxisWidth / 2, y);
            plotCtx.lineTo(yAxisWidth, y);
        }
        plotCtx.strokeStyle = "black";
        plotCtx.lineWidth = 1;
        plotCtx.stroke();
        // Draw horizontal lines (right y-axis)
        plotCtx.beginPath();
        if (isColumnA) {
            plotCtx.moveTo(yAxisWidth + plotWidth + yAxisWidth / 2, y);
            plotCtx.lineTo(yAxisWidth + plotWidth + yAxisWidth, y);
        } else {
            plotCtx.moveTo(yAxisWidth + plotWidth, y);
            plotCtx.lineTo(yAxisWidth + plotWidth + yAxisWidth / 2, y);
        }
        plotCtx.strokeStyle = "black";
        plotCtx.lineWidth = 1;
        plotCtx.stroke();


        // Draw label backgrounds and text for left and right y-axis
        const drawLabel = (x, y) => {
            if (labelBackgroundColors[pitchClass]) {
                plotCtx.fillStyle = labelBackgroundColors[pitchClass];
                plotCtx.fillRect(x - 25, y - 13, 50, 26);
            }
            plotCtx.fillStyle = "black"; // Reset text color
            plotCtx.textAlign = "center";
            plotCtx.fillText(note.label, x, y);
        };

        // Draw left-side labels
        drawLabel(isColumnA ? leftLeftColumnX : leftRightColumnX, y);

        // Draw right-side labels
        drawLabel(isColumnA ? rightLeftColumnX : rightRightColumnX, y);
       
        // Handle "G" rows with a gray background
        if (pitchClass === "G") {
            const rowHeight = prevY - y; // Calculate row height
            if (rowHeight > 0) {
                plotCtx.fillStyle = "rgba(200, 200, 200, 0.5)"; // Light gray
                plotCtx.fillRect(plotStartX, y - 13, plotWidth, 26);
            }
        }
       
        // Skip drawing lines for accidentals
        if (["C#", "D#", "F", "G", "A", "B"].includes(pitchClass)) {
            return; // Skip this iteration
        }
        // Handle grid lines and specific logic
        if (pitchClass === "C") {
            plotCtx.strokeStyle = "#FF0000"; // Red for C
            plotCtx.lineWidth = 2;
        } else if (pitchClass === "E") {
            plotCtx.strokeStyle = "#000000"; // Black dashed for E
            plotCtx.lineWidth = 1;
            plotCtx.setLineDash([5, 5]);
        } else if (["D", "F#", "G#", "A#"].includes(pitchClass)) {
            plotCtx.strokeStyle = "#000000"; // Solid black for D, F#, G#, A#
            plotCtx.lineWidth = 1;
            plotCtx.setLineDash([]); // Ensure solid line
        }

        // Draw the actual grid line
        plotCtx.beginPath();
        plotCtx.moveTo(plotStartX, y);
        plotCtx.lineTo(plotStartX + plotWidth, y);
        plotCtx.stroke();



        // Reset dash style after drawing
        plotCtx.setLineDash([]);
    });

    // Draw vertical y-axis lines
    plotCtx.beginPath();
    plotCtx.moveTo(yAxisWidth, 0);
    plotCtx.lineTo(yAxisWidth, plotHeight);
    plotCtx.stroke();

    plotCtx.beginPath();
    plotCtx.moveTo(plotWidth + yAxisWidth, 0);
    plotCtx.lineTo(plotWidth + yAxisWidth, plotHeight);
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
    // Map timeDifference to x coordinate, scrolling from right to left
    // timeDifference should be within [0, timeWindow]
    return plotStartX + plotWidth - (timeDifference / timeWindow) * plotWidth;
}

function scaleY(noteValue) {
    // Map noteValue to y coordinate
    // Assuming noteValue is within the MIDI note range in notesInRange
    var minNote = notesInRange[0].midi;
    var maxNote = notesInRange[notesInRange.length - 1].midi;
    var normalized = (noteValue - minNote) / (maxNote - minNote);
    return plotHeight - normalized * plotHeight;
}

// Custom palette for 12 notes
const noteColors = {
    0: "#f090ae",  // C
    1: "#f59383",  // C#/Db
    2: "#ea9e5e",  // D
    3: "#d0ae4e",  // D#/Eb
    4: "#a8bd61",  // E
    5: "#76c788",  // F
    6: "#41cbb5",  // F#/Gb
    7: "#33c6dc",  // G
    8: "#62bbf7",  // G#/Ab
    9: "#94adff",  // A
    10: "#bea0f3", // A#/Bb
    11: "#dd95d6"  // B
};

// Convert hex to RGB
function hexToRgb(hex) {
    let bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

// Interpolate between two RGB colors
function interpolateRgb(color1, color2, factor) {
    return color1.map((c, i) => Math.round(c + factor * (color2[i] - c)));
}

// Get color for a MIDI note, interpolating between base colors
function colorFromNoteCustom(note) {
    let baseNote = Math.floor(note % 12);
    let nextNote = (baseNote + 1) % 12;

    // Convert colors to RGB
    let baseColor = hexToRgb(noteColors[baseNote]);
    let nextColor = hexToRgb(noteColors[nextNote]);

    // Interpolation factor for fractional note values
    let factor = note % 1;

    // Interpolate and return as RGB array
    return interpolateRgb(baseColor, nextColor, factor);
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
    plotCtx.clearRect(plotStartX, 0, plotWidth, plotHeight);

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

        // Reverse the x-coordinate to scroll from right to left
        var x = plotStartX + plotWidth - (currentTime - t) / timeWindow * plotWidth;
        var y = scaleY(note + centsOff / 100);

        var color = colorFromNoteCustom(note);
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
