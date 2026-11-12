
/* ==========================================================================
   MindFlow Application Main Controller (app.js)
   Coordinates UI tabs, webcam media feeds, logging, and statistics
   ========================================================================== */

const App = {
    webcamStream: null,
    isWebcamRunning: false,

    sessionStartTime: 0,
    sessionInterval: null,

    successScore: 0,
    totalFocusSum: 0,
    totalStressSum: 0,
    tickCount: 0,

    /**
     * Initialize application
     */
    init() {
        console.log("MindFlow: Bootstrapping application components...");

        // Initialize charts
        if (window.Charts) {
            window.Charts.init();
        }

        // Initialize reflection workspace
        const reflectionTextarea =
            document.getElementById('reflection-textarea');

        if (window.Sentiment && reflectionTextarea) {
            window.Sentiment.init(reflectionTextarea);
        }

        // Initialize learning modules
        if (window.Learning) {
            window.Learning.init();
        }

        // Load AI models
        if (window.Detector) {
            window.Detector.init().then(success => {
                if (success) {
                    console.log(
                        "MindFlow: System ready. Waiting for webcam activation."
                    );
                } else {
                    console.error(
                        "MindFlow: AI models failed to load."
                    );
                }
            }).catch(error => {
                console.error("MindFlow initialization error:", error);
            });
        } else {
            console.error("MindFlow: Detector module not found.");
        }

        this.sessionStartTime = Date.now();
        this.startSessionTimer();
    },

    /**
     * Session timer
     */
    startSessionTimer() {
        const timeBadge =
            document.getElementById('dash-session-time');

        if (this.sessionInterval) {
            clearInterval(this.sessionInterval);
        }

        this.sessionInterval = setInterval(() => {
            const elapsed = Date.now() - this.sessionStartTime;

            const minutes = Math.floor(elapsed / 60000)
                .toString().padStart(2, '0');

            const seconds = Math.floor((elapsed % 60000) / 1000)
                .toString().padStart(2, '0');

            if (timeBadge) {
                timeBadge.textContent = `${minutes}:${seconds}`;
            }
        }, 1000);
    },

    /**
     * Wait until webcam video is ready for detection
     */
    waitForVideoReady(video) {
        return new Promise((resolve, reject) => {

            if (
                video.readyState >= 2 &&
                video.videoWidth > 0 &&
                video.videoHeight > 0
            ) {
                resolve();
                return;
            }

            const cleanup = () => {
                video.removeEventListener('loadeddata', checkReady);
                video.removeEventListener('error', handleError);
                clearTimeout(timeout);
            };

            const checkReady = () => {
                if (
                    video.readyState >= 2 &&
                    video.videoWidth > 0 &&
                    video.videoHeight > 0
                ) {
                    cleanup();
                    resolve();
                }
            };

            const handleError = () => {
                cleanup();
                reject(new Error("Webcam video could not start."));
            };

            const timeout = setTimeout(() => {
                cleanup();
                reject(
                    new Error("Webcam video is taking too long to load.")
                );
            }, 10000);

            video.addEventListener('loadeddata', checkReady);
            video.addEventListener('error', handleError);

            // Check once more in case video became ready
            // while event listeners were being attached
            checkReady();
        });
    },

    /**
     * Receive emotion detection data
     */
    onTelemetryTick(data) {

        this.tickCount++;

        this.totalFocusSum += data.focus;
        this.totalStressSum += data.stress;

        const barFocus = document.getElementById('bar-focus');
        const valFocus = document.getElementById('val-focus');

        const barStress = document.getElementById('bar-stress');
        const valStress = document.getElementById('val-stress');

        const barBored = document.getElementById('bar-bored');
        const valBored = document.getElementById('val-bored');

        if (barFocus) barFocus.style.width = `${data.focus}%`;
        if (valFocus) valFocus.textContent = `${data.focus}%`;

        if (barStress) barStress.style.width = `${data.stress}%`;
        if (valStress) valStress.textContent = `${data.stress}%`;

        if (barBored) barBored.style.width = `${data.boredom}%`;
        if (valBored) valBored.textContent = `${data.boredom}%`;

        // Update learning engine
        if (window.Learning) {
            window.Learning.processTelemetry(data);
        }

        // Update charts
        if (window.Charts) {
            window.Charts.pushTrend(data.focus, data.stress);
            window.Charts.accumulateEmotions(data.emotions);
            window.Charts.accumulateDurations(
                data.focus,
                data.stress,
                data.boredom
            );
        }

        this.updateDashboardUi();
    },

    /**
     * Update dashboard values
     */
    updateDashboardUi() {

        const avgFocusBadge =
            document.getElementById('dash-focus-index');

        const avgStressBadge =
            document.getElementById('dash-stress-index');

        const successBadge =
            document.getElementById('dash-success-score');

        if (avgFocusBadge && this.tickCount > 0) {
            avgFocusBadge.textContent =
                `${Math.round(this.totalFocusSum / this.tickCount)}%`;
        }

        if (avgStressBadge && this.tickCount > 0) {
            avgStressBadge.textContent =
                `${Math.round(this.totalStressSum / this.tickCount)}%`;
        }

        if (successBadge) {
            successBadge.textContent = this.successScore;
        }
    },

    /**
     * Start or stop webcam
     */
    async toggleWebcam() {

        const video = document.getElementById('webcam');
        const canvas = document.getElementById('overlay');

        const placeholder =
            document.getElementById('webcam-placeholder');

        const btn = document.getElementById('btn-webcam');

        const statusDot =
            document.querySelector('#camera-status .pulse-dot');

        const statusLabel =
            document.querySelector('#camera-status .status-label');

        // Check required HTML elements
        if (!video || !canvas) {
            console.error("MindFlow: Webcam or canvas element not found.");
            alert("Webcam elements are missing from the page.");
            return;
        }

        // STOP WEBCAM
        if (this.isWebcamRunning) {

            this.isWebcamRunning = false;

            if (window.Detector) {
                window.Detector.stopTracking(canvas);
            }

            if (this.webcamStream) {
                this.webcamStream.getTracks().forEach(track => {
                    track.stop();
                });

                this.webcamStream = null;
            }

            video.pause();
            video.srcObject = null;
            video.style.display = 'none';

            if (placeholder) {
                placeholder.style.display = 'flex';
            }

            if (btn) {
                btn.innerHTML =
                    '<i class="fa-solid fa-camera-rotate"></i> Start Webcam';
            }

            if (statusDot && statusLabel) {
                statusDot.className = "pulse-dot red";
                statusLabel.textContent = "Camera Offline";
            }

            this.logEvent(
                "Camera",
                "Webcam deactivated by user.",
                "Off"
            );

            console.log("MindFlow: Webcam stopped.");

            return;
        }

        // START WEBCAM
        try {

            console.log("MindFlow: Starting webcam...");

            // Check browser camera support
            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia
            ) {
                throw new Error(
                    "Camera API unavailable. Use localhost or HTTPS."
                );
            }

            // Check AI models
            if (!window.Detector || !window.Detector.modelsLoaded) {
                throw new Error(
                    "AI models are not ready. Please refresh and wait for AI Models Active."
                );
            }

            // Request camera permission
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                },
                audio: false
            };

            this.webcamStream =
                await navigator.mediaDevices.getUserMedia(constraints);

            console.log("MindFlow: Camera permission granted.");

            // Connect camera stream to video
            video.srcObject = this.webcamStream;
            video.style.display = 'block';

            // Start video playback
            await video.play();

            console.log("MindFlow: Waiting for webcam video...");

            // Wait until actual video frames are available
            await this.waitForVideoReady(video);

            console.log(
                "MindFlow: Webcam video is ready.",
                video.videoWidth,
                video.videoHeight
            );

            // Hide placeholder after video is ready
            if (placeholder) {
                placeholder.style.display = 'none';
            }

            // Start face tracking
            const trackingStarted = window.Detector.startTracking(
                video,
                canvas,
                (data) => this.onTelemetryTick(data)
            );

            if (!trackingStarted) {
                throw new Error(
                    "Face tracking could not start. Check AI models and video."
                );
            }

            // Update webcam status only after tracking starts
            this.isWebcamRunning = true;

            if (btn) {
                btn.innerHTML =
                    '<i class="fa-solid fa-video-slash"></i> Stop Webcam';
            }

            if (statusDot && statusLabel) {
                statusDot.className = "pulse-dot green";
                statusLabel.textContent = "Camera Active";
            }

            this.logEvent(
                "Camera",
                "Webcam and emotion tracking started.",
                "Active"
            );

            console.log(
                "MindFlow: Webcam and face tracking started successfully."
            );

        } catch (error) {

            console.error("MindFlow webcam error:", error);

            // Stop camera if something fails
            if (window.Detector) {
                window.Detector.stopTracking(canvas);
            }

            if (this.webcamStream) {
                this.webcamStream.getTracks().forEach(track => {
                    track.stop();
                });

                this.webcamStream = null;
            }

            video.pause();
            video.srcObject = null;
            video.style.display = 'none';

            this.isWebcamRunning = false;

            if (placeholder) {
                placeholder.style.display = 'flex';
            }

            if (btn) {
                btn.innerHTML =
                    '<i class="fa-solid fa-camera-rotate"></i> Start Webcam';
            }

            if (statusDot && statusLabel) {
                statusDot.className = "pulse-dot red";
                statusLabel.textContent = "Camera Error";
            }

            this.logEvent(
                "Camera",
                error.message,
                "Blocked"
            );

            alert("MindFlow Webcam Error: " + error.message);
        }
    },

    /**
     * Switch application tabs
     */
    switchTab(tabName) {

        const panes = document.querySelectorAll('.tab-pane');
        const navBtns = document.querySelectorAll('.nav-btn');

        panes.forEach(pane => pane.classList.remove('active'));
        navBtns.forEach(btn => btn.classList.remove('active'));

        if (tabName === 'study') {

            const studyTab = document.getElementById('tab-study');
            const studyBtn = document.getElementById('btn-study');

            if (studyTab) studyTab.classList.add('active');
            if (studyBtn) studyBtn.classList.add('active');

        } else if (tabName === 'dashboard') {

            const dashboardTab =
                document.getElementById('tab-dashboard');

            const dashboardBtn =
                document.getElementById('btn-dashboard');

            if (dashboardTab) dashboardTab.classList.add('active');
            if (dashboardBtn) dashboardBtn.classList.add('active');

            setTimeout(() => {
                if (window.Charts) {
                    if (window.Charts.trendChart) {
                        window.Charts.trendChart.resize();
                    }

                    if (window.Charts.pieChart) {
                        window.Charts.pieChart.resize();
                    }

                    if (window.Charts.barChart) {
                        window.Charts.barChart.resize();
                    }
                }
            }, 100);
        }
    },

    /**
     * Add event to activity log
     */
    logEvent(source, action, outcome) {

        const tbody =
            document.getElementById('empathy-log-body');

        if (!tbody) return;

        const emptyRow = tbody.querySelector('.empty-row');

        if (emptyRow) {
            emptyRow.remove();
        }

        const timestamp = new Date().toLocaleTimeString(
            [],
            {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }
        );

        let sourceBadge =
            `<span class="badge-action">${source}</span>`;

        let outcomeBadge =
            `<span class="badge-outcome">${outcome}</span>`;

        if (
            outcome === 'Stressed' ||
            outcome === 'Bored' ||
            outcome === 'Blocked'
        ) {
            outcomeBadge =
                `<span class="badge-emotion">${outcome}</span>`;

        } else if (
            outcome === 'Off' ||
            outcome === 'Normal'
        ) {
            outcomeBadge =
                `<span class="badge-emotion neutral">${outcome}</span>`;
        }

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${timestamp}</td>
            <td>${sourceBadge}</td>
            <td>${action}</td>
            <td>${outcomeBadge}</td>
        `;

        tbody.insertBefore(tr, tbody.firstChild);
    },

    /**
     * Clear event log
     */
    clearEventLog() {

        const tbody =
            document.getElementById('empathy-log-body');

        if (!tbody) return;

        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="4">
                    No logs collected in this session. Start studying!
                </td>
            </tr>
        `;
    }
};

// Make App available globally
window.App = App;

// Start application after HTML loads
window.addEventListener('DOMContentLoaded', () => {
    App.init();
});
