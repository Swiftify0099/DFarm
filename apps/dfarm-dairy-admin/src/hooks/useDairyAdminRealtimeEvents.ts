import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getStoredAuth, getApiBaseUrl } from '@/api/client'

export type RealtimeConnectionState = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'

export interface RealtimeEventPayload {
  eventId: string
  eventType: string
  schemaVersion: number
  organizationId: string
  centerId?: string | null
  entityId: string
  aggregateVersion: number
  occurredAt: string
  publishedAt: string
  payload: Record<string, any>
}

export interface UseDairyAdminRealtimeOptions {
  centerId?: string | null
  enabled?: boolean
  onEvent?: (event: RealtimeEventPayload) => void
}

export function useDairyAdminRealtimeEvents(options: UseDairyAdminRealtimeOptions = {}) {
  const { centerId, enabled = true, onEvent } = options
  const queryClient = useQueryClient()

  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('DISCONNECTED')
  const [lastEvent, setLastEvent] = useState<RealtimeEventPayload | null>(null)
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null)
  const [reconnectCount, setReconnectCount] = useState<number>(0)

  const eventSourceRef = useRef<EventSource | null>(null)
  const lastEventIdRef = useRef<string | null>(null)
  const fallbackPollingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isCancelledRef = useRef<boolean>(false)

  // Consumer-side deduplication set to guarantee harmless at-least-once delivery
  const processedEventIdsRef = useRef<Set<string>>(new Set())

  const invalidateAuthoritativeData = useCallback(
    (eventType: string) => {
      // Prompt 6: Primary Financial Authority is PostgreSQL.
      // Received events invalidate queries to fetch authoritative, reconciled snapshots.
      if (
        eventType === 'COLLECTION_ACCEPTED' ||
        eventType === 'COLLECTION_SYNCED' ||
        eventType === 'COLLECTION_REJECTED' ||
        eventType === 'COLLECTION_MANUAL_REVIEW'
      ) {
        queryClient.invalidateQueries({ queryKey: ['dairyAdminMetrics'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminCentersMetrics'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminCollectionsFeed'] })
      } else if (eventType === 'SESSION_OPENED' || eventType === 'SESSION_CLOSED') {
        queryClient.invalidateQueries({ queryKey: ['dairyAdminMetrics'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminCentersMetrics'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminSessions'] })
      } else if (
        eventType === 'STATION_HEARTBEAT' ||
        eventType === 'STATION_STATUS_CHANGED' ||
        eventType === 'DEVICE_BLOCKED' ||
        eventType === 'DEVICE_REVOKED'
      ) {
        queryClient.invalidateQueries({ queryKey: ['dairyAdminMetrics'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminCentersMetrics'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminStations'] })
      } else if (eventType === 'RESYNC_REQUIRED') {
        queryClient.invalidateQueries({ queryKey: ['dairyAdminMetrics'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminCentersMetrics'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminCollectionsFeed'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminSessions'] })
        queryClient.invalidateQueries({ queryKey: ['dairyAdminStations'] })
      }
    },
    [queryClient]
  )

  useEffect(() => {
    isCancelledRef.current = false

    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setConnectionState('DISCONNECTED')
      return
    }

    const { token, dairyId } = getStoredAuth()
    if (!token || !dairyId) {
      setConnectionState('DISCONNECTED')
      return
    }

    let retryDelay = 2000

    const connectSse = async () => {
      if (isCancelledRef.current) return

      setConnectionState('CONNECTING')

      const baseUrl = getApiBaseUrl()

      try {
        // Step 1: Request short-lived, purpose-specific SSE ticket via authenticated POST
        // Long-lived access tokens are NEVER exposed in the EventSource URL
        const ticketRes = await fetch(`${baseUrl}/dairy-admin/events/ticket`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Dairy-Tenant-Id': dairyId,
          },
        })

        if (!ticketRes.ok) {
          throw new Error(`Failed to acquire SSE ticket: ${ticketRes.status}`)
        }

        const ticketData = await ticketRes.json()
        if (!ticketData.success || !ticketData.ticket) {
          throw new Error('Invalid ticket response from server')
        }

        if (isCancelledRef.current) return

        // Step 2: Construct authenticated EventSource URL using purpose-specific ticket
        const url = new URL(`${baseUrl}/dairy-admin/events`)
        url.searchParams.set('ticket', ticketData.ticket)
        url.searchParams.set('organizationId', dairyId)
        if (centerId && centerId !== 'ALL') {
          url.searchParams.set('centerId', centerId)
        }
        if (lastEventIdRef.current) {
          url.searchParams.set('lastEventId', lastEventIdRef.current)
        }

        const es = new EventSource(url.toString(), { withCredentials: true })
        eventSourceRef.current = es

        es.onopen = () => {
          if (isCancelledRef.current) {
            es.close()
            return
          }
          setConnectionState('CONNECTED')
          retryDelay = 2000 // reset backoff on successful connect
        }

        es.onerror = () => {
          if (isCancelledRef.current) return
          setConnectionState('ERROR')
          setReconnectCount((prev) => prev + 1)

          // Close stale EventSource and schedule ticket-based reconnect with backoff
          es.close()
          eventSourceRef.current = null

          const nextDelay = Math.min(15000, retryDelay)
          retryDelay = Math.min(15000, retryDelay * 1.5)

          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isCancelledRef.current) {
              connectSse()
            }
          }, nextDelay)
        }

        // Handshake
        es.addEventListener('CONNECTED', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data)
            setConnectionState('CONNECTED')
            if (data.eventId) {
              lastEventIdRef.current = data.eventId
            }
          } catch {
            // Handshake parse error ignored
          }
        })

        // Historical cursor gap recovery / server re-sync signal
        es.addEventListener('RESYNC_REQUIRED', () => {
          invalidateAuthoritativeData('RESYNC_REQUIRED')
        })

        // Standard Business Events with Consumer-side Deduplication
        const registeredEventTypes = [
          'COLLECTION_ACCEPTED',
          'COLLECTION_SYNCED',
          'COLLECTION_REJECTED',
          'COLLECTION_MANUAL_REVIEW',
          'SESSION_OPENED',
          'SESSION_CLOSED',
          'STATION_HEARTBEAT',
          'STATION_STATUS_CHANGED',
          'DEVICE_BLOCKED',
          'DEVICE_REVOKED',
        ]

        registeredEventTypes.forEach((eventType) => {
          es.addEventListener(eventType, (e: MessageEvent) => {
            try {
              const eventData: RealtimeEventPayload = JSON.parse(e.data)
              const stableEventId = e.lastEventId || eventData.eventId

              if (stableEventId) {
                lastEventIdRef.current = stableEventId

                // Consumer-side deduplication: ignore duplicate network deliveries
                if (processedEventIdsRef.current.has(stableEventId)) {
                  return
                }
                processedEventIdsRef.current.add(stableEventId)
                if (processedEventIdsRef.current.size > 500) {
                  const oldest = processedEventIdsRef.current.values().next().value
                  if (oldest) processedEventIdsRef.current.delete(oldest)
                }
              }

              setLastEvent(eventData)
              setLastEventTime(new Date())

              // Invalidate authoritative server queries to fetch real PostgreSQL aggregates
              invalidateAuthoritativeData(eventType)

              if (onEvent) {
                onEvent(eventData)
              }
            } catch {
              // JSON parse error
            }
          })
        })
      } catch {
        if (!isCancelledRef.current) {
          setConnectionState('ERROR')
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isCancelledRef.current) connectSse()
          }, 5000)
        }
      }
    }

    connectSse()

    return () => {
      isCancelledRef.current = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [enabled, centerId, invalidateAuthoritativeData, onEvent])

  // Resilient fallback polling when disconnected or on error
  useEffect(() => {
    if (connectionState === 'DISCONNECTED' || connectionState === 'ERROR') {
      fallbackPollingTimerRef.current = setInterval(() => {
        invalidateAuthoritativeData('RESYNC_REQUIRED')
      }, 15000)
    } else {
      if (fallbackPollingTimerRef.current) {
        clearInterval(fallbackPollingTimerRef.current)
        fallbackPollingTimerRef.current = null
      }
    }

    return () => {
      if (fallbackPollingTimerRef.current) {
        clearInterval(fallbackPollingTimerRef.current)
        fallbackPollingTimerRef.current = null
      }
    }
  }, [connectionState, invalidateAuthoritativeData])

  return {
    connectionState,
    isLive: connectionState === 'CONNECTED',
    lastEvent,
    lastEventTime,
    reconnectCount,
    lastEventId: lastEventIdRef.current,
  }
}
