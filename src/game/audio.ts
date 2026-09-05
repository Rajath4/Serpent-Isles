// ── Procedural WebAudio SFX + ambience (zero assets) ─────────────────────────

type Osc = OscillatorType;

export class SoundBank {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private unlocked = false;
  muted = false;
  musicMuted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('serpent-muted') === '1';
      this.musicMuted = localStorage.getItem('serpent-music') === '0';
    } catch {
      /* private mode — sound on */
    }
  }

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        // music rides its own bus — players can hush the band, keep the dice
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicMuted ? 0 : 1;
        this.musicBus.connect(this.master);
        // glue: a gentle bus compressor so stacked fanfares never clip phone speakers
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 12;
        comp.ratio.value = 5;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  unlock() {
    this.unlocked = true;
    this.ensure();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('serpent-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  setMusicMuted(m: boolean) {
    this.musicMuted = m;
    try {
      localStorage.setItem('serpent-music', m ? '0' : '1');
    } catch {
      /* ignore */
    }
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.1);
    }
  }

  hover() {
    if (!this.unlocked) return; // never conjure a context pre-gesture
    this.tone(880, 0.04, 'sine', 0.06);
  }

  private tone(freq: number, dur: number, type: Osc = 'sine', vol = 0.25, when = 0, slideTo?: number, music = false) {
    if (this.muted || (music && this.musicMuted)) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const bus = music && this.musicBus ? this.musicBus : this.master;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // one shared white-noise buffer — per-call buffer baking was GC churn
  private noiseBuf: AudioBuffer | null = null;

  private sharedNoise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  private noise(dur: number, vol = 0.2, when = 0, lowpass = 2400) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.sharedNoise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  click() { this.tone(660, 0.07, 'triangle', 0.16); }

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

  /** Rising shimmer while the die charges under the camera glide. */
  charge() {
    this.tone(180, 0.65, 'sine', 0.06, 0, 880);
    this.tone(360, 0.6, 'triangle', 0.03, 0.05, 1320);
  }

  /** Launch whoosh as the die leaves the velvet. */
  whoosh() {
    this.noise(0.35, 0.16, 0, 1200);
    this.tone(140, 0.4, 'sawtooth', 0.05, 0, 720);
  }

  /** Tiny lock-click when the true face settles. */
  settleClick() {
    this.tone(520, 0.06, 'triangle', 0.14);
    this.noise(0.03, 0.08, 0, 4000);
  }

  /** Denied-action bonk — overshoot stays and locked gates must thud, not vanish. */
  bonk() {
    this.tone(190, 0.09, 'triangle', 0.15, 0, 140);
    this.tone(150, 0.11, 'triangle', 0.13, 0.09, 110);
  }

  /** Third-six punishment sting — a little storm cloud in two notes. */
  womp() {
    this.tone(392, 0.16, 'triangle', 0.16, 0, 370);
    this.tone(311, 0.26, 'triangle', 0.16, 0.14, 233);
  }

  /** Serpent landing thud at the tail. */
  thud() {
    this.tone(140, 0.18, 'triangle', 0.22, 0, 90);
    this.noise(0.08, 0.12, 0, 900);
  }

  /** Sky-ladder arrival chime. */
  ding() {
    this.tone(880, 0.25, 'sine', 0.16);
    this.tone(1320, 0.3, 'sine', 0.08, 0.06);
  }

  /** Rising golden glissando bed across a ladder climb (whisper-quiet). */
  climbGliss() {
    this.tone(320, 1.5, 'sine', 0.06, 0, 1250);
    this.tone(640, 1.5, 'triangle', 0.03, 0.08, 1660);
  }

  /** Falling serpent glissando bed across a slide (whisper-quiet). */
  slideGliss() {
    this.tone(620, 1.5, 'sawtooth', 0.04, 0, 110);
  }

  /** Match-point heartbeat — two soft low ticks when the crown is ≤6 away. */
  heartbeat() {
    this.tone(150, 0.09, 'sine', 0.05);
    this.tone(130, 0.11, 'sine', 0.05, 0.18);
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
          this.tone(f, 1.6, 'sine', 0.045, 0, undefined, true);
          this.tone(f * 2, 1.1, 'triangle', 0.018, 0.02, undefined, true);
          if (Math.random() < 0.3) this.tone(f * 1.5, 1.4, 'sine', 0.03, 0.35, undefined, true);
        }
        // root shift every 8 beats
        if (step % 8 === 0) {
          const root = roots[(step / 8) % roots.length | 0];
          this.tone(root, 3.2, 'sine', 0.05, 0, undefined, true);
          this.tone(root * 1.5, 3.0, 'sine', 0.028, 0.1, undefined, true);
        }
        step++;
      }
    };
    const tick = (): void => {
      pluck();
      // breathing tempo — a music box with a pulse, not a metronome
      this.musicTimer = window.setTimeout(tick, 1350 + Math.random() * 450);
    };
    this.musicTimer = window.setTimeout(tick, 1200);
  }
}
