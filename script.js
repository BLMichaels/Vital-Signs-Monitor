// Phillips Vital Signs Monitor - Medical Simulation
// Cross-browser compatibility detection
const BrowserCompatibility = {
    // Detect browser
    browser: (function() {
        const ua = navigator.userAgent;
        if (ua.indexOf('Chrome') > -1) return 'chrome';
        if (ua.indexOf('Firefox') > -1) return 'firefox';
        if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) return 'safari';
        if (ua.indexOf('Edge') > -1) return 'edge';
        if (ua.indexOf('MSIE') > -1 || ua.indexOf('Trident') > -1) return 'ie';
        return 'unknown';
    })(),
    
    // Detect platform
    platform: (function() {
        const ua = navigator.userAgent;
        if (ua.indexOf('Mac') > -1) return 'mac';
        if (ua.indexOf('Win') > -1) return 'windows';
        if (ua.indexOf('Linux') > -1) return 'linux';
        return 'unknown';
    })(),
    
    // Feature detection
    features: {
        webAudio: !!(window.AudioContext || window.webkitAudioContext),
        canvas: !!document.createElement('canvas').getContext,
        flexbox: (function() {
            const div = document.createElement('div');
            return div.style.flex !== undefined || 
                   div.style.webkitFlex !== undefined || 
                   div.style.mozFlex !== undefined || 
                   div.style.msFlex !== undefined;
        })(),
        transforms: (function() {
            const div = document.createElement('div');
            return div.style.transform !== undefined || 
                   div.style.webkitTransform !== undefined || 
                   div.style.mozTransform !== undefined || 
                   div.style.msTransform !== undefined;
        })(),
        animations: (function() {
            const div = document.createElement('div');
            return div.style.animation !== undefined || 
                   div.style.webkitAnimation !== undefined || 
                   div.style.mozAnimation !== undefined || 
                   div.style.msAnimation !== undefined;
        })()
    },
    
    // Log compatibility info
    logCompatibility: function() {
        console.log('Browser:', this.browser);
        console.log('Platform:', this.platform);
        console.log('Features:', this.features);
        
        if (!this.features.webAudio) {
            console.warn('Web Audio API not supported - audio features disabled');
        }
        if (!this.features.canvas) {
            console.error('Canvas not supported - waveforms will not display');
        }
    }
};

class VitalSignsMonitor {
    constructor() {
        // Log browser compatibility
        BrowserCompatibility.logCompatibility();
        
        // Store compatibility info
        this.browser = BrowserCompatibility.browser;
        this.platform = BrowserCompatibility.platform;
        this.features = BrowserCompatibility.features;
        
        this.vitals = {
            heartRate: 72,
            spo2: 98,
            respiratoryRate: 16,
            systolicBP: 120,
            diastolicBP: 80,
            temperature: 36.5
        };

        this.alarmLimits = {
            heartRate: { low: 60, high: 100 },
            spo2: { low: 95, high: 100 },
            respiratoryRate: { low: 12, high: 20 },
            systolicBP: { low: 90, high: 140 },
            diastolicBP: { low: 60, high: 90 },
            temperature: { low: 36.0, high: 37.5 }
        };

        this.bigNumbersMode = false;
        this.alarmEnabled = true;
        this.audioEnabled = true;
        this.volume = 0.5;
        this.alarmActive = false;
        this.alarmSilenced = false;
        this.isFrozen = false;
        this.currentLead = 'II';
        this.waveformSpeed = 50; // mm/s
        this.alarmPriority = 'critical';
        this.artifacts = {
            motion: false,
            poorContact: false,
            muscleTremor: false,
            baselineDrift: false
        };
        this.startupComplete = false;
        this.stElevation = 0.0;
        this.currentRhythm = 'NSR';
        this.qtInterval = 400;
        this.nibpMeasuring = false;
        this.nibpInterval = 5;
        this.nibpTimer = null;

        this.ecgCanvas = document.getElementById('ecg-canvas');
        this.plethCanvas = document.getElementById('pleth-canvas');
        this.ecgCtx = this.ecgCanvas.getContext('2d');
        this.plethCtx = this.plethCanvas.getContext('2d');

        // Set up high-DPI canvas rendering
        this.setupHighDPICanvas(this.ecgCanvas, this.ecgCtx);
        this.setupHighDPICanvas(this.plethCanvas, this.plethCtx);

        this.ecgData = [];
        this.plethData = [];
        this.maxDataPoints = 400;

        this.audioContext = null;
        this.heartbeatSound = null;
        this.alarmSound = null;
        this.lastHeartbeatTime = 0;

        this.init();
    }

    setupHighDPICanvas(canvas, ctx) {
        // Check if canvas is supported
        if (!this.features.canvas) {
            console.error('Canvas not supported - waveforms will not display');
            return;
        }
        
        try {
            // Get device pixel ratio with fallback
            const dpr = window.devicePixelRatio || 
                       window.webkitDevicePixelRatio || 
                       window.mozDevicePixelRatio || 
                       window.msDevicePixelRatio || 1;
            
            const rect = canvas.getBoundingClientRect();
            
            // Set the actual size in memory (scaled to account for extra pixel density)
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            
            // Scale the drawing context so everything will work at the higher ratio
            ctx.scale(dpr, dpr);
            
            // Set the display size (CSS pixels)
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            
            // Enable smooth rendering for better quality
            ctx.imageSmoothingEnabled = true;
            if (ctx.imageSmoothingQuality) {
                ctx.imageSmoothingQuality = 'high';
            }
            
            console.log(`Canvas setup complete - DPR: ${dpr}, Size: ${rect.width}x${rect.height}`);
            
        } catch (error) {
            console.error('Canvas setup failed:', error);
        }
    }

    init() {
        console.log('Initializing Vital Signs Monitor...');
        this.setupEventListeners();
        this.setupAudio();
        this.startWaveformAnimation();
        this.startHeartbeatAudio();
        this.updateDisplay();
        this.updateSTDisplay();
        this.updateRhythmDisplay();
        this.updateQTDisplay();
        console.log('Monitor initialized successfully');
    }

    setupEventListeners() {
        // Big Numbers Mode Toggle
        document.getElementById('big-numbers-btn').addEventListener('click', () => {
            this.toggleBigNumbersMode();
        });

        // Vital Signs Controls
        document.getElementById('hr-control').addEventListener('input', (e) => {
            this.updateVital('heartRate', parseInt(e.target.value));
        });

        document.getElementById('spo2-control').addEventListener('input', (e) => {
            this.updateVital('spo2', parseInt(e.target.value));
        });

        document.getElementById('rr-control').addEventListener('input', (e) => {
            this.updateVital('respiratoryRate', parseInt(e.target.value));
        });

        document.getElementById('systolic-control').addEventListener('input', (e) => {
            this.updateVital('systolicBP', parseInt(e.target.value));
        });

        document.getElementById('diastolic-control').addEventListener('input', (e) => {
            this.updateVital('diastolicBP', parseInt(e.target.value));
        });

        document.getElementById('temp-control').addEventListener('input', (e) => {
            this.updateVital('temperature', parseFloat(e.target.value));
        });

        // Alarm Controls
        document.getElementById('alarm-enabled').addEventListener('change', (e) => {
            this.alarmEnabled = e.target.checked;
            if (!this.alarmEnabled) {
                this.clearAlarms();
            }
        });

        document.getElementById('test-alarm-btn').addEventListener('click', () => {
            this.testAlarm();
        });

        document.getElementById('silence-alarm-btn').addEventListener('click', () => {
            this.silenceAlarm();
        });

        // Audio Controls
        document.getElementById('audio-enabled').addEventListener('change', (e) => {
            this.audioEnabled = e.target.checked;
        });

        document.getElementById('volume-control').addEventListener('input', (e) => {
            this.volume = parseInt(e.target.value) / 100;
        });

        // ECG Lead Selection
        document.getElementById('ecg-lead-select').addEventListener('change', (e) => {
            this.currentLead = e.target.value;
            this.updateECGLead();
        });

        // Waveform Speed Control
        document.getElementById('speed-select').addEventListener('change', (e) => {
            this.waveformSpeed = parseInt(e.target.value);
        });

        // Freeze/Unfreeze
        document.getElementById('freeze-btn').addEventListener('click', () => {
            this.toggleFreeze();
        });

        // Alarm Priority
        document.getElementById('alarm-priority').addEventListener('change', (e) => {
            this.alarmPriority = e.target.value;
        });

        // Reset Alarms
        document.getElementById('reset-alarms-btn').addEventListener('click', () => {
            this.resetAlarms();
        });

        // Artifact Controls
        document.getElementById('motion-artifact').addEventListener('change', (e) => {
            this.artifacts.motion = e.target.checked;
        });

        document.getElementById('poor-contact').addEventListener('change', (e) => {
            this.artifacts.poorContact = e.target.checked;
        });

        document.getElementById('muscle-tremor').addEventListener('change', (e) => {
            this.artifacts.muscleTremor = e.target.checked;
        });

        document.getElementById('baseline-drift').addEventListener('change', (e) => {
            this.artifacts.baselineDrift = e.target.checked;
        });

        // ECG Analysis Controls
        document.getElementById('st-elevation').addEventListener('input', (e) => {
            this.stElevation = parseFloat(e.target.value);
            this.updateSTDisplay();
        });

        document.getElementById('rhythm-select').addEventListener('change', (e) => {
            this.currentRhythm = e.target.value;
            this.updateRhythmDisplay();
        });

        document.getElementById('qt-interval').addEventListener('input', (e) => {
            this.qtInterval = parseInt(e.target.value);
            this.updateQTDisplay();
        });

        // NIBP Controls
        document.getElementById('start-nibp-btn').addEventListener('click', () => {
            this.startNIBPMeasurement();
        });

        document.getElementById('stop-nibp-btn').addEventListener('click', () => {
            this.stopNIBPMeasurement();
        });

        document.getElementById('nibp-interval').addEventListener('change', (e) => {
            this.nibpInterval = parseInt(e.target.value);
        });
    }

    setupAudio() {
        // Check if Web Audio API is supported
        if (!this.features.webAudio) {
            console.warn('Web Audio API not supported - audio features disabled');
            this.audioEnabled = false;
            return;
        }
        
        try {
            // Handle browser audio context restrictions with fallbacks
            const AudioContextClass = window.AudioContext || 
                                    window.webkitAudioContext || 
                                    window.mozAudioContext || 
                                    window.msAudioContext;
            
            if (!AudioContextClass) {
                throw new Error('No AudioContext support found');
            }
            
            this.audioContext = new AudioContextClass();
            
            // Handle different browser audio context states
            if (this.audioContext.state === 'suspended') {
                // Resume audio context if suspended (required by some browsers)
                this.audioContext.resume().catch(err => {
                    console.warn('Failed to resume audio context:', err);
                });
            }
            
            // Test audio creation
            this.createHeartbeatSound();
            this.createAlarmSound();
            
            // Add user interaction handler to enable audio (cross-browser)
            const enableAudio = () => {
                if (this.audioContext && this.audioContext.state === 'suspended') {
                    this.audioContext.resume().catch(err => {
                        console.warn('Failed to resume audio context on user interaction:', err);
                    });
                }
                // Remove listeners after first interaction
                document.removeEventListener('click', enableAudio);
                document.removeEventListener('touchstart', enableAudio);
                document.removeEventListener('keydown', enableAudio);
            };
            
            // Add multiple event listeners for better compatibility
            document.addEventListener('click', enableAudio);
            document.addEventListener('touchstart', enableAudio);
            document.addEventListener('keydown', enableAudio);
            
            console.log('Audio system initialized successfully');
            
        } catch (error) {
            console.warn('Audio initialization failed:', error);
            this.audioEnabled = false;
            this.audioContext = null;
        }
    }

    startStartupSequence() {
        const startupScreen = document.getElementById('startup-screen');
        const progressFill = document.getElementById('progress-fill');
        const startupStatus = document.getElementById('startup-status');
        
        const steps = [
            { text: 'Initializing System...', progress: 20 },
            { text: 'Loading ECG Module...', progress: 40 },
            { text: 'Calibrating Sensors...', progress: 60 },
            { text: 'Testing Audio System...', progress: 80 },
            { text: 'Ready for Operation', progress: 100 }
        ];
        
        let currentStep = 0;
        
        const updateStep = () => {
            if (currentStep < steps.length) {
                const step = steps[currentStep];
                startupStatus.textContent = step.text;
                progressFill.style.width = step.progress + '%';
                currentStep++;
                setTimeout(updateStep, 800);
            } else {
                setTimeout(() => {
                    startupScreen.classList.add('hidden');
                    this.startupComplete = true;
                    this.startWaveformAnimation();
                    this.startHeartbeatAudio();
                    this.updateDisplay();
                    this.updateSystemTime();
                    console.log('Monitor initialized successfully');
                }, 500);
            }
        };
        
        updateStep();
    }

    updateSystemTime() {
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            document.getElementById('system-time').textContent = timeString;
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    updateECGLead() {
        // Different ECG leads have different characteristics
        console.log(`Switched to ECG Lead ${this.currentLead}`);
    }

    toggleFreeze() {
        this.isFrozen = !this.isFrozen;
        const freezeBtn = document.getElementById('freeze-btn');
        
        if (this.isFrozen) {
            freezeBtn.textContent = 'Unfreeze';
            freezeBtn.classList.add('active');
        } else {
            freezeBtn.textContent = 'Freeze';
            freezeBtn.classList.remove('active');
        }
    }

    resetAlarms() {
        this.clearAlarms();
        this.alarmSilenced = false;
        console.log('All alarms reset');
    }

    addArtifacts(amplitude, time) {
        let artifactAmplitude = amplitude;
        
        if (this.artifacts.motion) {
            artifactAmplitude += Math.sin(time * 2) * 0.3;
        }
        
        if (this.artifacts.poorContact) {
            artifactAmplitude += (Math.random() - 0.5) * 0.4;
        }
        
        if (this.artifacts.muscleTremor) {
            artifactAmplitude += Math.sin(time * 8) * 0.2;
        }
        
        if (this.artifacts.baselineDrift) {
            artifactAmplitude += Math.sin(time * 0.1) * 0.5;
        }
        
        return artifactAmplitude;
    }

    updateSTDisplay() {
        const stValue = document.getElementById('st-value');
        const stOverlay = document.getElementById('st-overlay');
        
        stValue.textContent = (this.stElevation >= 0 ? '+' : '') + this.stElevation.toFixed(1);
        
        // ST elevation > 1mm or depression > 0.5mm is abnormal
        if (this.stElevation > 0.1 || this.stElevation < -0.05) {
            stOverlay.classList.add('alarm');
        } else {
            stOverlay.classList.remove('alarm');
        }
        
        document.getElementById('st-elevation-display').textContent = this.stElevation.toFixed(1);
    }

    updateRhythmDisplay() {
        const rhythmValue = document.getElementById('rhythm-value');
        const arrhythmiaOverlay = document.getElementById('arrhythmia-overlay');
        
        rhythmValue.textContent = this.currentRhythm;
        
        // Abnormal rhythms trigger alarms
        const abnormalRhythms = ['AF', 'AFL', 'VT', 'VF', 'PVC', 'PAC'];
        if (abnormalRhythms.includes(this.currentRhythm)) {
            arrhythmiaOverlay.classList.add('alarm');
        } else {
            arrhythmiaOverlay.classList.remove('alarm');
        }
    }

    updateQTDisplay() {
        document.getElementById('qt-interval-display').textContent = this.qtInterval;
        
        // QT prolongation > 500ms is dangerous
        if (this.qtInterval > 500) {
            console.log('QT Prolongation Alert!');
        }
    }

    startNIBPMeasurement() {
        if (this.nibpMeasuring) return;
        
        this.nibpMeasuring = true;
        const status = document.getElementById('nibp-status');
        const startBtn = document.getElementById('start-nibp-btn');
        const stopBtn = document.getElementById('stop-nibp-btn');
        
        status.textContent = 'Measuring...';
        status.classList.add('measuring');
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Simulate NIBP measurement cycle
        setTimeout(() => {
            status.textContent = 'Deflating...';
            setTimeout(() => {
                status.textContent = 'Complete';
                status.classList.remove('measuring');
                status.classList.add('success');
                startBtn.disabled = false;
                stopBtn.disabled = true;
                
                // Schedule next measurement
                if (this.nibpInterval > 0) {
                    this.nibpTimer = setTimeout(() => {
                        this.startNIBPMeasurement();
                    }, this.nibpInterval * 60000);
                }
            }, 2000);
        }, 3000);
    }

    stopNIBPMeasurement() {
        this.nibpMeasuring = false;
        const status = document.getElementById('nibp-status');
        const startBtn = document.getElementById('start-nibp-btn');
        const stopBtn = document.getElementById('stop-nibp-btn');
        
        status.textContent = 'Stopped';
        status.classList.remove('measuring', 'success');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        if (this.nibpTimer) {
            clearTimeout(this.nibpTimer);
            this.nibpTimer = null;
        }
    }

    generateArrhythmiaECG(beatPhase, time) {
        let amplitude = 0;
        
        switch (this.currentRhythm) {
            case 'NSR':
                // Normal sinus rhythm
                if (beatPhase < 0.1) {
                    amplitude = Math.sin(beatPhase * Math.PI * 10) * 0.2;
                } else if (beatPhase < 0.15) {
                    amplitude = Math.sin((beatPhase - 0.1) * Math.PI * 20) * 1.0;
                } else if (beatPhase < 0.3) {
                    amplitude = Math.sin((beatPhase - 0.15) * Math.PI * 6.67) * 0.3;
                }
                break;
                
            case 'AF':
                // Atrial fibrillation - irregular rhythm
                const irregularity = (Math.random() - 0.5) * 0.3;
                if (beatPhase < 0.1) {
                    amplitude = Math.sin(beatPhase * Math.PI * 10) * (0.1 + irregularity);
                } else if (beatPhase < 0.15) {
                    amplitude = Math.sin((beatPhase - 0.1) * Math.PI * 20) * 1.0;
                } else if (beatPhase < 0.3) {
                    amplitude = Math.sin((beatPhase - 0.15) * Math.PI * 6.67) * 0.3;
                }
                break;
                
            case 'VT':
                // Ventricular tachycardia - wide QRS
                if (beatPhase < 0.1) {
                    amplitude = Math.sin(beatPhase * Math.PI * 10) * 0.1;
                } else if (beatPhase < 0.2) {
                    amplitude = Math.sin((beatPhase - 0.1) * Math.PI * 10) * 1.2;
                } else if (beatPhase < 0.4) {
                    amplitude = Math.sin((beatPhase - 0.2) * Math.PI * 5) * 0.4;
                }
                break;
                
            case 'VF':
                // Ventricular fibrillation - chaotic
                amplitude = (Math.random() - 0.5) * 2.0;
                break;
                
            case 'PVC':
                // Premature ventricular contractions
                const pvcChance = Math.random();
                if (pvcChance < 0.1) { // 10% chance of PVC
                    if (beatPhase < 0.15) {
                        amplitude = Math.sin(beatPhase * Math.PI * 13.3) * 1.5;
                    } else if (beatPhase < 0.3) {
                        amplitude = Math.sin((beatPhase - 0.15) * Math.PI * 6.67) * 0.5;
                    }
                } else {
                    // Normal beat
                    if (beatPhase < 0.1) {
                        amplitude = Math.sin(beatPhase * Math.PI * 10) * 0.2;
                    } else if (beatPhase < 0.15) {
                        amplitude = Math.sin((beatPhase - 0.1) * Math.PI * 20) * 1.0;
                    } else if (beatPhase < 0.3) {
                        amplitude = Math.sin((beatPhase - 0.15) * Math.PI * 6.67) * 0.3;
                    }
                }
                break;
                
            default:
                // Default to normal rhythm
                if (beatPhase < 0.1) {
                    amplitude = Math.sin(beatPhase * Math.PI * 10) * 0.2;
                } else if (beatPhase < 0.15) {
                    amplitude = Math.sin((beatPhase - 0.1) * Math.PI * 20) * 1.0;
                } else if (beatPhase < 0.3) {
                    amplitude = Math.sin((beatPhase - 0.15) * Math.PI * 6.67) * 0.3;
                }
        }
        
        return amplitude;
    }

    createHeartbeatSound() {
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;
        const duration = 0.15;
        
        // Create a realistic medical monitor beep with proper envelope
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Medical monitor beep characteristics
        oscillator.frequency.setValueAtTime(1000, now);
        oscillator.type = 'sine';
        
        // Add a subtle filter sweep for realism
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(1500, now + duration);
        filter.Q.setValueAtTime(1, now);
        
        // Realistic envelope - quick attack, natural decay
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3 * this.volume, now + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.1 * this.volume, now + 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        oscillator.start(now);
        oscillator.stop(now + duration);
        
        // Add a subtle click at the beginning for realism
        const clickOsc = this.audioContext.createOscillator();
        const clickGain = this.audioContext.createGain();
        clickOsc.connect(clickGain);
        clickGain.connect(this.audioContext.destination);
        
        clickOsc.frequency.setValueAtTime(2000, now);
        clickOsc.type = 'square';
        
        clickGain.gain.setValueAtTime(0, now);
        clickGain.gain.linearRampToValueAtTime(0.1 * this.volume, now + 0.001);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
        
        clickOsc.start(now);
        clickOsc.stop(now + 0.01);
    }

    createAlarmSound() {
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;
        const duration = 0.4;
        
        // Create a realistic medical alarm with proper characteristics
        const oscillator1 = this.audioContext.createOscillator();
        const oscillator2 = this.audioContext.createOscillator();
        const gainNode1 = this.audioContext.createGain();
        const gainNode2 = this.audioContext.createGain();
        const filter1 = this.audioContext.createBiquadFilter();
        const filter2 = this.audioContext.createBiquadFilter();
        const compressor = this.audioContext.createDynamicsCompressor();
        
        // Connect oscillators through filters and gain nodes
        oscillator1.connect(filter1);
        oscillator2.connect(filter2);
        filter1.connect(gainNode1);
        filter2.connect(gainNode2);
        gainNode1.connect(compressor);
        gainNode2.connect(compressor);
        compressor.connect(this.audioContext.destination);
        
        // Primary alarm tone - higher frequency
        oscillator1.frequency.setValueAtTime(1200, now);
        oscillator1.type = 'sine';
        
        // Secondary tone - lower frequency for complexity
        oscillator2.frequency.setValueAtTime(800, now);
        oscillator2.type = 'triangle';
        
        // Apply filters for realistic medical equipment sound
        filter1.type = 'bandpass';
        filter1.frequency.setValueAtTime(1200, now);
        filter1.Q.setValueAtTime(2, now);
        
        filter2.type = 'bandpass';
        filter2.frequency.setValueAtTime(800, now);
        filter2.Q.setValueAtTime(1.5, now);
        
        // Compressor settings for medical equipment character
        compressor.threshold.setValueAtTime(-20, now);
        compressor.knee.setValueAtTime(30, now);
        compressor.ratio.setValueAtTime(12, now);
        compressor.attack.setValueAtTime(0.003, now);
        compressor.release.setValueAtTime(0.1, now);
        
        // Realistic envelope with slight tremolo effect
        gainNode1.gain.setValueAtTime(0, now);
        gainNode1.gain.linearRampToValueAtTime(0.4 * this.volume, now + 0.01);
        
        gainNode2.gain.setValueAtTime(0, now);
        gainNode2.gain.linearRampToValueAtTime(0.3 * this.volume, now + 0.01);
        
        // Add tremolo effect for realism
        const tremolo1 = this.audioContext.createOscillator();
        const tremoloGain1 = this.audioContext.createGain();
        tremolo1.connect(tremoloGain1);
        tremoloGain1.connect(gainNode1.gain);
        
        tremolo1.frequency.setValueAtTime(6, now);
        tremolo1.type = 'sine';
        tremoloGain1.gain.setValueAtTime(0.1, now);
        
        tremolo1.start(now);
        tremolo1.stop(now + duration);
        
        // Decay envelope
        gainNode1.gain.exponentialRampToValueAtTime(0.2 * this.volume, now + duration * 0.7);
        gainNode1.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        gainNode2.gain.exponentialRampToValueAtTime(0.15 * this.volume, now + duration * 0.7);
        gainNode2.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        oscillator1.start(now);
        oscillator1.stop(now + duration);
        oscillator2.start(now);
        oscillator2.stop(now + duration);
    }

    startHeartbeatAudio() {
        if (!this.audioEnabled || !this.audioContext) return;

        const baseInterval = 60000 / this.vitals.heartRate; // Convert BPM to milliseconds
        
        // Add realistic heart rhythm variation
        let variation;
        if (this.vitals.heartRate < 60) {
            // Bradycardia - more irregular
            variation = (Math.random() - 0.5) * 0.15; // ±7.5% variation
        } else if (this.vitals.heartRate > 100) {
            // Tachycardia - more regular but still some variation
            variation = (Math.random() - 0.5) * 0.05; // ±2.5% variation
        } else {
            // Normal rhythm - moderate variation
            variation = (Math.random() - 0.5) * 0.08; // ±4% variation
        }
        
        const interval = baseInterval * (1 + variation);
        const now = Date.now();

        if (now - this.lastHeartbeatTime >= interval) {
            this.createHeartbeatSound();
            this.lastHeartbeatTime = now;
        }

        // Use shorter timeout for more responsive updates
        setTimeout(() => this.startHeartbeatAudio(), 25);
    }

    updateVital(vitalName, value) {
        this.vitals[vitalName] = value;
        this.updateDisplay();
        this.checkAlarms();
        this.updateControlDisplays();
    }

    updateDisplay() {
        // Update vital signs display
        document.getElementById('heart-rate-value').textContent = this.vitals.heartRate;
        document.getElementById('spo2-value').textContent = this.vitals.spo2;
        document.getElementById('resp-rate-value').textContent = this.vitals.respiratoryRate;
        document.getElementById('bp-value').textContent = `${this.vitals.systolicBP}/${this.vitals.diastolicBP}`;
        document.getElementById('temp-value').textContent = this.vitals.temperature.toFixed(1);

        // Debug: Log to console to ensure values are updating
        console.log('Vital signs updated:', this.vitals);

        // Update Big Numbers mode
        const vitalValues = document.querySelectorAll('.vital-value');
        vitalValues.forEach(value => {
            if (this.bigNumbersMode) {
                value.classList.add('big-numbers');
            } else {
                value.classList.remove('big-numbers');
            }
        });

        // Vital signs are now displayed as overlays on waveforms
    }

    updateControlDisplays() {
        document.getElementById('hr-display').textContent = this.vitals.heartRate;
        document.getElementById('spo2-display').textContent = this.vitals.spo2;
        document.getElementById('rr-display').textContent = this.vitals.respiratoryRate;
        document.getElementById('systolic-display').textContent = this.vitals.systolicBP;
        document.getElementById('diastolic-display').textContent = this.vitals.diastolicBP;
        document.getElementById('temp-display').textContent = this.vitals.temperature.toFixed(1);
        document.getElementById('volume-display').textContent = Math.round(this.volume * 100);
    }

    toggleBigNumbersMode() {
        this.bigNumbersMode = !this.bigNumbersMode;
        const btn = document.getElementById('big-numbers-btn');
        const modeText = document.getElementById('mode-text');

        if (this.bigNumbersMode) {
            btn.classList.add('active');
            btn.textContent = 'Normal';
            modeText.textContent = 'Big Numbers';
        } else {
            btn.classList.remove('active');
            btn.textContent = 'Big Numbers';
            modeText.textContent = 'Normal';
        }

        this.updateDisplay();
    }

    checkAlarms() {
        if (!this.alarmEnabled || this.alarmSilenced) return;

        const alarms = [];
        const vitalOverlays = {
            heartRate: document.getElementById('hr-overlay'),
            spo2: document.getElementById('spo2-overlay'),
            respiratoryRate: document.getElementById('rr-overlay'),
            systolicBP: document.getElementById('bp-overlay'),
            diastolicBP: document.getElementById('bp-overlay'),
            temperature: document.getElementById('temp-overlay')
        };

        // Check each vital sign
        Object.keys(this.vitals).forEach((vital) => {
            const value = this.vitals[vital];
            const limits = this.alarmLimits[vital];
            const overlay = vitalOverlays[vital];

            if (value < limits.low || value > limits.high) {
                alarms.push(`${vital}: ${value} (Normal: ${limits.low}-${limits.high})`);
                if (overlay) overlay.classList.add('alarm');
            } else {
                if (overlay) overlay.classList.remove('alarm');
            }
        });

        if (alarms.length > 0) {
            this.triggerAlarm(alarms);
        } else {
            this.clearAlarms();
        }
    }

    triggerAlarm(alarms) {
        this.alarmActive = true;
        const alarmStatus = document.getElementById('alarm-status');
        const alarmMessage = document.getElementById('alarm-message');

        alarmStatus.classList.add('active');
        alarmMessage.textContent = alarms.join(', ');

        // Play alarm sound
        if (this.audioEnabled && this.audioContext) {
            this.createAlarmSound();
        }
    }

    clearAlarms() {
        this.alarmActive = false;
        const alarmStatus = document.getElementById('alarm-status');
        const vitalOverlays = document.querySelectorAll('.vital-overlay');

        alarmStatus.classList.remove('active');
        vitalOverlays.forEach(overlay => overlay.classList.remove('alarm'));
    }

    testAlarm() {
        this.triggerAlarm(['Test Alarm - All systems functioning']);
    }

    silenceAlarm() {
        this.alarmSilenced = true;
        this.clearAlarms();
        
        // Auto-unsilence after 2 minutes
        setTimeout(() => {
            this.alarmSilenced = false;
        }, 120000);
    }

    startWaveformAnimation() {
        this.animateECG();
        this.animatePleth();
    }

    animateECG() {
        const canvas = this.ecgCanvas;
        const ctx = this.ecgCtx;
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas with smooth background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // Enable smooth rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw grid with smoother lines
        this.drawSmoothGrid(ctx, width, height, 20, '#222');

        // Generate ECG waveform based on heart rate
        const heartRate = this.vitals.heartRate;
        const timePerBeat = 60000 / heartRate; // ms per beat
        const samplesPerBeat = Math.floor(timePerBeat / 16.67); // ~60fps
        
        // Generate ECG data
        const time = Date.now() / 1000;
        const data = [];
        
        for (let x = 0; x < width; x++) {
            const t = time + (x / width) * 2; // 2 seconds of data
            const beatPhase = (t * heartRate / 60) % 1;
            
            // Generate ECG based on current rhythm
            let amplitude = this.generateArrhythmiaECG(beatPhase, t);
            
            // Add ST segment elevation/depression
            if (beatPhase >= 0.15 && beatPhase < 0.25) {
                amplitude += this.stElevation * 0.3;
            }
            
            // Add some noise
            amplitude += (Math.random() - 0.5) * 0.05;
            
            // Add artifacts if enabled
            amplitude = this.addArtifacts(amplitude, t);
            
            data.push(amplitude);
        }

        // Draw ECG waveform with smooth lines
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 1;
        
        ctx.beginPath();
        
        for (let i = 0; i < data.length; i++) {
            const x = i;
            const y = height / 2 - data[i] * height * 0.3;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow

        if (!this.isFrozen) {
            requestAnimationFrame(() => this.animateECG());
        } else {
            // If frozen, still update but don't advance time
            setTimeout(() => this.animateECG(), 100);
        }
    }

    animatePleth() {
        const canvas = this.plethCanvas;
        const ctx = this.plethCtx;
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas with smooth background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // Enable smooth rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw grid with smoother lines
        this.drawSmoothGrid(ctx, width, height, 15, '#222');

        // Generate plethysmograph waveform
        const spo2 = this.vitals.spo2;
        const heartRate = this.vitals.heartRate;
        const time = Date.now() / 1000;
        
        // Draw pleth waveform with smooth lines
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 1;
        ctx.beginPath();
        
        for (let x = 0; x < width; x++) {
            const t = time + (x / width) * 2; // 2 seconds of data
            const beatPhase = (t * heartRate / 60) % 1;
            
            // Pleth waveform - peaks during systole
            let amplitude = 0.3 + 0.7 * Math.sin(beatPhase * Math.PI * 2);
            
            // Add some variation based on SpO2
            amplitude *= (spo2 / 100);
            
            // Add noise
            amplitude += (Math.random() - 0.5) * 0.1;
            
            const y = height - amplitude * height;
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow

        if (!this.isFrozen) {
            requestAnimationFrame(() => this.animatePleth());
        } else {
            // If frozen, still update but don't advance time
            setTimeout(() => this.animatePleth(), 100);
        }
    }

    drawSmoothGrid(ctx, width, height, gridSize, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.5;
        ctx.lineCap = 'round';
        
        // Vertical lines
        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(width, y + 0.5);
            ctx.stroke();
        }
    }

    drawGrid(ctx, width, height, gridSize, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }
}

// Initialize the monitor when the page loads - Edge compatible
if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => {
        new VitalSignsMonitor();
    });
} else if (document.attachEvent) {
    // IE8 and earlier
    document.attachEvent('onreadystatechange', () => {
        if (document.readyState === 'complete') {
            new VitalSignsMonitor();
        }
    });
} else {
    // Fallback
    window.onload = () => {
        new VitalSignsMonitor();
    };
}