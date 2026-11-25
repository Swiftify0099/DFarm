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

// Enhanced In-Memory Mock for IndexedDB in Node/JSDOM environment
class MockIDBStore {
  private data: Map<string, any> = new Map()
  public indexNames = { contains: () => false }

  add(item: any) {
    const key = item.eventId || item.id || item.key
    this.data.set(key, item)
    const req: any = { onsuccess: null, onerror: null, result: key }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: key } })
    }, 0)
    return req
  }

  put(item: any) {
    const key = item.eventId || item.id || item.key
    this.data.set(key, item)
    const req: any = { onsuccess: null, onerror: null, result: key }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: key } })
    }, 0)
    return req
  }

  get(key: string) {
    const item = this.data.get(key)
    const req: any = { onsuccess: null, onerror: null, result: item }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: item } })
    }, 0)
    return req
  }

  count() {
    const count = this.data.size
    const req: any = { onsuccess: null, onerror: null, result: count }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: count } })
    }, 0)
    return req
  }

  getAll() {
    const list = Array.from(this.data.values())
    const req: any = { result: list, onsuccess: null, onerror: null }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: list } })
    }, 0)
    return req
  }

  delete(key: string) {
    this.data.delete(key)
    const req: any = { onsuccess: null, onerror: null, result: undefined }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: undefined } })
    }, 0)
    return req
  }

  clear() {
    this.data.clear()
    const req: any = { onsuccess: null, onerror: null, result: undefined }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: { result: undefined } })
    }, 0)
    return req
  }

  openCursor() {
    const items = Array.from(this.data.values())
    let index = 0
    const req: any = { onsuccess: null, onerror: null }
    const fireCursor = () => {
      if (index < items.length) {
        const item = items[index]
        const cursor = {
          value: item,
          continue: () => {
            index++
            fireCursor()
          },
          delete: () => {
            const key = item.eventId || item.id || item.key
            this.data.delete(key)
          },
        }
        if (req.onsuccess) req.onsuccess({ target: { result: cursor } })
      } else {
        if (req.onsuccess) req.onsuccess({ target: { result: null } })
      }
    }
    setTimeout(fireCursor, 0)
    return req
  }
}

const mockStores = new Map<string, MockIDBStore>()

const mockIDBDatabase = {
  objectStoreNames: {
    contains: (name: string) => true,
  },
  transaction: (storeNames: string | string[], mode?: string, options?: any) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    for (const name of names) {
      if (!mockStores.has(name)) {
        mockStores.set(name, new MockIDBStore())
      }
    }
    let aborted = false
    const txObj: any = {
      oncomplete: null,
      onerror: null,
      onabort: null,
      error: null,
      abort: () => {
        aborted = true
        if (typeof txObj.onabort === 'function') {
          txObj.onabort({ target: txObj })
        }
      },
      objectStore: (name: string) => {
        if (!mockStores.has(name)) {
          mockStores.set(name, new MockIDBStore())
        }
        return mockStores.get(name)
      },
    }
    // Automatically trigger oncomplete after microtasks run if not aborted
    setTimeout(() => {
      if (!aborted && typeof txObj.oncomplete === 'function') {
        txObj.oncomplete({ target: txObj })
      }
    }, 10)
    return txObj
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
