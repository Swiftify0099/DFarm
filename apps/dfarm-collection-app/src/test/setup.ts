import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock SpeechSynthesis for Web Speech API Driver testing
const mockSpeak = vi.fn()
const mockCancel = vi.fn()

Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: mockSpeak,
    cancel: mockCancel,
    paused: false,
    pending: false,
    speaking: false,
  },
  writable: true,
})

// Mock SpeechSynthesisUtterance
globalThis.SpeechSynthesisUtterance = class {
  text: string
  lang: string = 'en-IN'
  rate: number = 1.0
  pitch: number = 1.0
  constructor(text: string) {
    this.text = text
  }
} as any

// Simple In-Memory Mock for IndexedDB in Node/JSDOM environment
class MockIDBStore {
  private data: Map<string, any> = new Map()

  add(item: any) {
    const key = item.eventId || item.id
    this.data.set(key, item)
    const req: any = { onsuccess: null, onerror: null }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: key } })
    }, 0)
    return req
  }

  put(item: any) {
    const key = item.eventId || item.id
    this.data.set(key, item)
    const req: any = { onsuccess: null, onerror: null }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: key } })
    }, 0)
    return req
  }

  getAll() {
    const req: any = { result: Array.from(this.data.values()), onsuccess: null, onerror: null }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: req.result } })
    }, 0)
    return req
  }

  delete(key: string) {
    this.data.delete(key)
    const req: any = { onsuccess: null, onerror: null }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: undefined } })
    }, 0)
    return req
  }
}

const mockStores = new Map<string, MockIDBStore>()

const mockIDBDatabase = {
  objectStoreNames: {
    contains: (name: string) => true,
  },
  transaction: (storeName: string) => {
    if (!mockStores.has(storeName)) {
      mockStores.set(storeName, new MockIDBStore())
    }
    return {
      objectStore: () => mockStores.get(storeName),
    }
  },
}

Object.defineProperty(window, 'indexedDB', {
  value: {
    open: () => {
      const req: any = {
        result: mockIDBDatabase,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      }
      setTimeout(() => {
        if (req.onsuccess) req.onsuccess({ target: req })
      }, 0)
      return req
    },
    deleteDatabase: vi.fn(),
  },
  writable: true,
})
