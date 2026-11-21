// Procedural audio: everything is synthesized with the Web Audio API.
// Engine hum, tire screech, gunshots, explosions, sirens, pickups, and
// two radio stations (synthwave + latin-funk) with live patterns.
import { RADIO } from './config.js';
function midi(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
}
export class AudioEngine {
    ctx = null;
    master = null;
    radioGain = null;
    engineOsc = null;
    engineOsc2 = null;
    engineGain = null;
    engineFilter = null;
    sirenOsc = null;
    sirenGain = null;
    sirenLfo = null;
    station = 2; // Radio Off by default
    radioTimer = null;
    nextNoteTime = 0;
    step = 0;
    volume = 0.8;
    muted = false;
    unlock() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended')
                void this.ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC)
            return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.radioGain = this.ctx.createGain();
        this.radioGain.gain.value = 0.32;
        this.radioGain.connect(this.master);
        // engine hum: two detuned saws through a lowpass
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 420;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 55;
        this.engineOsc2 = this.ctx.createOscillator();
        this.engineOsc2.type = 'square';
        this.engineOsc2.frequency.value = 27.5;
        this.engineOsc.connect(this.engineFilter);
        this.engineOsc2.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
        this.engineOsc2.start();
        // siren: triangle two-tone via LFO on frequency
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenOsc.frequency.value = 700;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.sirenLfo = this.ctx.createOscillator();
        this.sirenLfo.type = 'square';
        this.sirenLfo.frequency.value = 0.55;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 180;
        this.sirenLfo.connect(lfoGain);
        lfoGain.connect(this.sirenOsc.frequency);
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
        this.sirenLfo.start();
    }
    setVolume(v) {
        this.volume = v;
        if (this.master && this.ctx)
            this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
    }
    setMuted(m) {
        this.muted = m;
        if (this.master && this.ctx)
            this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
    setEngine(rpm, driving) {
        if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.engineGain || !this.engineFilter)
            return;
        const t = this.ctx.currentTime;
        const f = 42 + rpm * 130;
        this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
        this.engineOsc2.frequency.setTargetAtTime(f / 2, t, 0.06);
        this.engineFilter.frequency.setTargetAtTime(320 + rpm * 900, t, 0.08);
        this.engineGain.gain.setTargetAtTime(driving ? 0.05 + rpm * 0.05 : 0.02, t, 0.1);
    }
    setSiren(on) {
        if (!this.ctx || !this.sirenGain)
            return;
        this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
    }
    blip(freq, dur, type, vol, slideTo) {
        if (!this.ctx || !this.master)
            return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slideTo !== undefined)
            o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.02);
    }
    noise(dur, vol, filterFreq, type = 'lowpass') {
        if (!this.ctx || !this.master)
            return;
        const t = this.ctx.currentTime;
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++)
            data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = filterFreq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f);
        f.connect(g);
        g.connect(this.master);
        src.start(t);
    }
    shot() {
        this.noise(0.14, 0.5, 2400, 'highpass');
        this.blip(180, 0.08, 'square', 0.22, 60);
    }
    explosion() {
        this.noise(0.9, 0.9, 320);
        this.blip(90, 0.7, 'sine', 0.5, 28);
    }
    pickup() {
        this.blip(880, 0.09, 'sine', 0.25);
        setTimeout(() => this.blip(1320, 0.12, 'sine', 0.22), 70);
    }
    click() {
        this.blip(660, 0.05, 'square', 0.12);
    }
    reload() {
        this.blip(300, 0.05, 'square', 0.15);
        setTimeout(() => this.blip(420, 0.05, 'square', 0.15), 120);
    }
    hurt() {
        this.blip(140, 0.16, 'sawtooth', 0.25, 70);
    }
    horn() {
        this.blip(220, 0.28, 'square', 0.16);
        this.blip(277, 0.28, 'square', 0.12);
    }
    screech() {
        this.noise(0.3, 0.12, 3200, 'bandpass');
    }
    missionDone() {
        const notes = [523, 659, 784, 1046];
        notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.25), i * 110));
    }
    // ---- radio ----
    getStationName() {
        return RADIO[this.station].name;
    }
    cycleStation() {
        this.setStation((this.station + 1) % RADIO.length);
        return this.station;
    }
    setStation(i) {
        this.station = i;
        if (this.radioTimer !== null) {
            window.clearInterval(this.radioTimer);
            this.radioTimer = null;
        }
        if (!this.ctx || RADIO[i].kind === 'off')
            return;
        this.step = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.radioTimer = window.setInterval(() => this.scheduleRadio(), 120);
    }
    scheduleRadio() {
        if (!this.ctx || !this.radioGain)
            return;
        const kind = RADIO[this.station].kind;
        if (kind === 'off')
            return;
        const stepDur = kind === 'synth' ? 0.21 : 0.24;
        while (this.nextNoteTime < this.ctx.currentTime + 0.35) {
            this.playRadioStep(kind, this.step, this.nextNoteTime, stepDur);
            this.nextNoteTime += stepDur;
            this.step = (this.step + 1) % 64;
        }
    }
    radioNote(freq, t, dur, type, vol) {
        if (!this.ctx || !this.radioGain)
            return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g);
        g.connect(this.radioGain);
        o.start(t);
        o.stop(t + dur + 0.05);
    }
    playRadioStep(kind, step, t, stepDur) {
        // Am - F - C - G progression, 16 steps per chord
        const roots = [45, 41, 48, 43];
        const chord = roots[Math.floor(step / 16) % 4];
        if (kind === 'synth') {
            const arp = [0, 3, 7, 12, 7, 3];
            const n = arp[step % 6];
            this.radioNote(midi(chord + 12 + n), t, stepDur * 0.9, 'sawtooth', 0.06);
            if (step % 8 === 0)
                this.radioNote(midi(chord - 12), t, stepDur * 6, 'triangle', 0.14);
            if (step % 4 === 2)
                this.radioNote(midi(chord + 19), t, stepDur * 0.8, 'square', 0.03);
        }
        else {
            // latin-funk: syncopated bass + chord stabs
            const bassPat = [0, -1, 0, -1, 7, -1, 0, 10];
            const b = bassPat[step % 8];
            if (b >= 0)
                this.radioNote(midi(chord - 12 + b), t, stepDur * 0.9, 'triangle', 0.16);
            if (step % 8 === 4 || step % 8 === 6) {
                this.radioNote(midi(chord + 7), t, stepDur * 0.5, 'square', 0.04);
                this.radioNote(midi(chord + 12), t, stepDur * 0.5, 'square', 0.04);
            }
            if (step % 16 === 14)
                this.radioNote(midi(chord + 24), t, stepDur, 'sine', 0.06);
        }
    }
}
