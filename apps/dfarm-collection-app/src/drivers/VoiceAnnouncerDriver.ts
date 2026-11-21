// DFarm Collection App — Production Voice Announcer Driver
// Interfaces with browser Web Speech API with strict single-announcement attempt locking

class VoiceAnnouncerDriver {
  private lastSpokenText: string = ''
  private lastSpokenTimestamp: number = 0
  private debounceWindowMs: number = 8000 // 8 second lockout for identical name
  private announcedAttemptIds: Set<string> = new Set()

  public speakCustomerIdentified(customerName: string, attemptId?: string): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return false
    }

    // 1. Attempt ID idempotency: exactly one announcement per collection attempt
    if (attemptId) {
      if (this.announcedAttemptIds.has(attemptId)) {
        return false
      }
      this.announcedAttemptIds.add(attemptId)
    }

    const now = Date.now()
    if (this.lastSpokenText === customerName && now - this.lastSpokenTimestamp < this.debounceWindowMs && !attemptId) {
      // Debounced to prevent continuous speech on steady camera frames without attempt ID
      return false
    }

    try {
      window.speechSynthesis.cancel() // Cancel any ongoing announcement
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }

      const announcementPhrase = `Customer ${customerName}. Milk collection starting.`
      const utterance = new SpeechSynthesisUtterance(announcementPhrase)
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
    this.announcedAttemptIds.clear()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // ignore
      }
    }
  }
}

export const voiceAnnouncer = new VoiceAnnouncerDriver()
