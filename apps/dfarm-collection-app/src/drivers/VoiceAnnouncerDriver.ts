// DFarm Collection App — Voice Announcer Driver
// Interfaces with browser Web Speech API with frame-debounce protection

class VoiceAnnouncerDriver {
  private lastSpokenText: string = ''
  private lastSpokenTimestamp: number = 0
  private debounceWindowMs: number = 8000 // 8 second lockout for identical name

  public speakCustomerIdentified(customerName: string): boolean {
    if (!('speechSynthesis' in window)) {
      return false
    }

    const now = Date.now()
    if (this.lastSpokenText === customerName && now - this.lastSpokenTimestamp < this.debounceWindowMs) {
      // Debounced to prevent continuous speech on steady camera frames
      return false
    }

    try {
      window.speechSynthesis.cancel() // Cancel any ongoing announcement
      const utterance = new SpeechSynthesisUtterance(`${customerName}`)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.lang = 'en-IN'

      window.speechSynthesis.speak(utterance)
      this.lastSpokenText = customerName
      this.lastSpokenTimestamp = now
      return true
    } catch {
      return false
    }
  }

  public resetAnnouncer() {
    this.lastSpokenText = ''
    this.lastSpokenTimestamp = 0
  }
}

export const voiceAnnouncer = new VoiceAnnouncerDriver()
