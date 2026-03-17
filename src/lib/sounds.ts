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

  private playAurora(freqs: number[], duration: number = 0.5, volume: number = 0.3) {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.connect(this.ctx.destination);
    
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(volume, now + 0.05);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    freqs.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.05, now + duration);
      
      gain.gain.setValueAtTime(0.2, now);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      osc.start(now);
      osc.stop(now + duration);
    });
  }

  playJoin() {
    this.playAurora([261.63, 329.63, 392.00, 523.25], 0.8, 0.4); // C major chord
  }

  playLeave() {
    this.playAurora([523.25, 392.00, 329.63, 261.63], 0.8, 0.4); // Descending C major
  }

  playStartShare() {
    this.playAurora([440, 554.37, 659.25], 0.6, 0.3); // A major
  }

  playStopShare() {
    this.playAurora([659.25, 554.37, 440], 0.6, 0.3); // Descending A major
  }

  playJoinStream() {
    this.playAurora([587.33, 739.99, 880], 0.4, 0.3); // D major
  }

  playLeaveStream() {
    this.playAurora([880, 739.99, 587.33], 0.4, 0.3); // Descending D major
  }
}

export const sounds = new SoundManager();
