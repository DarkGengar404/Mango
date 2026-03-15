class SoundManager {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(freqs: number[], duration: number = 0.1, type: OscillatorType = 'sine') {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    freqs.forEach((f, i) => {
      osc.frequency.setValueAtTime(f, now + (i * duration / freqs.length));
    });

    osc.start(now);
    osc.stop(now + duration);
  }

  playJoin() {
    this.playTone([440, 880], 0.2);
  }

  playLeave() {
    this.playTone([880, 440], 0.2);
  }

  playStartShare() {
    this.playTone([660, 990], 0.15);
  }

  playStopShare() {
    this.playTone([990, 660], 0.15);
  }

  playJoinStream() {
    this.playTone([880, 880], 0.1, 'square');
  }

  playLeaveStream() {
    this.playTone([440, 440], 0.1, 'square');
  }
}

export const sounds = new SoundManager();
