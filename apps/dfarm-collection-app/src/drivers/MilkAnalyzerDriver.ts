// DFarm Collection App — Production Ultrasonic Milk Analyzer Driver
// Web Serial API interface for Milk Analyzers (Master Classic / MilkoTester / Lactoscan)
// Protocols supported:
// 1. Key-value ASCII stream: "FAT=04.20 SNF=08.70 CLR=29.50 TEMP=24.5\r\n"
// 2. Compact flag format: "F04.20 S08.70 C29.50 T24.5\r\n"
// 3. Delimited format: "FAT: 4.20, SNF: 8.70, CLR: 29.50\r\n"

export interface AnalyzerReading {
  fat: number
  snf: number
  clrDensity: number
  temperatureCelsius?: number
  addedWaterPercentage?: number
  isBiologicallyValid: boolean
  validationErrors: string[]
  rawFrame: string
  timestamp: string
}

export type AnalyzerReadingListener = (reading: AnalyzerReading) => void
export type AnalyzerStatusListener = (status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR', message?: string) => void

export class MilkAnalyzerDriver {
  private serialPort: any = null
  private serialReader: any = null
  private isReading: boolean = false
  private readingListeners: Set<AnalyzerReadingListener> = new Set()
  private statusListeners: Set<AnalyzerStatusListener> = new Set()
  private lastReading: AnalyzerReading | null = null

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  public getLastReading(): AnalyzerReading | null {
    return this.lastReading
  }

  public clearLastReading(): void {
    this.lastReading = null
  }

  public async connect(baudRate = 19200): Promise<boolean> {
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
      this.emitStatus('ERROR', err.message || 'Failed to open serial port for milk analyzer')
      return false
    }
  }

  public parseFrame(rawLine: string): AnalyzerReading | null {
    const trimmed = rawLine.trim()
    if (!trimmed) return null

    let fatVal = -1
    let snfVal = -1
    let clrVal = -1
    let tempVal = 25.0
    let waterVal = 0.0

    // Format 1: FAT=04.20 SNF=08.70 CLR=29.50 TEMP=24.5
    const fatMatch1 = trimmed.match(/FAT\s*[:=]\s*([+-]?\d+\.?\d*)/i)
    const snfMatch1 = trimmed.match(/SNF\s*[:=]\s*([+-]?\d+\.?\d*)/i)
    const clrMatch1 = trimmed.match(/CLR\s*[:=]\s*([+-]?\d+\.?\d*)/i)
    const tempMatch1 = trimmed.match(/TEMP\s*[:=]\s*([+-]?\d+\.?\d*)/i)
    const waterMatch1 = trimmed.match(/(?:WATER|H2O)\s*[:=]\s*([+-]?\d+\.?\d*)/i)

    if (fatMatch1) fatVal = parseFloat(fatMatch1[1])
    if (snfMatch1) snfVal = parseFloat(snfMatch1[1])
    if (clrMatch1) clrVal = parseFloat(clrMatch1[1])
    if (tempMatch1) tempVal = parseFloat(tempMatch1[1])
    if (waterMatch1) waterVal = parseFloat(waterMatch1[1])

    // Format 2: Compact letters F04.20 S08.70 C29.50 T24.5
    if (fatVal < 0 || snfVal < 0) {
      const fatMatch2 = trimmed.match(/\bF([+-]?\d+\.?\d*)/i)
      const snfMatch2 = trimmed.match(/\bS([+-]?\d+\.?\d*)/i)
      const clrMatch2 = trimmed.match(/\bC([+-]?\d+\.?\d*)/i)
      const tempMatch2 = trimmed.match(/\bT([+-]?\d+\.?\d*)/i)

      if (fatMatch2) fatVal = parseFloat(fatMatch2[1])
      if (snfMatch2) snfVal = parseFloat(snfMatch2[1])
      if (clrMatch2) clrVal = parseFloat(clrMatch2[1])
      if (tempMatch2) tempVal = parseFloat(tempMatch2[1])
    }

    if (fatVal < 0 && snfVal < 0) {
      return null
    }

    // Default CLR density estimation from Fat & SNF if missing: CLR ≈ (SNF - 0.2*Fat) * 4
    if (clrVal < 0 && fatVal >= 0 && snfVal >= 0) {
      clrVal = Number(((snfVal - 0.2 * fatVal) * 4).toFixed(1))
    }

    const validationErrors: string[] = []
    if (fatVal < 2.0 || fatVal > 15.0) {
      validationErrors.push(`FAT percentage (${fatVal}%) is out of biological bounds [2.0% - 15.0%]`)
    }
    if (snfVal < 6.0 || snfVal > 12.0) {
      validationErrors.push(`SNF percentage (${snfVal}%) is out of biological bounds [6.0% - 12.0%]`)
    }
    if (clrVal < 20.0 || clrVal > 36.0) {
      validationErrors.push(`CLR density (${clrVal}) is outside expected milk density [20.0 - 36.0]`)
    }

    return {
      fat: fatVal,
      snf: snfVal,
      clrDensity: clrVal,
      temperatureCelsius: tempVal,
      addedWaterPercentage: waterVal,
      isBiologicallyValid: validationErrors.length === 0,
      validationErrors,
      rawFrame: trimmed,
      timestamp: new Date().toISOString(),
    }
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
      this.emitStatus('ERROR', err.message || 'Error reading milk analyzer serial stream')
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

  public onReading(listener: AnalyzerReadingListener): () => void {
    this.readingListeners.add(listener)
    return () => {
      this.readingListeners.delete(listener)
    }
  }

  public onStatus(listener: AnalyzerStatusListener): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private emitReading(reading: AnalyzerReading): void {
    for (const listener of this.readingListeners) {
      try {
        listener(reading)
      } catch (err) {
        console.error('[MilkAnalyzerDriver] Listener error:', err)
      }
    }
  }

  private emitStatus(status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR', message?: string): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status, message)
      } catch (err) {
        console.error('[MilkAnalyzerDriver] Status listener error:', err)
      }
    }
  }
}

export const milkAnalyzerDriver = new MilkAnalyzerDriver()
