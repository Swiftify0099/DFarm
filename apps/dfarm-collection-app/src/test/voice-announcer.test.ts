import { describe, it, expect, beforeEach, vi } from 'vitest'
import { voiceAnnouncer } from '../drivers/VoiceAnnouncerDriver'

describe('Voice Announcer Driver & Frame Debounce', () => {
  beforeEach(() => {
    voiceAnnouncer.resetAnnouncer()
  })

  it('speaks identified customer name on initial match', () => {
    const result = voiceAnnouncer.speakCustomerIdentified('Pandurang Mahadev Patil')
    expect(result).toBe(true)
  })

  it('debounces subsequent calls with the same customer name within 8-second window', () => {
    const firstCall = voiceAnnouncer.speakCustomerIdentified('Pandurang Mahadev Patil')
    expect(firstCall).toBe(true)

    // Immediate repeat from steady camera frame (e.g. 50ms later)
    const secondCall = voiceAnnouncer.speakCustomerIdentified('Pandurang Mahadev Patil')
    expect(secondCall).toBe(false)
  })

  it('speaks immediately if a new customer is identified', () => {
    const firstCall = voiceAnnouncer.speakCustomerIdentified('Pandurang Mahadev Patil')
    expect(firstCall).toBe(true)

    // New patron steps in front of camera
    const secondCall = voiceAnnouncer.speakCustomerIdentified('Sunita Tukaram Shinde')
    expect(secondCall).toBe(true)
  })

  it('resets debounce lock when resetAnnouncer() is invoked', () => {
    voiceAnnouncer.speakCustomerIdentified('Pandurang Mahadev Patil')
    voiceAnnouncer.resetAnnouncer()

    const retry = voiceAnnouncer.speakCustomerIdentified('Pandurang Mahadev Patil')
    expect(retry).toBe(true)
  })
})
