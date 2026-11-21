// DFarm Collection App — Production Thermal Receipt Printer Driver
// Supports:
// 1. ESC/POS binary command stream for direct 58mm/80mm thermal receipt printers (Web Serial / WebUSB)
// 2. High-precision browser thermal ticket voucher printing (58mm / 80mm roll media)
// Enforces:
// - Generation strictly from accepted collection transaction
// - Clear distinction of pending offline receipts ("*** PENDING OFFLINE COPY ***")
// - Idempotent reprinting without creating duplicate transactions

import type { CollectionTransaction } from '@/types'

export interface ReceiptPrintOptions {
  paperWidthMm?: 58 | 80
  dairyName?: string
  centerName?: string
  operatorName?: string
  isReprint?: boolean
}

export class ThermalPrinterDriver {
  private serialPort: any = null

  public isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  // 1. ESC/POS Command Byte Generator
  public buildEscPosPayload(txn: CollectionTransaction, options: ReceiptPrintOptions = {}): Uint8Array {
    const is80mm = options.paperWidthMm === 80
    const colWidth = is80mm ? 48 : 32
    const lineSep = '-'.repeat(colWidth)
    const dairy = (options.dairyName || 'DFARM DAIRY COOPERATIVE').toUpperCase()
    const center = (options.centerName || 'COLLECTION CENTER').toUpperCase()
    const isOffline = txn.syncStatus === 'PENDING_OFFLINE'
    const isReprint = options.isReprint === true

    const encoder = new TextEncoder()
    const bytes: number[] = []

    const append = (arr: number[] | Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        bytes.push(arr[i])
      }
    }

    const appendText = (text: string) => {
      append(encoder.encode(text))
    }

    // ESC @: Initialize printer
    append([0x1b, 0x40])

    // ESC a 1: Center alignment
    append([0x1b, 0x61, 0x01])

    // ESC ! 0x30: Double height + double width for header
    append([0x1b, 0x21, 0x30])
    appendText(`${dairy}\n`)

    // ESC ! 0x00: Normal font
    append([0x1b, 0x21, 0x00])
    appendText(`${center}\n`)
    appendText(`MILK COLLECTION RECEIPT\n`)
    if (isOffline) {
      appendText(`*** PENDING OFFLINE COPY ***\n`)
    }
    if (isReprint) {
      appendText(`*** DUPLICATE REPRINT ***\n`)
    }
    appendText(`${lineSep}\n`)

    // ESC a 0: Left alignment
    append([0x1b, 0x61, 0x00])
    appendText(`Receipt : ${txn.transactionCode || txn.id.slice(0, 12)}\n`)
    appendText(`Date    : ${txn.date}   Shift: ${txn.shift}\n`)
    appendText(`Time    : ${new Date(txn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`)
    appendText(`Farmer  : ${txn.customerCode} - ${txn.customerName}\n`)
    appendText(`Category: ${txn.milkCategory}\n`)
    appendText(`${lineSep}\n`)

    // Itemized Weighment Details
    appendText(`Volume (L)  : ${txn.weightLiters.toFixed(2)} L\n`)
    appendText(`Fat %       : ${txn.fatPercentage.toFixed(2)} %\n`)
    appendText(`SNF %       : ${txn.snfPercentage.toFixed(2)} %\n`)
    if (txn.clrDensity) {
      appendText(`CLR Density : ${txn.clrDensity.toFixed(1)}\n`)
    }
    appendText(`Rate / L    : Rs. ${txn.appliedRatePerLiter.toFixed(2)}\n`)
    appendText(`${lineSep}\n`)

    // ESC ! 0x20: Double height for Total Amount
    append([0x1b, 0x21, 0x20])
    appendText(`TOTAL: Rs. ${txn.totalAmount.toFixed(2)}\n`)
    append([0x1b, 0x21, 0x00])
    appendText(`${lineSep}\n`)

    // Footer
    append([0x1b, 0x61, 0x01])
    appendText(`Operator: ${txn.operatorName || options.operatorName || 'Counter'}\n`)
    appendText(`Thank You for Partnering with DFarm\n\n\n`)

    // GS V 0: Full cut paper
    append([0x1d, 0x56, 0x00])

    return new Uint8Array(bytes)
  }

  // 2. Direct Web Serial ESC/POS Printer Transport
  public async printToSerial(txn: CollectionTransaction, options: ReceiptPrintOptions = {}): Promise<boolean> {
    if (!this.isWebSerialSupported()) {
      return this.printThermalVoucher(txn, options)
    }

    try {
      if (!this.serialPort) {
        this.serialPort = await (navigator as any).serial.requestPort()
        await this.serialPort.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' })
      }

      const payload = this.buildEscPosPayload(txn, options)
      const writer = this.serialPort.writable.getWriter()
      await writer.write(payload)
      writer.releaseLock()
      return true
    } catch (err: any) {
      console.warn('[ThermalPrinter] Serial print fallback to browser voucher:', err.message)
      return this.printThermalVoucher(txn, options)
    }
  }

  // 3. Browser Thermal Ticket Printing (Universal Fallback)
  public printThermalVoucher(txn: CollectionTransaction, options: ReceiptPrintOptions = {}): boolean {
    const is80mm = options.paperWidthMm === 80
    const widthCss = is80mm ? '80mm' : '58mm'
    const dairy = options.dairyName || 'DFarm Dairy Cooperative'
    const center = options.centerName || 'Collection Center'
    const isOffline = txn.syncStatus === 'PENDING_OFFLINE'
    const isReprint = options.isReprint === true

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'

    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) return false

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${txn.transactionCode}</title>
        <style>
          @page {
            size: ${widthCss} auto;
            margin: 2mm;
          }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.25;
            width: ${widthCss};
            margin: 0;
            padding: 2mm;
            color: #000;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .title { font-size: 14px; font-weight: bold; }
          .alert-banner { font-size: 10px; font-weight: bold; border: 1px solid #000; padding: 2px; margin: 2px 0; }
          .row { display: flex; justify-content: space-between; }
          .total-box { font-size: 15px; font-weight: bold; margin: 4px 0; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="title">${dairy}</div>
          <div>${center}</div>
          <div class="bold">MILK INTAKE RECEIPT</div>
          ${isOffline ? '<div class="alert-banner">*** PENDING OFFLINE COPY ***</div>' : ''}
          ${isReprint ? '<div class="alert-banner">*** DUPLICATE REPRINT ***</div>' : ''}
        </div>
        <div class="divider"></div>
        <div class="row"><span>Receipt:</span><span>${txn.transactionCode || txn.id.slice(0, 8)}</span></div>
        <div class="row"><span>Date/Shift:</span><span>${txn.date} (${txn.shift})</span></div>
        <div class="row"><span>Time:</span><span>${new Date(txn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="row"><span>Patron:</span><span>${txn.customerCode} - ${txn.customerName}</span></div>
        <div class="row"><span>Category:</span><span>${txn.milkCategory}</span></div>
        <div class="divider"></div>
        <div class="row"><span>Net Volume:</span><span class="bold">${txn.weightLiters.toFixed(2)} L</span></div>
        <div class="row"><span>Fat %:</span><span>${txn.fatPercentage.toFixed(2)} %</span></div>
        <div class="row"><span>SNF %:</span><span>${txn.snfPercentage.toFixed(2)} %</span></div>
        ${txn.clrDensity ? `<div class="row"><span>CLR Density:</span><span>${txn.clrDensity.toFixed(1)}</span></div>` : ''}
        <div class="row"><span>Rate / L:</span><span>Rs. ${txn.appliedRatePerLiter.toFixed(2)}</span></div>
        <div class="divider"></div>
        <div class="row total-box">
          <span>TOTAL:</span>
          <span>Rs. ${txn.totalAmount.toFixed(2)}</span>
        </div>
        <div class="divider"></div>
        <div class="text-center" style="font-size: 10px; margin-top: 6px;">
          <div>Operator: ${txn.operatorName || options.operatorName || 'Counter'}</div>
          <div>Thank You for Partnering with DFarm</div>
        </div>
      </body>
      </html>
    `)
    doc.close()

    iframe.contentWindow?.focus()
    setTimeout(() => {
      try {
        iframe.contentWindow?.print()
      } catch (e) {
        console.warn('[ThermalPrinter] Print dialog error:', e)
      } finally {
        setTimeout(() => {
          document.body.removeChild(iframe)
        }, 1000)
      }
    }, 250)

    return true
  }
}

export const thermalPrinterDriver = new ThermalPrinterDriver()
