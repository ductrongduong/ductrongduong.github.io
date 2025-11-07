// Configuration
const DEFAULT_FILES = {
    mp4: 'gump.mp4',
    srt: 'gump.srt'
};

const BUTTON_CONFIG = [
    { id: 'record', label: '🎤', action: 'toggleRecording', disabled: false },
    { id: 'playback', label: '▶️', action: 'playbackRecording', disabled: true },
    { id: 'prev', label: '← Prev', action: 'prevSentence', disabled: false },
    { id: 'next', label: 'Next →', action: 'nextSentence', disabled: false },
    { id: 'repeat', label: 'Repeat', action: 'playCurrentSentence', disabled: false }
];

// DOM Helper
const $ = id => document.getElementById(id);

// SRT Player Class
class SRTPlayer {
    constructor() {
        // Initialize button groups first
        this.buttonGroups = { right: {}, left: {} };
        this.createControlButtons();

        // DOM Elements
        this.elements = {
            curIdx: $('curIdx'),
            curTime: $('curTime'),
            curText: $('curText'),
            srtFile: $('srtFile'),
            loadSrtBtn: $('loadSrtBtn'),
            videoPlayer: $('videoPlayer'),
            videoSource: $('videoSource'),
            mp4File: $('mp4File'),
            loadMp4Btn: $('loadMp4Btn'),
            sentenceList: $('sentenceList'),
            toggleBtn: $('toggleSentenceListBtn'),
            notes: $('notes'),
            lockBtn: $('lockBtn'),
            ...this.buttonGroups.right,
            ...this.buttonGroups.left
        };

        // State
        this.cues = [];
        this.currentIndex = -1;
        this.sentenceListVisible = true;
        this.onTimeUpdate = null;
        this.lastSwipe = 0;
        this.isVideoLocked = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordedAudioURL = null;
        this.recordedAudioBlob = null;
        this.recordingMimeType = null;
        this.isRecording = false;
        this.playbackAudio = null;

        // Initialize
        this.initEventListeners();
        this.renderSentenceList();
        this.elements.toggleBtn.textContent = 'Hide Sentences';
    }

    createControlButtons() {
        const rightContainer = $('rightControls');
        const leftContainer = $('leftControls');

        BUTTON_CONFIG.forEach(config => {
            // Create right button
            const rightBtn = document.createElement('button');
            rightBtn.className = 'btn';
            rightBtn.id = `${config.id}Btn`;
            rightBtn.textContent = config.label;
            rightBtn.disabled = config.disabled;
            rightBtn.dataset.action = config.action;
            rightContainer.appendChild(rightBtn);
            this.buttonGroups.right[`${config.id}Btn`] = rightBtn;

            // Create left button
            const leftBtn = document.createElement('button');
            leftBtn.className = 'btn';
            leftBtn.id = `${config.id}BtnLeft`;
            leftBtn.textContent = config.label;
            leftBtn.disabled = config.disabled;
            leftBtn.dataset.action = config.action;
            leftContainer.appendChild(leftBtn);
            this.buttonGroups.left[`${config.id}BtnLeft`] = leftBtn;
        });
    }

    // Add after the constructor
    saveState() {
        const state = {
            currentIndex: this.currentIndex,
            cues: this.cues,
            notes: this.elements.notes?.value || '',
            sentenceListVisible: this.sentenceListVisible,
            isVideoLocked: this.isVideoLocked,
        };
        localStorage.setItem('srtPlayerState', JSON.stringify(state));
    }

    loadState() {
        try {
            const saved = localStorage.getItem('srtPlayerState');
            if (!saved) return false;

            const state = JSON.parse(saved);
            this.cues = state.cues || [];
            this.currentIndex = state.currentIndex ?? -1;
            this.sentenceListVisible = state.sentenceListVisible ?? true;

            if (this.elements.notes && state.notes) {
                this.elements.notes.value = state.notes;
            }

            this.isVideoLocked = state.isVideoLocked ?? false;
            if (this.isVideoLocked) {
                this.toggleVideoLock();
            }

            return true;
        } catch (error) {
            console.error('Failed to load state:', error);
            return false;
        }
    }

    // Time Utility Methods
    timeToSec(timeStr) {
        const m = String(timeStr).trim().replace(',', '.').match(/^(\d{2}):(\d{2}):(\d{2})[\.,](\d{1,3})$/);
        if (!m) return 0;
        const [_, hh, mm, ss, ms] = m;
        return (+hh)*3600 + (+mm)*60 + (+ss) + (+ms)/1000;
    }

    secToTime(seconds) {
        const sign = seconds < 0 ? '-' : '';
        seconds = Math.max(0, Math.abs(seconds));
        const hh = Math.floor(seconds/3600).toString().padStart(2,'0');
        const mm = Math.floor((seconds%3600)/60).toString().padStart(2,'0');
        const ss = Math.floor(seconds%60).toString().padStart(2,'0');
        const ms = Math.round((seconds - Math.floor(seconds))*1000).toString().padStart(3,'0');
        return `${sign}${hh}:${mm}:${ss}.${ms}`;
    }

    // SRT Parsing
    parseSRT(text) {
        const blocks = text.replace(/\r/g, '').trim().split(/\n{2,}/);
        return blocks.map((block, index) => {
            const lines = block.split('\n');
            if (lines.length < 2) return null;

            let i = 0;
            if (/^\d+$/.test(lines[0].trim())) i = 1;

            const timeLine = lines[i] || '';
            const tm = timeLine.match(/(\d{2}:\d{2}:\d{2}[\.,]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{1,3})/);
            if (!tm) return null;

            const start = this.timeToSec(tm[1]);
            const end = this.timeToSec(tm[2]);
            const textLines = lines.slice(i+1).join('\n').trim();
            const clean = textLines.replace(/<[^>]+>/g,'');

            return {
                idx: index + 1, // Use the array index instead of this.cues.length
                start,
                end,
                text: clean
            };
        }).filter(Boolean);
    }

    // UI Updates
    updateCurrentSentence() {
        if (!this.cues.length || this.currentIndex < 0 || this.currentIndex >= this.cues.length) {
            this.elements.curIdx.textContent = '–';
            this.elements.curTime.textContent = '00:00:00.000 → 00:00:00.000';
            this.elements.curText.textContent = 'Load an SRT to begin.';
        } else {
            const cue = this.cues[this.currentIndex];
            this.elements.curIdx.textContent = cue.idx;
            this.elements.curTime.textContent = `${this.secToTime(cue.start)} → ${this.secToTime(cue.end)}`;
            this.elements.curText.textContent = cue.text;
        }
        this.renderSentenceList();
        this.saveState();
    }

    renderSentenceList() {
        if (!this.cues.length) {
            this.elements.sentenceList.innerHTML = '';
        } else {
            this.elements.sentenceList.innerHTML = this.cues.map((cue, i) =>
                `<div class="sentence-item${i===this.currentIndex?' active':''}" data-idx="${i}">
                    <span style="color:#94a3b8;">#${cue.idx}</span> 
                    <span style="color:#22d3ee;">[${this.secToTime(cue.start)}]</span> 
                    ${cue.text}
                </div>`
            ).join('');
        }
        this.elements.sentenceList.classList.toggle('hidden', !this.sentenceListVisible);
    }

    // Navigation
    goToSentence(index) {
        if (this.onTimeUpdate) {
            this.elements.videoPlayer.removeEventListener('timeupdate', this.onTimeUpdate);
        }

        if (!this.cues.length) return;

        this.currentIndex = Math.max(0, Math.min(index, this.cues.length-1));
        this.updateCurrentSentence();
        this.playCurrentSentence();
    }

    nextSentence() {
        this.goToSentence(this.currentIndex + 1);
    }

    prevSentence() {
        this.goToSentence(this.currentIndex - 1);
    }

    // Playback
    playCurrentSentence() {
        if (!this.cues.length || this.currentIndex < 0 || this.currentIndex >= this.cues.length) return;

        const cue = this.cues[this.currentIndex];
        this.elements.videoPlayer.currentTime = cue.start;
        this.elements.videoPlayer.play();

        if (this.onTimeUpdate) {
            this.elements.videoPlayer.removeEventListener('timeupdate', this.onTimeUpdate);
        }

        this.onTimeUpdate = () => {
            if (this.elements.videoPlayer.currentTime >= cue.end) {
                this.elements.videoPlayer.pause();
                this.elements.videoPlayer.removeEventListener('timeupdate', this.onTimeUpdate);
            }
        };

        this.elements.videoPlayer.addEventListener('timeupdate', this.onTimeUpdate);
    }

    toggleVideoLock() {
        this.isVideoLocked = !this.isVideoLocked;
        const locked = this.isVideoLocked;

        this.updateButton('lockBtn', {
            text: locked ? '🔒 Locked' : '🔓 Unlock',
            addClass: locked ? 'locked' : null,
            removeClass: locked ? null : 'locked'
        });

        if (locked) {
            // Hide all video controls when locked
            this.elements.videoPlayer.removeAttribute('controls');
        } else {
            // Show video controls when unlocked
            this.elements.videoPlayer.setAttribute('controls', '');
        }

        this.saveState();
    }

    updateButton(baseId, config) {
        const button = this.elements[baseId];
        if (button) {
            if (config.text) button.textContent = config.text;
            if (config.disabled !== undefined) button.disabled = config.disabled;
            if (config.addClass) button.classList.add(config.addClass);
            if (config.removeClass) button.classList.remove(config.removeClass);
        }
    }

    updateButtonGroup(baseId, config) {
        // Update both right and left versions of the button
        ['', 'Left'].forEach(suffix => {
            const button = this.elements[`${baseId}${suffix}`];
            if (button) {
                if (config.text) button.textContent = config.text;
                if (config.disabled !== undefined) button.disabled = config.disabled;
                if (config.addClass) button.classList.add(config.addClass);
                if (config.removeClass) button.classList.remove(config.removeClass);
            }
        });
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Detect supported MIME type for better mobile compatibility
            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                mimeType = 'audio/ogg;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/wav')) {
                mimeType = 'audio/wav';
            }

            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.audioChunks = [];
            this.recordingMimeType = mimeType;

            this.mediaRecorder.addEventListener('dataavailable', event => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            });

            this.mediaRecorder.addEventListener('stop', () => {
                const audioBlob = new Blob(this.audioChunks, { type: this.recordingMimeType });
                this.recordedAudioURL = URL.createObjectURL(audioBlob);
                this.recordedAudioBlob = audioBlob;
                this.updateButtonGroup('playbackBtn', { disabled: false });

                // Stop all tracks to release the microphone
                stream.getTracks().forEach(track => track.stop());
            });

            this.mediaRecorder.addEventListener('error', (event) => {
                console.error('MediaRecorder error:', event);
                alert('Recording error occurred. Please try again.');
                this.stopRecording();
            });

            this.mediaRecorder.start();
            this.isRecording = true;
            this.updateButtonGroup('recordBtn', {
                text: '⏹️',
                addClass: 'recording'
            });
        } catch (error) {
            console.error('Error accessing microphone:', error);
            let errorMessage = 'Could not access microphone. ';
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please grant microphone permission.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No microphone found.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage += 'Your browser does not support audio recording.';
            } else {
                errorMessage += 'Please check your settings and try again.';
            }
            alert(errorMessage);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.updateButtonGroup('recordBtn', {
                text: '🎤',
                removeClass: 'recording'
            });
        }
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    playbackRecording() {
        if (!this.recordedAudioURL) return;

        // If already playing, stop it
        if (this.playbackAudio && !this.playbackAudio.paused) {
            this.stopPlayback();
            return;
        }

        // Stop previous playback if any
        if (this.playbackAudio) {
            this.playbackAudio.pause();
            this.playbackAudio.currentTime = 0;
            this.playbackAudio = null;
        }

        // Create audio element for better mobile compatibility
        this.playbackAudio = new Audio();

        // Set properties for iOS compatibility
        this.playbackAudio.preload = 'auto';
        this.playbackAudio.controls = false;

        // Use blob directly if available for better compatibility
        if (this.recordedAudioBlob) {
            this.playbackAudio.src = URL.createObjectURL(this.recordedAudioBlob);
        } else {
            this.playbackAudio.src = this.recordedAudioURL;
        }

        this.updatePlaybackUI(true);

        // iOS requires user interaction, load first then play
        this.playbackAudio.load();

        // Handle play promise to prevent AbortError
        const playPromise = this.playbackAudio.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('Playback started successfully');
                })
                .catch(error => {
                    console.error('Playback error:', error);
                    this.updatePlaybackUI(false);

                    // Retry once for iOS
                    if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                        setTimeout(() => {
                            this.playbackAudio.play().catch(e => {
                                console.error('Retry failed:', e);
                                alert('Playback failed. Please try again.');
                                this.playbackAudio = null;
                            });
                        }, 100);
                    } else {
                        this.playbackAudio = null;
                    }
                });
        }

        this.playbackAudio.addEventListener('ended', () => {
            this.updatePlaybackUI(false);
            this.playbackAudio = null;
        });

        this.playbackAudio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            this.updatePlaybackUI(false);
            alert('Could not play recording. The audio format may not be supported.');
            this.playbackAudio = null;
        });
    }

    stopPlayback() {
        if (this.playbackAudio) {
            this.playbackAudio.pause();
            this.playbackAudio.currentTime = 0;
            this.updatePlaybackUI(false);
            this.playbackAudio = null;
        }
    }

    updatePlaybackUI(isPlaying) {
        this.updateButtonGroup('playbackBtn', {
            text: isPlaying ? '⏸️ Stop Playback' : '▶️ Playback',
            addClass: isPlaying ? 'playing' : null,
            removeClass: isPlaying ? null : 'playing'
        });
    }

    // File Loading
    async autoLoadMp4() {
        this.elements.videoSource.src = DEFAULT_FILES.mp4;
        this.elements.videoPlayer.load();
    }

    async autoLoadSrt() {
        try {
            const response = await fetch(DEFAULT_FILES.srt);
            const text = await response.text();
            this.cues = this.parseSRT(text);
            this.currentIndex = 0;
            this.updateCurrentSentence();
        } catch (error) {
            console.error('Failed to load SRT file:', error);
        }
    }

    loadMp4() {
        const file = this.elements.mp4File.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        this.elements.videoSource.src = url;
        this.elements.videoPlayer.load();
    }

    async loadSrt() {
        const file = this.elements.srtFile.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            this.cues = this.parseSRT(text);
            this.currentIndex = 0;
            this.updateCurrentSentence();
        } catch (error) {
            console.error('Failed to load SRT file:', error);
        }
    }

    // Event Listeners
    initEventListeners() {
        // File input buttons
        this.elements.loadMp4Btn.addEventListener('click', () => this.loadMp4());
        this.elements.loadSrtBtn.addEventListener('click', () => this.loadSrt());
        this.elements.lockBtn.addEventListener('click', () => this.toggleVideoLock());

        // Dynamic control buttons - use event delegation
        const handleButtonClick = (e) => {
            const button = e.target.closest('.btn[data-action]');
            if (!button) return;

            const action = button.dataset.action;
            if (this[action]) {
                this[action]();
            }
        };

        $('rightControls').addEventListener('click', handleButtonClick);
        $('leftControls').addEventListener('click', handleButtonClick);

        // Toggle sentence list
        this.elements.toggleBtn.addEventListener('click', () => {
            this.sentenceListVisible = !this.sentenceListVisible;
            this.renderSentenceList();
            this.elements.toggleBtn.textContent = this.sentenceListVisible ? 'Hide Sentences' : 'Show Sentences';
            this.saveState();
        });

        // Sentence list clicks
        this.elements.sentenceList.addEventListener('click', e => {
            const item = e.target.closest('.sentence-item');
            if (!item) return;
            const idx = +item.dataset.idx;
            this.goToSentence(idx);
        });

        // Keyboard navigation
        document.addEventListener('keydown', e => {
            const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
            if (isInput && e.ctrlKey || !isInput) {
                if (e.key === 'h') {
                    this.elements.curText.classList.toggle('blurred');
                } else if (e.key === ',' || e.key === 'ArrowLeft') {
                    this.prevSentence();
                } else if (e.key === '.' || e.key === 'ArrowRight') {
                    this.nextSentence();
                } else if (e.key === 'r'|| e.key === 'm') {
                    this.playCurrentSentence();
                } else if (e.key === ' ') {
                    e.preventDefault();
                    if (this.elements.videoPlayer.paused) {
                        this.elements.videoPlayer.play();
                    } else {
                        this.elements.videoPlayer.pause();
                    }
                }
            }
        });

        // Swipe detection (mouse wheel)
        document.addEventListener('wheel', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const now = Date.now();
            if (now - this.lastSwipe < 400) return; // 400ms cooldown

            if (e.deltaX < -40) {
                this.lastSwipe = now;
                this.prevSentence();
            } else if (e.deltaX > 40) {
                this.lastSwipe = now;
                this.nextSentence();
            }
        }, { passive: true });
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const player = new SRTPlayer();

    // Try to restore previous state first
    const stateLoaded = player.loadState();

    if (stateLoaded) {
        // Restore UI from saved state
        player.updateCurrentSentence();
        player.elements.toggleBtn.textContent = player.sentenceListVisible ? 'Hide Sentences' : 'Show Sentences';
    } else {
        // Load defaults if no saved state
        player.autoLoadMp4();
        player.autoLoadSrt();
    }
});
