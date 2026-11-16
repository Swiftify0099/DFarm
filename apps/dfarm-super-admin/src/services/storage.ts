const memoryStorage: Record<string, string> = {}

export const storage = {
  get<T>(key: string, defaultValue: T): T {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = window.localStorage.getItem(key)
        return item ? (JSON.parse(item) as T) : defaultValue
      }
      const memItem = memoryStorage[key]
      return memItem ? (JSON.parse(memItem) as T) : defaultValue
    } catch (e) {
      console.warn(`Error reading localStorage key "${key}":`, e)
      return defaultValue
    }
  },

  set<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value)
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, serialized)
      }
      memoryStorage[key] = serialized
    } catch (e) {
      console.warn(`Error writing to localStorage key "${key}":`, e)
    }
  },

  remove(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key)
      }
      delete memoryStorage[key]
    } catch (e) {
      console.warn(`Error removing localStorage key "${key}":`, e)
    }
  },

  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear()
      }
      for (const k of Object.keys(memoryStorage)) {
        delete memoryStorage[k]
      }
    } catch (e) {
      console.warn('Error clearing storage:', e)
    }
  },
}
