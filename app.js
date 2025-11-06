// Configuration
const DEFAULT_FILES = {
    mp4: 'gump.mp4',
    srt: 'gump.srt'
};

// DOM Helper
const $ = id => document.getElementById(id);

// SRT Player Class
class SRTPlayer {
    constructor() {
        // DOM Elements
        this.elements = {
            curIdx: $('curIdx'),
            curTime: $('curTime'),
            curText: $('curText'),
            prevBtn: $('prevBtn'),
            nextBtn: $('nextBtn'),
            srtFile: $('srtFile'),
            loadSrtBtn: $('loadSrtBtn'),
            videoPlayer: $('videoPlayer'),
            videoSource: $('videoSource'),
            mp4File: $('mp4File'),
            loadMp4Btn: $('loadMp4Btn'),
            sentenceList: $('sentenceList'),
            toggleBtn: $('toggleSentenceListBtn'),
            repeatBtn: $('repeatBtn')
        };

        // State
        this.cues = [];
        this.currentIndex = -1;
        this.sentenceListVisible = true;
        this.onTimeUpdate = null;
        this.lastSwipe = 0;

        // Initialize
        this.initEventListeners();
        this.renderSentenceList();
        this.elements.toggleBtn.textContent = 'Hide Sentences';
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
        // Button clicks
        this.elements.loadMp4Btn.addEventListener('click', () => this.loadMp4());
        this.elements.loadSrtBtn.addEventListener('click', () => this.loadSrt());
        this.elements.prevBtn.addEventListener('click', () => this.prevSentence());
        this.elements.nextBtn.addEventListener('click', () => this.nextSentence());
        this.elements.repeatBtn.addEventListener('click', () => this.playCurrentSentence());

        // Toggle sentence list
        this.elements.toggleBtn.addEventListener('click', () => {
            this.sentenceListVisible = !this.sentenceListVisible;
            this.renderSentenceList();
            this.elements.toggleBtn.textContent = this.sentenceListVisible ? 'Hide Sentences' : 'Show Sentences';
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
    player.autoLoadMp4();
    player.autoLoadSrt();
});
