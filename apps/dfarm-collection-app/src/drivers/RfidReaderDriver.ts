// DFarm Collection App — Production RFID Reader Driver
// Supports:
// 1. USB Keyboard-Wedge HID Reader (high-speed buffered keydown events < 50ms)
// 2. Web Serial RFID Reader (COM3 / /dev/ttyUSB0 @ 9600 baud, 8N1)
// Discards human typing and ensures strict single-card identification

export interface RfidScanEvent {
  cardUid: string
  source: 'KEYBOARD_WEDGE' | 'WEB_SERIAL'
  timestamp: string
}

export type RfidScanListener = (event: RfidScanEvent) => void

export class RfidReaderDriver {
  private listeners: Set<RfidScanListener> = new Set()
  private keyBuffer: string = ''
  private lastKeyTimestamp: number = 0
  private readonly maxInterCharMs: number = 60 // Hardware barcode/RFID wedges send chars < 50ms apart
  private isListeningKeyboard: boolean = false
  private serialPort: any = null
  private serialReader: any = null
  private isSerialReading: boolean = false

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this)
  }

  // 1. Keyboard-Wedge HID Listener
  public startKeyboardListener(): void {
    if (this.isListeningKeyboard || typeof window === 'undefined') return
    window.addEventListener('keydown', this.handleKeyDown, true)
    this.isListeningKeyboard = true
  }

  public stopKeyboardListener(): void {
    if (!this.isListeningKeyboard || typeof window === 'undefined') return
    window.removeEventListener('keydown', this.handleKeyDown, true)
    this.isListeningKeyboard = false
    this.keyBuffer = ''
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore input in input / textarea elements to allow normal operator typing unless rapid wedge burst
    const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase()
    const now = Date.now()
    const delta = now - this.lastKeyTimestamp
    this.lastKeyTimestamp = now

    if (e.key === 'Enter') {
      if (this.keyBuffer.length >= 4 && this.keyBuffer.length <= 32) {
        // Valid RFID card UID (typically 8, 10, or 14 hex/decimal digits)
        const scannedUid = this.keyBuffer.trim().toUpperCase()
        this.emitScan({
          cardUid: scannedUid,
          source: 'KEYBOARD_WEDGE',
          timestamp: new Date().toISOString(),
        })
        if (targetTag === 'input' || targetTag === 'textarea') {
          e.preventDefault()
          e.stopPropagation()
        }
      }
      this.keyBuffer = ''
      return
    }

    if (delta > this.maxInterCharMs && this.keyBuffer.length > 0) {
      // Keystrokes were too slow — this is manual human typing, discard buffer
      this.keyBuffer = ''
    }

    if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
      this.keyBuffer += e.key
    }
  }

  // 2. Web Serial RFID Reader
  public isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  public async connectSerial(baudRate = 9600): Promise<boolean> {
    if (!this.isWebSerialSupported()) {
      return false
    }

    try {
      this.serialPort = await (navigator as any).serial.requestPort()
      await this.serialPort.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' })
      this.startSerialReadLoop()
      return true
    } catch (err: any) {
      console.warn('[RfidReader] Serial connection error:', err.message)
      return false
    }
  }

  private async startSerialReadLoop(): Promise<void> {
    if (!this.serialPort || this.isSerialReading) return
    this.isSerialReading = true

    let serialBuffer = ''
    const textDecoder = new TextDecoderStream()
    const readableStreamClosed = this.serialPort.readable.pipeTo(textDecoder.writable)
    const reader = textDecoder.readable.getReader()
    this.serialReader = reader

    try {
      while (this.isSerialReading) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          serialBuffer += value
          const lines = serialBuffer.split(/[\r\n]+/)
          serialBuffer = lines.pop() || ''
          for (const line of lines) {
            const clean = line.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
            if (clean.length >= 4 && clean.length <= 32) {
              this.emitScan({
                cardUid: clean,
                source: 'WEB_SERIAL',
                timestamp: new Date().toISOString(),
              })
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[RfidReader] Serial read loop error:', err.message)
    } finally {
      reader.releaseLock()
      await readableStreamClosed.catch(() => {})
      this.isSerialReading = false
    }
  }

  public async disconnectSerial(): Promise<void> {
    this.isSerialReading = false
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
  }

  // 3. Subscription Management
  public onScan(listener: RfidScanListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emitScan(event: RfidScanEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[RfidReader] Listener error:', err)
      }
    }
  }
}

export const rfidReaderDriver = new RfidReaderDriver()
