/**
 * Tiny procedural sound synth on WebAudio. Every sound is a few oscillators or a noise burst,
 * so there are no audio files to download and everything works offline.
 */
type Wave = OscillatorType;

interface Tone {
  freq: number;
  /** Frequency at the end of the sound. */
  to?: number;
  dur: number;
  vol?: number;
  wave?: Wave;
  delay?: number;
}

const MAX_VOICES_PER_FRAME = 6;

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private voiceReset = 0;

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
    const now = performance.now();
    if (now - this.voiceReset > 16) {
      this.voiceReset = now;
      this.voices = 0;
    }
    if (this.voices >= MAX_VOICES_PER_FRAME) return null;
    this.voices++;
    return this.ctx;
  }

  tone(t: Tone): void {
    const ctx = this.ready();
    if (!ctx) return;
    const start = ctx.currentTime + (t.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = t.wave ?? 'triangle';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, t.to), start + t.dur);
    const vol = t.vol ?? 0.1;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(g).connect(this.master!);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }

  burst(dur: number, vol: number, cutoff: number, delay = 0): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, start);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.15), start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(start, Math.random() * 0.3);
    src.stop(start + dur + 0.02);
  }

  // ---- the game's sounds ----

  /** Semitone offset from a base pitch. */
  private st(base: number, n: number): number {
    return base * 2 ** (n / 12);
  }

  launch(): void { this.tone({ freq: 520, to: 780, dur: 0.045, vol: 0.035, wave: 'triangle' }); }
  wall(): void { this.tone({ freq: 1400, dur: 0.018, vol: 0.02, wave: 'sine' }); }
  /** `combo` is the hit count this volley; pitch climbs a pentatonic scale. */
  hit(combo: number): void {
    const scale = [0, 2, 4, 7, 9];
    const n = Math.min(combo, 24);
    const semis = scale[n % 5] + 12 * Math.floor(n / 5);
    this.tone({ freq: this.st(262, semis), dur: 0.06, vol: 0.05, wave: 'square' });
  }
  kill(combo: number): void {
    const f = this.st(392, Math.min(combo, 20));
    this.tone({ freq: f, to: f * 2, dur: 0.09, vol: 0.09, wave: 'triangle' });
    this.burst(0.08, 0.12, 4000);
  }
  orb(): void {
    [0, 4, 7, 12].forEach((n, i) => this.tone({ freq: this.st(784, n), dur: 0.08, vol: 0.05, wave: 'sine', delay: i * 0.045 }));
  }
  fire(): void {
    this.tone({ freq: 180, to: 520, dur: 0.08, vol: 0.08, wave: 'square' });
    this.burst(0.05, 0.05, 2500);
  }
  drop(): void {
    this.tone({ freq: 150, to: 60, dur: 0.16, vol: 0.14, wave: 'sine' });
    this.burst(0.06, 0.04, 600);
  }
  combo(level: number): void {
    const f = this.st(523, Math.min(level, 12));
    this.tone({ freq: f, dur: 0.09, vol: 0.06, wave: 'square' });
    this.tone({ freq: f * 1.5, dur: 0.14, vol: 0.06, wave: 'square', delay: 0.07 });
  }
  heartbeat(): void {
    this.tone({ freq: 70, to: 50, dur: 0.12, vol: 0.18, wave: 'sine' });
    this.tone({ freq: 65, to: 45, dur: 0.12, vol: 0.14, wave: 'sine', delay: 0.18 });
  }
  over(): void {
    this.tone({ freq: 440, to: 90, dur: 0.7, vol: 0.1, wave: 'sawtooth' });
    this.burst(0.5, 0.15, 1500);
  }
  click(): void { this.tone({ freq: 900, dur: 0.03, vol: 0.04, wave: 'square' }); }
}

/** Short vibrations on Android. iOS Safari has no Vibration API, so this quietly does nothing there. */
export class Haptics {
  enabled = true;
  private last = 0;

  buzz(ms: number | number[], minGap = 40): void {
    if (!this.enabled || !('vibrate' in navigator)) return;
    const now = performance.now();
    if (now - this.last < minGap) return;
    this.last = now;
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }
}
