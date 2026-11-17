import { JobId, Rarity } from './types';

// Retro Noir / Gangster Chiptune Web Audio Synthesizer
class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private sfxVolume = 0.75;
  private bgmVolume = 0.35;
  private lastAttackSoundAt = 0;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private isFeverMode = false;

  private gestureListenersBound = false;

  constructor() {
    this.bindGestureUnlock();
  }

  private bindGestureUnlock() {
    if (this.gestureListenersBound || typeof window === 'undefined') return;
    this.gestureListenersBound = true;
    const onFirstGesture = () => {
      this.unlock();
      if (this.ctx && this.ctx.state === 'running') {
        window.removeEventListener('pointerdown', onFirstGesture, true);
        window.removeEventListener('touchstart', onFirstGesture, true);
        window.removeEventListener('keydown', onFirstGesture, true);
      }
    };
    window.addEventListener('pointerdown', onFirstGesture, { capture: true, passive: true });
    window.addEventListener('touchstart', onFirstGesture, { capture: true, passive: true });
    window.addEventListener('keydown', onFirstGesture, { capture: true, passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        const resumePromise = this.ctx.resume();
        if (resumePromise && typeof resumePromise.catch === 'function') {
          resumePromise.catch(() => {});
        }
      } catch {
        // Ignore autoplay policy restrictions until user gesture
      }
    }
    return this.ctx;
  }

  unlock() {
    this.ensureContext();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopBgm();
    }
  }

  setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  setBgmVolume(vol: number) {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
  }

  setFever(active: boolean) {
    this.isFeverMode = active;
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    gainVal: number,
    delay = 0,
    channel: 'sfx' | 'bgm' = 'sfx'
  ) {
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running') return;
    const chVol = channel === 'bgm' ? this.bgmVolume : this.sfxVolume;
    const scaledGain = gainVal * chVol;
    if (scaledGain <= 0.001) return;

    try {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(40, freq), now);
      if (endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
      }
      gain.gain.setValueAtTime(scaledGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safely ignore Web Audio errors on suspended/interrupted iframe contexts
    }
  }

  // Walking noir jazz bassline + vibraphone lead loop
  startBgm() {
    if (this.muted || this.bgmTimer !== null) return;
    this.bgmStep = 0;

    // Moody A minor walking noir progression (Am - Dm - F7 - E7)
    const bassNotes = [
      110.0, 130.81, 146.83, 164.81, // Am walk
      146.83, 164.81, 174.61, 146.83, // Dm walk
      174.61, 164.81, 146.83, 130.81, // F7 descent
      164.81, 196.0, 155.56, 123.47, // E7 turnaround
    ];
    const leadNotes = [
      440, 0, 523.25, 0,
      587.33, 0, 523.25, 493.88,
      440, 0, 392.0, 0,
      329.63, 415.3, 493.88, 0,
    ];

    this.bgmTimer = window.setInterval(() => {
      if (this.muted || this.bgmVolume <= 0.01) return;
      const ctx = this.ensureContext();
      if (!ctx || ctx.state !== 'running') return;

      const idx = this.bgmStep % bassNotes.length;
      const feverMult = this.isFeverMode ? 1.122 : 1; // +2 semitones during Turf War Frenzy
      const bass = bassNotes[idx] * feverMult;
      const lead = leadNotes[idx] * feverMult;

      // Plucky upright noir bass
      this.playTone(bass, bass * 0.96, 0.19, 'triangle', 0.055, 0, 'bgm');
      // Moody smoky sax / vibes melody
      if (lead > 0) {
        this.playTone(lead, lead * 0.99, 0.16, 'sine', 0.036, 0.02, 'bgm');
      }
      // Subtle brush snare click on 2 and 4
      if (idx % 4 === 2) {
        this.playTone(900, 320, 0.035, 'square', 0.01, 0, 'bgm');
      }

      this.bgmStep++;
    }, 240);
  }

  stopBgm() {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  playAttack(job: JobId, isCrit: boolean) {
    const now = performance.now();
    if (now - this.lastAttackSoundAt < 70) return;
    this.lastAttackSoundAt = now;

    if (job === 'warrior') {
      // Heavy knuckle / bat thud
      this.playTone(isCrit ? 220 : 170, 58, 0.09, 'sawtooth', isCrit ? 0.09 : 0.06);
    } else if (job === 'magician') {
      // Molotov glass whoosh / pop
      this.playTone(620, 210, 0.1, 'triangle', 0.06);
    } else if (job === 'bowman') {
      // Punchy silenced pistol / Tommy gun pop
      this.playTone(isCrit ? 860 : 680, 140, 0.055, 'square', 0.055);
    } else {
      // Sharp blade slash / derringer snap
      this.playTone(isCrit ? 1150 : 920, 320, 0.05, 'triangle', 0.055);
    }
  }

  playSkill(job: JobId) {
    if (job === 'warrior') {
      // Heavy bat / gavel slam
      this.playTone(190, 52, 0.18, 'sawtooth', 0.1);
      this.playTone(280, 95, 0.15, 'square', 0.06, 0.04);
    } else if (job === 'magician') {
      // Firebomb detonation
      this.playTone(460, 90, 0.22, 'sawtooth', 0.08);
      this.playTone(720, 180, 0.16, 'triangle', 0.06, 0.05);
    } else if (job === 'bowman') {
      // Rapid Tommy gun burst
      this.playTone(740, 180, 0.05, 'square', 0.06, 0);
      this.playTone(780, 180, 0.05, 'square', 0.06, 0.055);
      this.playTone(820, 180, 0.05, 'square', 0.06, 0.11);
    } else {
      // Quad derringer / ambush flurry
      this.playTone(1050, 350, 0.06, 'sawtooth', 0.055, 0);
      this.playTone(1220, 380, 0.07, 'triangle', 0.06, 0.05);
    }
  }

  playCoin() {
    // Crisp cash register cha-ching!
    this.playTone(1318.5, 1318.5, 0.045, 'square', 0.04);
    this.playTone(1760, 1760, 0.08, 'triangle', 0.045, 0.045);
  }

  playLevelUp() {
    // Syndicate brass fanfare
    const notes = [440, 523.25, 659.25, 880];
    notes.forEach((f, idx) => {
      this.playTone(f, f, 0.16, 'triangle', 0.085, idx * 0.075);
    });
  }

  playBossHorn() {
    // Distant police siren sweep + bass hit!
    this.playTone(520, 860, 0.2, 'sawtooth', 0.075, 0);
    this.playTone(860, 480, 0.22, 'sawtooth', 0.07, 0.2);
  }

  playFeverStart() {
    // High-heat siren wail + brass chord
    this.playTone(587.33, 987.77, 0.16, 'sawtooth', 0.08, 0);
    this.playTone(987.77, 587.33, 0.16, 'sawtooth', 0.08, 0.16);
    this.playTone(880, 1174.66, 0.2, 'triangle', 0.08, 0.32);
  }

  playStarForceDrumroll() {
    // Vault dial ticks / lockpick clicks
    [0, 0.09, 0.18, 0.27, 0.35, 0.43, 0.51].forEach((d, idx) => {
      this.playTone(420 + idx * 55, 420 + idx * 55, 0.04, 'square', 0.045, d);
    });
  }

  playStarForceResult(success: boolean) {
    if (success) {
      this.playTone(587.33, 587.33, 0.1, 'triangle', 0.085, 0);
      this.playTone(739.99, 739.99, 0.1, 'triangle', 0.085, 0.08);
      this.playTone(1174.66, 1174.66, 0.24, 'square', 0.09, 0.16);
    } else {
      this.playTone(260, 130, 0.26, 'sawtooth', 0.085, 0);
    }
  }

  playGachaReveal(rarity: Rarity) {
    if (rarity === 'legendary' || rarity === 'unique') {
      [523, 659, 784, 1046].forEach((f, idx) => {
        this.playTone(f, f, 0.18, 'square', 0.07, idx * 0.06);
      });
    } else {
      this.playTone(620, 880, 0.12, 'triangle', 0.06);
    }
  }

  playQuestClaim() {
    this.playTone(659, 659, 0.08, 'triangle', 0.06, 0);
    this.playTone(987, 987, 0.14, 'triangle', 0.07, 0.07);
  }

  playClick() {
    this.playTone(460, 320, 0.035, 'triangle', 0.035);
  }
}

export const sfx = new SoundEngine();
