// DFarm Collection App — Production Hardware Audio & Beeper Driver
// Synthesizes distinct, crisp acoustic tones via Web Audio API for FAT and SNF milestones
// Zero external sound asset dependency; instant latency; hardware kiosk compliant

class BuzzerDriver {
  private audioCtx: AudioContext | null = null

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtxClass) return null
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtxClass()
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {
          // Autoplay policy may suspend until user gesture
        })
      }
      return this.audioCtx
    } catch {
      return null
    }
  }

  /**
   * Generates a smooth, pure-sine audio tone with gentle attack and decay envelope
   * to prevent speaker click/pop in kiosk amplifiers.
   */
  public playTone(frequency: number, durationMs: number, gainValue = 0.25): boolean {
    const ctx = this.getContext()
    if (!ctx) return false

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      const now = ctx.currentTime
      const durationSec = durationMs / 1000

      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, now)

      // Envelope: 10ms attack, smooth sustain, 30ms release
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01)
      gain.gain.setValueAtTime(gainValue, now + durationSec - 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + durationSec)
      return true
    } catch {
      return false
    }
  }

  /**
   * 1st BEEP — FAT Measurement Accepted
   * Frequency: 880 Hz (A5 musical pitch), duration 140ms
   */
  public playFatBeep(): boolean {
    return this.playTone(880, 140, 0.3)
  }

  /**
   * 2nd BEEP — SNF Measurement Accepted
   * Frequency: 1320 Hz (E6 musical pitch, clear fifth interval above FAT), duration 140ms
   */
  public playSnfBeep(): boolean {
    return this.playTone(1320, 140, 0.3)
  }

  /**
   * For combined analyzer frame packets where FAT and SNF arrive simultaneously:
   * Emits Beep 1 (880 Hz), pauses for an acoustic interval (180ms), then emits Beep 2 (1320 Hz)
   * guaranteeing the operator hears two clearly distinct beeps.
   */
  public async playCombinedQualityBeeps(delayMs = 180): Promise<void> {
    this.playFatBeep()
    await new Promise((r) => setTimeout(r, delayMs))
    this.playSnfBeep()
  }
}

export const buzzerDriver = new BuzzerDriver()
