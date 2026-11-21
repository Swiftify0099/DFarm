// DFarm Collection App — Production Digital Weighing Scale Driver
// Web Serial API interface for Industrial Dairy Platform Scales
// Protocols supported:
// 1. Continuous stream with Stability flag: "ST,GS,+0012.50,KG\r\n" (Essae / Phoenix / Avery)
// 2. Unstable indicator: "US,GS,+0012.35,KG\r\n"
// 3. Compact ASCII stream: "=0012.50(kg)\r\n"

export interface ScaleReading {
  weight: number
  unit: 'KG' | 'L'
  isStable: boolean
  isOverload: boolean
  rawFrame: string
  timestamp: string
}

export type ScaleReadingListener = (reading: ScaleReading) => void
export type ScaleStatusListener = (status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR', message?: string) => void

export class ScaleDriver {
  private serialPort: any = null
  private serialReader: any = null
  private isReading: boolean = false
  private readingListeners: Set<ScaleReadingListener> = new Set()
  private statusListeners: Set<ScaleStatusListener> = new Set()
  private lastReading: ScaleReading | null = null

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  public getLastReading(): ScaleReading | null {
    return this.lastReading
  }

  public async connect(baudRate = 4800): Promise<boolean> {
    if (!this.isSupported()) {
      this.emitStatus('ERROR', 'Web Serial API is not supported in this browser. Please use Chrome or Edge.')
      return false
    }

    try {
      this.serialPort = await (navigator as any).serial.requestPort()
      await this.serialPort.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 1024,
      })

      this.emitStatus('CONNECTED')
      this.startReadLoop()
      return true
    } catch (err: any) {
      this.emitStatus('ERROR', err.message || 'Failed to open serial port for weighing scale')
      return false
    }
  }

  public parseFrame(rawLine: string): ScaleReading | null {
    const trimmed = rawLine.trim()
    if (!trimmed) return null

    // Format 1: ST,GS,+0012.50,KG or US,GS,+0012.50,KG
    const matchStandard = trimmed.match(/^(ST|US|OL)\s*,\s*([A-Z0-9]+)\s*,\s*([+-]?\d+\.?\d*)\s*,\s*([A-Za-z]+)/i)
    if (matchStandard) {
      const statusFlag = matchStandard[1].toUpperCase()
      const weightVal = parseFloat(matchStandard[3])
      const unitVal = matchStandard[4].toUpperCase() === 'L' ? 'L' : 'KG'

      return {
        weight: isNaN(weightVal) ? 0 : Math.max(0, weightVal),
        unit: unitVal,
        isStable: statusFlag === 'ST',
        isOverload: statusFlag === 'OL',
        rawFrame: trimmed,
        timestamp: new Date().toISOString(),
      }
    }

    // Format 2: =0012.50(kg) or =0012.50(L)
    const matchCompact = trimmed.match(/^=\s*([+-]?\d+\.?\d*)\s*\(([A-Za-z]+)\)/)
    if (matchCompact) {
      const weightVal = parseFloat(matchCompact[1])
      const unitVal = matchCompact[2].toUpperCase() === 'L' ? 'L' : 'KG'

      return {
        weight: isNaN(weightVal) ? 0 : Math.max(0, weightVal),
        unit: unitVal,
        isStable: true, // Compact format is typically streamed when stable
        isOverload: false,
        rawFrame: trimmed,
        timestamp: new Date().toISOString(),
      }
    }

    // Format 3: Simple numerical line ending in kg or L: "12.50 kg" or "12.50kg ST"
    const matchSimple = trimmed.match(/^([+-]?\d+\.?\d*)\s*(kg|l|ltr)?(?:\s+(ST|US))?$/i)
    if (matchSimple) {
      const weightVal = parseFloat(matchSimple[1])
      const statusFlag = matchSimple[3]?.toUpperCase()

      return {
        weight: isNaN(weightVal) ? 0 : Math.max(0, weightVal),
        unit: 'KG',
        isStable: statusFlag !== 'US',
        isOverload: false,
        rawFrame: trimmed,
        timestamp: new Date().toISOString(),
      }
    }

    return null
  }

  private async startReadLoop(): Promise<void> {
    if (!this.serialPort || this.isReading) return
    this.isReading = true

    let buffer = ''
    const textDecoder = new TextDecoderStream()
    const readableStreamClosed = this.serialPort.readable.pipeTo(textDecoder.writable)
    const reader = textDecoder.readable.getReader()
    this.serialReader = reader

    try {
      while (this.isReading) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          buffer += value
          const lines = buffer.split(/[\r\n]+/)
          buffer = lines.pop() || ''

          for (const line of lines) {
            const reading = this.parseFrame(line)
            if (reading) {
              this.lastReading = reading
              this.emitReading(reading)
            }
          }
        }
      }
    } catch (err: any) {
      this.emitStatus('ERROR', err.message || 'Error reading scale serial stream')
    } finally {
      reader.releaseLock()
      await readableStreamClosed.catch(() => {})
      this.isReading = false
      this.emitStatus('DISCONNECTED')
    }
  }

  public async disconnect(): Promise<void> {
    this.isReading = false
    if (this.serialReader) {
      try {
        await this.serialReader.cancel()
      } catch {}
      this.serialReader = null
    }
    if (this.serialPort) {
      try {
        await this.serialPort.close()
      } catch {}
      this.serialPort = null
    }
    this.emitStatus('DISCONNECTED')
  }

  public onReading(listener: ScaleReadingListener): () => void {
    this.readingListeners.add(listener)
    return () => {
      this.readingListeners.delete(listener)
    }
  }

  public onStatus(listener: ScaleStatusListener): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private emitReading(reading: ScaleReading): void {
    for (const listener of this.readingListeners) {
      try {
        listener(reading)
      } catch (err) {
        console.error('[ScaleDriver] Listener error:', err)
      }
    }
  }

  private emitStatus(status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR', message?: string): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status, message)
      } catch (err) {
        console.error('[ScaleDriver] Status listener error:', err)
      }
    }
  }
}

export const scaleDriver = new ScaleDriver()
