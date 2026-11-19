// Procedural audio: every sound in Solmar is synthesized live with the Web
// Audio API. No audio files, no network. Engine hum, tire skid, gunshots,
// sirens, explosions and two radio stations (synthwave + latin-funk) run off
// a small step sequencer with a lookahead scheduler.
import { clamp } from './config.js';
const WAVE_BASS = [
    { m: 45, d: 4 }, { m: 45, d: 4 }, { m: 43, d: 4 }, { m: 41, d: 4 },
    { m: 45, d: 4 }, { m: 45, d: 4 }, { m: 48, d: 4 }, { m: 43, d: 4 },
];
const WAVE_CHORDS = [
    [57, 60, 64], [57, 60, 64], [55, 59, 62], [53, 57, 60],
    [57, 60, 64], [57, 60, 64], [60, 64, 67], [55, 59, 62],
];
const HEAT_BASS = [
    { m: 41, d: 3 }, { m: 41, d: 1 }, { m: 41, d: 2 }, { m: 44, d: 2 },
    { m: 41, d: 3 }, { m: 46, d: 1 }, { m: 43, d: 2 }, { m: 39, d: 2 },
];
const HEAT_CHORDS = [
    [53, 57, 60], [53, 57, 60], [52, 55, 59], [50, 53, 57],
    [53, 57, 60], [55, 59, 62], [53, 57, 60], [48, 52, 55],
];
function midiFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
}
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.noiseBuf = null;
        this.engineOsc = [];
        this.engineGain = null;
        this.engineFilter = null;
        this.skidSrc = null;
        this.skidGain = null;
        this.sirenOsc = null;
        this.sirenGain = null;
        this.sirenLfo = null;
        this.station = 'off';
        this.step = 0;
        this.nextStepTime = 0;
        this.timer = null;
        this.volume = 0.8;
        this.ready = false;
    }
    init() {
        if (this.ready)
            return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            this.master.connect(this.ctx.destination);
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.5;
            this.musicGain.connect(this.master);
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.9;
            this.sfxGain.connect(this.master);
            const len = this.ctx.sampleRate;
            this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const data = this.noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++)
                data[i] = Math.random() * 2 - 1;
            this.ready = true;
            this.startMusicTimer();
        }
        catch {
            this.ready = false;
        }
    }
    resume() {
        if (this.ctx && this.ctx.state === 'suspended')
            void this.ctx.resume();
    }
    setVolume(v) {
        this.volume = clamp(v, 0, 1);
        if (this.master && this.ctx)
            this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
    setStation(s) {
        this.station = s;
        this.step = 0;
        if (this.ctx)
            this.nextStepTime = this.ctx.currentTime + 0.1;
    }
    getStation() {
        return this.station;
    }
    startMusicTimer() {
        if (this.timer)
            return;
        this.timer = setInterval(() => this.scheduleMusic(), 90);
    }
    scheduleMusic() {
        if (!this.ctx || !this.ready || this.station === 'off')
            return;
        const bpm = this.station === 'wave' ? 102 : 96;
        const stepDur = 60 / bpm / 2; // eighth notes
        while (this.nextStepTime < this.ctx.currentTime + 0.25) {
            this.playStep(this.step, this.nextStepTime, stepDur);
            this.nextStepTime += stepDur;
            this.step = (this.step + 1) % 64;
        }
    }
    playStep(step, t, stepDur) {
        if (!this.ctx || !this.musicGain || !this.noiseBuf)
            return;
        const isWave = this.station === 'wave';
        const bass = isWave ? WAVE_BASS : HEAT_BASS;
        const chords = isWave ? WAVE_CHORDS : HEAT_CHORDS;
        const bar = Math.floor(step / 8) % 4;
        const beat = step % 8;
        // Bass note: root on the beat, syncopated offbeats from the pattern.
        const bassPattern = isWave ? [0, -1, 0, -1, 0, -1, 3, -1] : [0, -1, 0, 2, -1, 0, -1, 3];
        const bassRel = bassPattern[beat];
        if (bassRel >= 0) {
            const base = bass[bar * 2].m;
            this.tone(midiFreq(base + bassRel * 2), t, stepDur * 1.8, 'sawtooth', 0.16, this.musicGain, 320);
        }
        // Chord stab on beat 0 and 4 (wave) or 0, 3, 6 (heat).
        const stab = isWave ? beat === 0 || beat === 4 : beat === 0 || beat === 3 || beat === 6;
        if (stab) {
            for (const m of chords[bar * 2 + (beat >= 4 ? 1 : 0)]) {
                this.tone(midiFreq(m), t, stepDur * 1.4, 'triangle', 0.05, this.musicGain, 1800);
            }
        }
        // Hat tick every eighth (wave) or offbeat (heat).
        if (isWave || beat % 2 === 1) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuf;
            const hp = this.ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 7000;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(isWave ? 0.05 : 0.09, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            src.connect(hp).connect(g).connect(this.musicGain);
            src.start(t, Math.random() * 0.5, 0.06);
        }
        // Wave pad: soft detuned saws on bar starts.
        if (isWave && beat === 0) {
            for (const m of chords[bar * 2]) {
                this.tone(midiFreq(m), t, stepDur * 8, 'sawtooth', 0.02, this.musicGain, 900);
            }
        }
    }
    tone(freq, t, dur, type, vol, dest, cutoff) {
        if (!this.ctx)
            return;
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = cutoff;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(f).connect(g).connect(dest);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }
    burst(dur, filterFreq, vol, type = 'lowpass') {
        if (!this.ctx || !this.sfxGain || !this.noiseBuf)
            return;
        const t = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.playbackRate.value = 0.7 + Math.random() * 0.6;
        const f = this.ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = filterFreq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f).connect(g).connect(this.sfxGain);
        src.start(t, Math.random() * 0.4, dur + 0.05);
    }
    gunshot(kind) {
        if (!this.ready)
            return;
        if (kind === 'kestrel') {
            this.burst(0.09, 2400, 0.5);
            this.tone(190, this.ctx.currentTime, 0.07, 'sine', 0.35, this.sfxGain, 900);
        }
        else if (kind === 'viper') {
            this.burst(0.07, 3200, 0.4);
        }
        else if (kind === 'bulldog') {
            this.burst(0.14, 1800, 0.65);
            this.tone(120, this.ctx.currentTime, 0.12, 'sine', 0.5, this.sfxGain, 600);
        }
        else {
            this.burst(0.08, 2000, 0.4);
        }
    }
    explosion() {
        if (!this.ready || !this.ctx)
            return;
        this.burst(0.9, 500, 0.9);
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.7);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(g).connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.85);
    }
    pickup() {
        if (!this.ready || !this.ctx)
            return;
        const t = this.ctx.currentTime;
        this.tone(880, t, 0.1, 'sine', 0.25, this.sfxGain, 3000);
        this.tone(1318, t + 0.08, 0.14, 'sine', 0.25, this.sfxGain, 3000);
    }
    uiClick() {
        if (!this.ready || !this.ctx)
            return;
        this.tone(660, this.ctx.currentTime, 0.06, 'square', 0.12, this.sfxGain, 2000);
    }
    missionDone() {
        if (!this.ready || !this.ctx)
            return;
        const t = this.ctx.currentTime;
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.11, 0.22, 'triangle', 0.22, this.sfxGain, 3000));
    }
    wasted() {
        if (!this.ready || !this.ctx)
            return;
        const t = this.ctx.currentTime;
        [392, 311, 233].forEach((f, i) => this.tone(f, t + i * 0.22, 0.3, 'sawtooth', 0.18, this.sfxGain, 1200));
    }
    startEngine() {
        if (!this.ready || !this.ctx || this.engineOsc.length > 0)
            return;
        const ctx = this.ctx;
        this.engineFilter = ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 420;
        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineFilter.connect(this.engineGain).connect(this.sfxGain);
        for (const type of ['sawtooth', 'square']) {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.value = 55;
            o.connect(this.engineFilter);
            o.start();
            this.engineOsc.push(o);
        }
    }
    setEngine(rpm, load) {
        if (!this.ctx || this.engineOsc.length === 0 || !this.engineGain || !this.engineFilter)
            return;
        const t = this.ctx.currentTime;
        const freq = 48 + rpm * 130;
        this.engineOsc[0].frequency.setTargetAtTime(freq, t, 0.06);
        this.engineOsc[1].frequency.setTargetAtTime(freq * 0.5 + 2, t, 0.06);
        this.engineGain.gain.setTargetAtTime(0.05 + load * 0.09, t, 0.08);
        this.engineFilter.frequency.setTargetAtTime(320 + rpm * 900, t, 0.1);
    }
    stopEngine() {
        if (!this.ctx)
            return;
        const t = this.ctx.currentTime;
        if (this.engineGain)
            this.engineGain.gain.setTargetAtTime(0, t, 0.1);
        const oscs = this.engineOsc;
        this.engineOsc = [];
        window.setTimeout(() => {
            for (const o of oscs) {
                try {
                    o.stop();
                }
                catch { /* already stopped */ }
            }
        }, 600);
    }
    setSkid(amount) {
        if (!this.ready || !this.ctx || !this.noiseBuf)
            return;
        if (!this.skidSrc) {
            this.skidSrc = this.ctx.createBufferSource();
            this.skidSrc.buffer = this.noiseBuf;
            this.skidSrc.loop = true;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 900;
            bp.Q.value = 1.2;
            this.skidGain = this.ctx.createGain();
            this.skidGain.gain.value = 0;
            this.skidSrc.connect(bp).connect(this.skidGain).connect(this.sfxGain);
            this.skidSrc.start();
        }
        if (this.skidGain)
            this.skidGain.gain.setTargetAtTime(clamp(amount, 0, 1) * 0.16, this.ctx.currentTime, 0.05);
    }
    setSiren(on) {
        if (!this.ready || !this.ctx)
            return;
        if (on && !this.sirenOsc) {
            const ctx = this.ctx;
            this.sirenOsc = ctx.createOscillator();
            this.sirenOsc.type = 'sine';
            this.sirenOsc.frequency.value = 850;
            this.sirenLfo = ctx.createOscillator();
            this.sirenLfo.type = 'square';
            this.sirenLfo.frequency.value = 1.4;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 180;
            this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
            this.sirenGain = ctx.createGain();
            this.sirenGain.gain.value = 0.05;
            this.sirenOsc.connect(this.sirenGain).connect(this.sfxGain);
            this.sirenOsc.start();
            this.sirenLfo.start();
        }
        else if (!on && this.sirenOsc) {
            const o = this.sirenOsc;
            const l = this.sirenLfo;
            this.sirenOsc = null;
            this.sirenLfo = null;
            window.setTimeout(() => {
                try {
                    o.stop();
                    l?.stop();
                }
                catch { /* stopped */ }
            }, 100);
            if (this.sirenGain)
                this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        }
    }
}
