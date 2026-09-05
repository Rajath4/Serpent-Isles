// ── Procedural WebAudio SFX + ambience (zero assets) ─────────────────────────

type Osc = OscillatorType;

export class SoundBank {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  muted = false;

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  unlock() {
    this.ensure();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  private tone(freq: number, dur: number, type: Osc = 'sine', vol = 0.25, when = 0, slideTo?: number) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol = 0.2, when = 0, lowpass = 2400) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  click() { this.tone(660, 0.07, 'triangle', 0.16); }
  hover() { this.tone(880, 0.04, 'sine', 0.06); }

  dice() {
    for (let i = 0; i < 6; i++) this.noise(0.06, 0.22, i * 0.055, 3200);
    this.tone(180, 0.12, 'triangle', 0.2, 0.32, 120);
  }

  diceLand() {
    this.noise(0.09, 0.28, 0, 1800);
    this.tone(320, 0.1, 'triangle', 0.18, 0, 210);
  }

  /** Velvet bounce tick — strength 0..1 scales the knock. */
  bounce(strength = 1) {
    const s = Math.max(0.05, Math.min(1, strength));
    this.noise(0.05, 0.15 * s, 0, 2600);
    this.tone(210 + Math.random() * 120, 0.07, 'triangle', 0.12 * s, 0, 160);
  }

  hop(step: number) {
    const base = 420 + (step % 8) * 45;
    this.tone(base, 0.11, 'triangle', 0.2, 0, base * 1.5);
  }

  ladder() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.2, i * 0.07));
  }

  snake() {
    this.tone(700, 0.55, 'sawtooth', 0.1, 0, 130);
    this.tone(350, 0.55, 'triangle', 0.16, 0.02, 90);
  }

  six() {
    [880, 1174, 1568].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.18, i * 0.06));
  }

  turn() { this.tone(520, 0.09, 'sine', 0.12, 0, 640); }

  win() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
    seq.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, i * 0.11));
    this.noise(0.5, 0.08, 0.2, 6000);
  }

  startAmbient() {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.ambientNodes.length) return;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      v = v * 0.985 + (Math.random() * 2 - 1) * 0.015;
      d[i] = v * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.ambientNodes.push(src);
    this.startMusic();
  }

  /**
   * Generative music-box: soft pentatonic plucks over a slow bass root.
   * Whisper-quiet by design; the mute button silences everything.
   */
  private musicTimer: number | null = null;

  private startMusic() {
    if (this.musicTimer !== null) return;
    const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
    const roots = [130.8, 98.0, 110.0, 146.8];
    let step = 0;
    const pluck = () => {
      if (!this.muted && this.ctx && this.ctx.state === 'running') {
        // sparse melody — rest every third beat
        if (step % 3 !== 2) {
          const f = scale[Math.floor(Math.random() * scale.length)];
          this.tone(f, 1.6, 'sine', 0.045);
          this.tone(f * 2, 1.1, 'triangle', 0.018, 0.02);
          if (Math.random() < 0.3) this.tone(f * 1.5, 1.4, 'sine', 0.03, 0.35);
        }
        // root shift every 8 beats
        if (step % 8 === 0) {
          const root = roots[(step / 8) % roots.length | 0];
          this.tone(root, 3.2, 'sine', 0.05);
          this.tone(root * 1.5, 3.0, 'sine', 0.028, 0.1);
        }
        step++;
      }
    };
    this.musicTimer = window.setInterval(pluck, 1500);
  }
}
