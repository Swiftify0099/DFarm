// DFarm Collection App — Automatic Network State Manager
// Accurately distinguishes browser connectivity, backend reachability, auth validity, and device status.
//
// States:
// 1. BROWSER_OFFLINE: navigator.onLine === false
// 2. BACKEND_UNREACHABLE: browser online, but backend HTTP/DNS fails or times out
// 3. ONLINE: backend reachable and operational
// 4. AUTH_EXPIRED: HTTP 401 received; operator reauthentication required
// 5. DEVICE_BLOCKED: HTTP 403 received with DEVICE_BLOCKED; station revoked

import type { NetworkStatus } from '@/types'
import { getApiBaseUrl, getStoredOperatorAuth } from '@/api/client'

export type NetworkChangeListener = (status: NetworkStatus) => void
export type NetworkRestoredListener = () => void

export class NetworkStateManager {
  private status: NetworkStatus = 'ONLINE'
  private lastCheckedAt: number = 0
  private isChecking: boolean = false
  private statusListeners: Set<NetworkChangeListener> = new Set()
  private restoredListeners: Set<NetworkRestoredListener> = new Set()
  private debounceTimer: any = null
  private minCheckIntervalMs: number = 10000 // Throttle frequent checks to protect kiosk network
  private pingTimeoutMs: number = 5000

  constructor() {
    if (typeof window !== 'undefined') {
      this.status = typeof navigator !== 'undefined' && !navigator.onLine ? 'BROWSER_OFFLINE' : 'ONLINE'
    }
  }

  public init(): void {
    if (typeof window === 'undefined') return

    // 1. Browser Connectivity Events
    window.addEventListener('online', () => this.handleConnectivityEvent('online'))
    window.addEventListener('offline', () => this.handleConnectivityEvent('offline'))

    // 2. Window Focus & Visibility Change Events
    window.addEventListener('focus', () => this.handleVisibilityEvent('focus'))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.handleVisibilityEvent('visible')
      }
    })

    // Initial check without blocking UI
    setTimeout(() => {
      this.checkReachability(true).catch(() => {})
    }, 100)
  }

  public getStatus(): NetworkStatus {
    return this.status
  }

  public isOnline(): boolean {
    return this.status === 'ONLINE'
  }

  public isBrowserOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  }

  public subscribeStatus(listener: NetworkChangeListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  public subscribeRestored(listener: NetworkRestoredListener): () => void {
    this.restoredListeners.add(listener)
    return () => this.restoredListeners.delete(listener)
  }

  public destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.statusListeners.clear()
    this.restoredListeners.clear()
  }

  public setStatus(newStatus: NetworkStatus): void {
    const previous = this.status
    this.status = newStatus

    if (previous !== newStatus) {
      console.info(`[NetworkManager] State changed: ${previous} -> ${newStatus}`)
      this.statusListeners.forEach((listener) => {
        try {
          listener(newStatus)
        } catch (err) {
          console.warn('[NetworkManager] Error in status listener:', err)
        }
      })

      // When transitioning from an offline/unreachable state to ONLINE, trigger recovery
      if (
        newStatus === 'ONLINE' &&
        (previous === 'BROWSER_OFFLINE' || previous === 'BACKEND_UNREACHABLE')
      ) {
        console.info('[NetworkManager] Network connectivity restored. Triggering sync recovery listeners.')
        this.restoredListeners.forEach((listener) => {
          try {
            listener()
          } catch (err) {
            console.warn('[NetworkManager] Error in restored listener:', err)
          }
        })
      }
    }
  }

  /**
   * Manually reports a backend response status code from API operations
   * to immediately update network state without redundant ping requests.
   */
  public reportApiResult(statusCode: number, errorCode?: string | null): void {
    if (statusCode === 401) {
      this.setStatus('AUTH_EXPIRED')
    } else if (statusCode === 403 && errorCode === 'DEVICE_BLOCKED') {
      this.setStatus('DEVICE_BLOCKED')
    } else if (statusCode >= 500 && statusCode <= 504) {
      this.setStatus('BACKEND_UNREACHABLE')
    } else if (statusCode >= 200 && statusCode < 400) {
      if (this.status !== 'ONLINE') {
        this.setStatus('ONLINE')
      }
    }
  }

  /**
   * Probes backend health with a lightweight request.
   * Throttled by default to avoid excessive network overhead.
   */
  public async checkReachability(force: boolean = false): Promise<NetworkStatus> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('BROWSER_OFFLINE')
      return 'BROWSER_OFFLINE'
    }

    const now = Date.now()
    if (!force && this.isChecking) {
      return this.status
    }
    if (!force && now - this.lastCheckedAt < this.minCheckIntervalMs) {
      return this.status
    }

    this.isChecking = true
    this.lastCheckedAt = now

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this.pingTimeoutMs)
      : null

    try {
      const baseUrl = getApiBaseUrl()
      const { token, dairyId } = getStoredOperatorAuth()

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      }
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (dairyId) headers['X-Dairy-Tenant-Id'] = dairyId

      // Ping canonical health endpoint
      const response = await fetch(`${baseUrl}/health/live`, {
        method: 'GET',
        headers,
        signal: controller ? controller.signal : undefined,
      }).catch(async () => {
        return fetch(`${baseUrl}/auth/health`, {
          method: 'GET',
          headers,
          signal: controller ? controller.signal : undefined,
        }).catch(async () => {
          return fetch(`${baseUrl}/health`, {
            method: 'GET',
            headers,
            signal: controller ? controller.signal : undefined,
          })
        })
      })

      if (timeoutId) clearTimeout(timeoutId)

      if (response.status === 401) {
        this.setStatus('AUTH_EXPIRED')
        return 'AUTH_EXPIRED'
      }

      if (response.status === 403) {
        try {
          const body = await response.json()
          if (body.errorCode === 'DEVICE_BLOCKED' || body.error?.includes('BLOCKED')) {
            this.setStatus('DEVICE_BLOCKED')
            return 'DEVICE_BLOCKED'
          }
        } catch {}
      }

      if (response.ok || response.status === 404 || response.status === 400) {
        // Backend answered with valid HTTP
        this.setStatus('ONLINE')
        return 'ONLINE'
      }

      this.setStatus('BACKEND_UNREACHABLE')
      return 'BACKEND_UNREACHABLE'
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId)
      // Check if browser went offline during fetch
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.setStatus('BROWSER_OFFLINE')
        return 'BROWSER_OFFLINE'
      }

      this.setStatus('BACKEND_UNREACHABLE')
      return 'BACKEND_UNREACHABLE'
    } finally {
      this.isChecking = false
    }
  }

  private handleConnectivityEvent(type: 'online' | 'offline'): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    if (type === 'offline') {
      this.setStatus('BROWSER_OFFLINE')
      return
    }

    // Debounce network recovery to let interface route settle
    this.debounceTimer = setTimeout(() => {
      this.checkReachability(true).catch(() => {})
    }, 1500)
  }

  private handleVisibilityEvent(_source: string): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    this.debounceTimer = setTimeout(() => {
      this.checkReachability(false).catch(() => {})
    }, 1000)
  }
}

export const networkManager = new NetworkStateManager()
