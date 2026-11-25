/**
 * DFarm PWA Service — Lifecycle, Registration, and Non-Disruptive Updates
 *
 * Guarantees:
 * - Only registers in supported, secure contexts (HTTPS or localhost).
 * - Detects background worker updates without auto-reloading mid-collection.
 * - Dispatches 'dfarm:pwa-update-available' when a new app shell is ready.
 * - Allows operator to apply updates safely when terminal is idle.
 */

export interface PwaUpdateInfo {
  isUpdateAvailable: boolean
  registration: ServiceWorkerRegistration | null
}

type PwaUpdateListener = (info: PwaUpdateInfo) => void

class PwaManager {
  private registration: ServiceWorkerRegistration | null = null
  private isUpdateAvailable = false
  private listeners: Set<PwaUpdateListener> = new Set()
  private isRefreshing = false

  public init(): void {
    if (typeof window === 'undefined') return

    // Register only in supported secure environments
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]'

    if (!('serviceWorker' in navigator) || (!window.isSecureContext && !isLocalhost)) {
      console.info('[PWA] Service Worker registration skipped: insecure context or unsupported browser.')
      return
    }

    // Register after initial page load to avoid competing for critical startup bandwidth
    if (document.readyState === 'complete') {
      this.register()
    } else {
      window.addEventListener('load', () => this.register())
    }

    // Listen for new controller taking over
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.isRefreshing) return
      this.isRefreshing = true
      console.info('[PWA] New Service Worker active; reloading application shell.')
      window.location.reload()
    })
  }

  private async register(): Promise<void> {
    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      console.info('[PWA] Service Worker registered with scope:', this.registration.scope)

      // 1. Check if an updated worker is already waiting
      if (this.registration.waiting) {
        this.notifyUpdateAvailable()
      }

      // 2. Listen for new worker installations
      this.registration.addEventListener('updatefound', () => {
        const installingWorker = this.registration?.installing
        if (!installingWorker) return

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // Existing controller exists -> this is an update!
              this.notifyUpdateAvailable()
            } else {
              // First install: App shell is now cached for offline use
              console.info('[PWA] DFarm Collection App shell cached for offline availability.')
            }
          }
        })
      })
    } catch (err: any) {
      console.warn('[PWA] Service Worker registration failed:', err?.message || err)
    }
  }

  private notifyUpdateAvailable(): void {
    this.isUpdateAvailable = true
    const info: PwaUpdateInfo = {
      isUpdateAvailable: true,
      registration: this.registration,
    }

    // Dispatch DOM event for decoupled subscribers
    window.dispatchEvent(new CustomEvent('dfarm:pwa-update-available', { detail: info }))

    // Notify registered listeners
    this.listeners.forEach((listener) => {
      try {
        listener(info)
      } catch (err) {
        console.error('[PWA] Update listener error:', err)
      }
    })
  }

  public subscribe(listener: PwaUpdateListener): () => void {
    this.listeners.add(listener)
    // Immediately emit current state
    listener({
      isUpdateAvailable: this.isUpdateAvailable,
      registration: this.registration,
    })
    return () => this.listeners.delete(listener)
  }

  /**
   * Applies the pending update safely.
   * Can accept a safety-check predicate (e.g. confirming no intake transaction is active).
   */
  public async applyUpdate(canSafelyReload?: () => boolean): Promise<boolean> {
    if (canSafelyReload && !canSafelyReload()) {
      console.warn('[PWA] Update postponed: active transaction in progress.')
      return false
    }

    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      return true
    }

    // If no waiting worker, reload directly
    window.location.reload()
    return true
  }

  public getStatus(): PwaUpdateInfo {
    return {
      isUpdateAvailable: this.isUpdateAvailable,
      registration: this.registration,
    }
  }
}

export const pwaService = new PwaManager()
