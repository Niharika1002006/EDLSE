
/* ==========================================================================
   MindFlow Face Tracker & Emotion Detector (detector.js)
   Powered by face-api.js (vladmandic) running client-side
   ========================================================================== */

const Detector = {
    // Face detection models CDN
    modelUrl: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/',

    modelsLoaded: false,
    trackingInterval: null,
    isTracking: false,
    isDetecting: false,

    // Emotion values
    activeEmotions: {
        neutral: 0.5,
        happy: 0.0,
        sad: 0.0,
        angry: 0.0,
        fearful: 0.0,
        disgusted: 0.0,
        surprised: 0.0
    },

    // Focus and stress values
    focusScore: 50,
    stressScore: 0,
    boredomScore: 0,
    noFaceCount: 0,

    // Load AI models
    async init() {
        const modelStatusLabel =
            document.querySelector('#model-status .status-label');

        const modelStatusDot =
            document.querySelector('#model-status .pulse-dot');

        this.modelsLoaded = false;

        try {
            console.log("MindFlow: Checking Face API...");

            // Check whether Face API library is available
            if (!window.faceapi) {
                throw new Error("Face API library was not loaded.");
            }

            // Load both required models
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(this.modelUrl),
                faceapi.nets.faceExpressionNet.loadFromUri(this.modelUrl)
            ]);

            this.modelsLoaded = true;

            if (modelStatusLabel) {
                modelStatusLabel.textContent = "AI Models Active";
            }

            if (modelStatusDot) {
                modelStatusDot.className = "pulse-dot green";
            }

            console.log("MindFlow: AI models loaded successfully.");

            if (window.App && window.App.logEvent) {
                window.App.logEvent(
                    "System",
                    "AI models loaded successfully.",
                    "Ready"
                );
            }

            return true;

        } catch (error) {
            this.modelsLoaded = false;

            console.error("MindFlow model loading failed:", error);

            if (modelStatusLabel) {
                modelStatusLabel.textContent = "AI Models Failed to Load";
            }

            if (modelStatusDot) {
                modelStatusDot.className = "pulse-dot red";
            }

            return false;
        }
    },

    // Start webcam emotion tracking
    startTracking(videoEl, canvasEl, onMetricsUpdate) {

        if (!this.modelsLoaded) {
            console.error("MindFlow: AI models are not loaded.");
            return false;
        }

        if (this.isTracking) {
            console.warn("MindFlow: Tracking is already running.");
            return false;
        }

        if (!videoEl || !canvasEl) {
            console.error("MindFlow: Video or canvas element not found.");
            return false;
        }

        if (videoEl.readyState < 2) {
            console.error("MindFlow: Webcam video is not ready.");
            return false;
        }

        this.isTracking = true;

        const ctx = canvasEl.getContext('2d');

        if (!ctx) {
            console.error("MindFlow: Canvas context not available.");
            this.isTracking = false;
            return false;
        }

        // Match canvas size with webcam video
        const resizeCanvas = () => {
            const width = videoEl.videoWidth;
            const height = videoEl.videoHeight;

            if (width > 0 && height > 0) {
                const displaySize = { width, height };
                faceapi.matchDimensions(canvasEl, displaySize);
                return displaySize;
            }

            return null;
        };

        resizeCanvas();

        // Face detection loop
        this.trackingInterval = setInterval(async () => {

            if (
                !this.isTracking ||
                videoEl.paused ||
                videoEl.ended ||
                videoEl.readyState < 2
            ) {
                return;
            }

            // Prevent overlapping detection requests
            if (this.isDetecting) {
                return;
            }

            this.isDetecting = true;

            try {
                // Update canvas dimensions if needed
                if (
                    canvasEl.width !== videoEl.videoWidth ||
                    canvasEl.height !== videoEl.videoHeight
                ) {
                    resizeCanvas();
                }

                // Detect face and facial expressions
                const detection = await faceapi.detectSingleFace(
                    videoEl,
                    new faceapi.TinyFaceDetectorOptions({
                        inputSize: 320,
                        scoreThreshold: 0.15
                    })
                ).withFaceExpressions();

                // Clear previous drawing
                ctx.clearRect(
                    0,
                    0,
                    canvasEl.width,
                    canvasEl.height
                );

                if (detection) {

                    this.noFaceCount = 0;

                    // Update detected emotions
                    this.activeEmotions = {
                        ...detection.expressions
                    };

                    // Calculate focus, stress and boredom
                    this.calculateMetrics();

                    // Draw face tracking HUD
                    this.drawHUD(
                        ctx,
                        detection.detection.box,
                        this.getDominantEmotion()
                    );

                } else {

                    this.noFaceCount++;

                    if (this.noFaceCount > 15) {
                        this.focusScore = Math.max(
                            0,
                            this.focusScore - 2
                        );

                        this.boredomScore = Math.min(
                            100,
                            this.boredomScore + 1
                        );

                        this.activeEmotions.neutral = 0.8;
                    }

                    this.drawHUD(ctx, null, "Searching...");
                }

                // Send updated values to dashboard
                if (onMetricsUpdate) {
                    onMetricsUpdate({
                        emotions: this.activeEmotions,
                        focus: this.focusScore,
                        stress: this.stressScore,
                        boredom: this.boredomScore,
                        facePresent: !!detection
                    });
                }

            } catch (error) {
                console.error(
                    "MindFlow tracking error:",
                    error
                );

            } finally {
                this.isDetecting = false;
            }

        }, 250);

        console.log("MindFlow: Face tracking started.");
        return true;
    },

    // Stop emotion tracking
    stopTracking(canvasEl) {

        this.isTracking = false;
        this.isDetecting = false;

        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }

        if (canvasEl) {
            const ctx = canvasEl.getContext('2d');

            if (ctx) {
                ctx.clearRect(
                    0,
                    0,
                    canvasEl.width,
                    canvasEl.height
                );
            }
        }

        console.log("MindFlow: Face tracking stopped.");
    },

    // Calculate focus, stress and boredom
    calculateMetrics() {

        const {
            happy,
            sad,
            angry,
            fearful,
            neutral,
            surprised,
            disgusted
        } = this.activeEmotions;

        // Stress calculation
        const stressWeight =
            (angry * 1.0) +
            (fearful * 0.7) +
            (sad * 0.5) +
            (disgusted * 0.4);

        this.stressScore = Math.round(
            Math.min(100, stressWeight * 100)
        );

        // Typing activity
        const isTyping = window.Sentiment
            ? window.Sentiment.isTyping()
            : false;

        const typingBoredomFactor = isTyping ? 0.3 : 1.0;

        this.boredomScore = Math.round(
            Math.min(
                100,
                neutral * 80 * typingBoredomFactor + sad * 20
            )
        );

        // Focus calculation
        let baseFocus =
            (neutral * 70) +
            (happy * 100) +
            (surprised * 60);

        if (window.Sentiment && window.Sentiment.wpm > 20) {
            baseFocus += Math.min(
                15,
                window.Sentiment.wpm / 4
            );
        }

        const penalty =
            (this.stressScore * 0.3) +
            (this.boredomScore * 0.2);

        this.focusScore = Math.round(
            Math.max(
                0,
                Math.min(100, baseFocus - penalty)
            )
        );
    },

    // Find the strongest detected emotion
    getDominantEmotion() {

        let maxVal = -1;
        let dominant = "neutral";

        for (const [emotion, value] of Object.entries(
            this.activeEmotions
        )) {
            if (value > maxVal) {
                maxVal = value;
                dominant = emotion;
            }
        }

        return dominant;
    },

    // Draw face tracking HUD
    drawHUD(ctx, box, statusText) {

        if (!box) {

            ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.moveTo(10, 20);
            ctx.lineTo(ctx.canvas.width - 10, 20);
            ctx.stroke();

            // Show searching message
            ctx.font = 'bold 12px system-ui';
            ctx.fillStyle = 'rgba(99, 102, 241, 0.9)';
            ctx.fillText(
                "Searching for face...",
                15,
                40
            );

            return;
        }

        const { x, y, width, height } = box;

        // Select HUD colour
        let hudColor = 'rgba(99, 102, 241, 0.85)';

        if (this.stressScore > 50) {
            hudColor = 'rgba(239, 68, 68, 0.85)';
        } else if (this.focusScore > 75) {
            hudColor = 'rgba(16, 185, 129, 0.85)';
        } else if (this.boredomScore > 65) {
            hudColor = 'rgba(245, 158, 11, 0.85)';
        }

        ctx.strokeStyle = hudColor;
        ctx.lineWidth = 2;

        // Corner brackets
        const len = Math.min(width, height) * 0.15;

        // Top left
        ctx.beginPath();
        ctx.moveTo(x + len, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.stroke();

        // Top right
        ctx.beginPath();
        ctx.moveTo(x + width - len, y);
        ctx.lineTo(x + width, y);
        ctx.lineTo(x + width, y + len);
        ctx.stroke();

        // Bottom left
        ctx.beginPath();
        ctx.moveTo(x, y + height - len);
        ctx.lineTo(x, y + height);
        ctx.lineTo(x + len, y + height);
        ctx.stroke();

        // Bottom right
        ctx.beginPath();
        ctx.moveTo(x + width, y + height - len);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x + width - len, y + height);
        ctx.stroke();

        // Face box background
        ctx.fillStyle = hudColor.replace('0.85', '0.03');
        ctx.fillRect(x, y, width, height);

        // Emotion label
        ctx.font = 'bold 11px Inter, system-ui';
        const capitalizedEmotion =
            statusText.charAt(0).toUpperCase() +
            statusText.slice(1);

        const labelText = `SYS TRACK: ${capitalizedEmotion}`;
        const textWidth = ctx.measureText(labelText).width;

        // Label background
        ctx.fillStyle = 'rgba(11, 9, 21, 0.85)';
        ctx.fillRect(
            x,
            Math.max(0, y - 22),
            textWidth + 16,
            18
        );

        // Label border
        ctx.strokeStyle = hudColor;
        ctx.lineWidth = 1;

        ctx.strokeRect(
            x,
            Math.max(0, y - 22),
            textWidth + 16,
            18
        );

        // Label text
        ctx.fillStyle = hudColor;

        ctx.fillText(
            labelText,
            x + 8,
            Math.max(13, y - 9)
        );
    }
};

// Make Detector available to other JavaScript files
window.Detector = Detector;
