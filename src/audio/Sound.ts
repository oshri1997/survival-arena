import type { Sound as SoundName } from '../game/types';

/** Small synthesized spell palette. Audio is created/resumed only inside a user gesture (iOS). */
export class Sound {
  private context?: AudioContext;
  private master?: GainNode;
  private lastShot = 0;
  muted = false;
  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.2;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch {
      /* Browsers without Web Audio remain playable. */
    }
  }
  toggle() {
    this.muted = !this.muted;
    this.unlock();
    return this.muted;
  }
  play(name: SoundName) {
    const c = this.context;
    if (!c || !this.master || this.muted || c.state !== 'running') return;
    if (name === 'shot' && c.currentTime - this.lastShot < 0.14) return;
    if (name === 'shot') this.lastShot = c.currentTime;
    const palettes: Record<SoundName, [number, number, number, OscillatorType]> = {
      shot: [740, 360, 0.09, 'sine'],
      hit: [120, 50, 0.16, 'triangle'],
      kill: [410, 180, 0.1, 'triangle'],
      nova: [180, 40, 0.45, 'sawtooth'],
      frost: [1200, 1700, 0.4, 'sine'],
      gift: [660, 990, 0.3, 'sine'],
      boss: [65, 38, 0.7, 'sawtooth'],
      wave: [440, 880, 0.5, 'sine'],
      lightning: [1800, 200, 0.23, 'sawtooth'],
      defeat: [240, 65, 0.8, 'triangle'],
    };
    const [from, to, duration, type] = palettes[name],
      oscillator = c.createOscillator(),
      envelope = c.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, c.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, c.currentTime + duration);
    envelope.gain.setValueAtTime(0, c.currentTime);
    envelope.gain.linearRampToValueAtTime(name === 'shot' ? 0.12 : 0.32, c.currentTime + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start();
    oscillator.stop(c.currentTime + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  suspend() {
    void this.context?.suspend().catch(() => {});
  }
}
