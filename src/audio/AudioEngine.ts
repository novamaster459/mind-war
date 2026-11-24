// ============================================================================
// Web Audio API sound engine.
// Generates procedural SFX so the game stays fully offline (no audio files).
// Phase 5 will layer in richer samples; the API is stable from Phase 1.
// ============================================================================

type SfxName =
  | 'uiHover'
  | 'uiClick'
  | 'unitSelect'
  | 'unitAck'
  | 'move'
  | 'artillery'
  | 'gunfire'
  | 'explosion'
  | 'capture'
  | 'power'
  | 'turnStart'
  | 'victory'
  | 'defeat';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private _sfxVolume = 0.7;
  private _musicVolume = 0.4;
  private _enabled = true;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this._sfxVolume;
      this.sfxGain.connect(this.master);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this._musicVolume;
      this.musicGain.connect(this.master);
    }
    return this.ctx;
  }

  /** Must be called from a user gesture to unlock audio on mobile. */
  resume(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  setSfxVolume(v: number): void {
    this._sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = this._enabled ? v : 0;
  }
  setMusicVolume(v: number): void {
    this._musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = this._enabled ? v : 0;
  }
  setEnabled(b: boolean): void {
    this._enabled = b;
    if (this.master) this.master.gain.value = b ? 1 : 0;
  }

  /** Core tone helper. */
  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    dest: GainNode | null,
    when = 0,
    slideTo?: number,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !dest) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Noise burst (explosions / gunfire). */
  private noise(dur: number, gain: number, filterFreq: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const t0 = ctx.currentTime + when;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
  }

  play(name: SfxName): void {
    if (!this._enabled) return;
    const d = this.sfxGain;
    switch (name) {
      case 'uiHover':
        this.tone(1200, 0.04, 'square', 0.03, d);
        break;
      case 'uiClick':
        this.tone(800, 0.06, 'square', 0.06, d, 0, 500);
        break;
      case 'unitSelect':
        this.tone(660, 0.08, 'triangle', 0.1, d, 0, 880);
        break;
      case 'unitAck':
        this.tone(520, 0.07, 'square', 0.06, d);
        this.tone(780, 0.07, 'square', 0.06, d, 0.08);
        break;
      case 'move':
        this.tone(300, 0.1, 'sine', 0.08, d, 0, 200);
        break;
      case 'gunfire':
        this.noise(0.08, 0.25, 2200);
        break;
      case 'artillery':
        this.tone(120, 0.4, 'sine', 0.3, d, 0, 40);
        this.noise(0.5, 0.4, 800);
        break;
      case 'explosion':
        this.noise(0.6, 0.5, 500);
        this.tone(80, 0.5, 'sine', 0.3, d, 0, 30);
        break;
      case 'capture':
        this.tone(440, 0.1, 'triangle', 0.1, d);
        this.tone(660, 0.1, 'triangle', 0.1, d, 0.1);
        this.tone(880, 0.15, 'triangle', 0.1, d, 0.2);
        break;
      case 'power':
        this.tone(200, 0.6, 'sawtooth', 0.15, d, 0, 900);
        break;
      case 'turnStart':
        this.tone(440, 0.12, 'square', 0.08, d);
        this.tone(660, 0.12, 'square', 0.08, d, 0.14);
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, d, i * 0.16));
        break;
      case 'defeat':
        [440, 370, 294, 220].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.12, d, i * 0.18));
        break;
    }
  }
}

export const audio = new AudioEngine();
export type { SfxName };