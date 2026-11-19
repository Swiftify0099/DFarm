import { describe, it, expect } from 'vitest'
import { scaleDriver } from '../drivers/ScaleDriver'
import { milkAnalyzerDriver } from '../drivers/MilkAnalyzerDriver'
import { rfidReaderDriver } from '../drivers/RfidReaderDriver'
import { thermalPrinterDriver } from '../drivers/ThermalPrinterDriver'
import type { CollectionTransaction } from '../types'

describe('DFarm Hardware Peripheral Drivers Suite', () => {
  describe('Digital Weighing Scale Driver', () => {
    it('correctly parses continuous stable frame ST,GS,+0012.50,KG', () => {
      const reading = scaleDriver.parseFrame('ST,GS,+0012.50,KG\r\n')
      expect(reading).not.toBeNull()
      expect(reading?.weight).toBe(12.5)
      expect(reading?.unit).toBe('KG')
      expect(reading?.isStable).toBe(true)
      expect(reading?.isOverload).toBe(false)
    })

    it('correctly parses unstable frame US,GS,+0014.35,KG', () => {
      const reading = scaleDriver.parseFrame('US,GS,+0014.35,KG\r\n')
      expect(reading).not.toBeNull()
      expect(reading?.weight).toBe(14.35)
      expect(reading?.isStable).toBe(false)
    })

    it('correctly parses compact scale frame =0018.75(kg)', () => {
      const reading = scaleDriver.parseFrame('=0018.75(kg)\r\n')
      expect(reading).not.toBeNull()
      expect(reading?.weight).toBe(18.75)
      expect(reading?.unit).toBe('KG')
      expect(reading?.isStable).toBe(true)
    })

    it('rejects garbage and unformatted frames', () => {
      const reading = scaleDriver.parseFrame('INVALID_NOISE_PACKET\r\n')
      expect(reading).toBeNull()
    })
  })

  describe('Ultrasonic Milk Analyzer Driver', () => {
    it('correctly parses key-value frame FAT=04.20 SNF=08.70 CLR=29.50 TEMP=24.5', () => {
      const reading = milkAnalyzerDriver.parseFrame('FAT=04.20 SNF=08.70 CLR=29.50 TEMP=24.5\r\n')
      expect(reading).not.toBeNull()
      expect(reading?.fat).toBe(4.2)
      expect(reading?.snf).toBe(8.7)
      expect(reading?.clrDensity).toBe(29.5)
      expect(reading?.temperatureCelsius).toBe(24.5)
      expect(reading?.isBiologicallyValid).toBe(true)
      expect(reading?.validationErrors.length).toBe(0)
    })

    it('detects and flags biologically impossible FAT and SNF values', () => {
      const reading = milkAnalyzerDriver.parseFrame('FAT=01.10 SNF=04.50 CLR=18.00\r\n')
      expect(reading).not.toBeNull()
      expect(reading?.isBiologicallyValid).toBe(false)
      expect(reading?.validationErrors.length).toBeGreaterThan(0)
      expect(reading?.validationErrors.some((e) => e.includes('FAT'))).toBe(true)
      expect(reading?.validationErrors.some((e) => e.includes('SNF'))).toBe(true)
    })

    it('parses compact format F04.50 S08.80 C30.0', () => {
      const reading = milkAnalyzerDriver.parseFrame('F04.50 S08.80 C30.0 T25.0\r\n')
      expect(reading).not.toBeNull()
      expect(reading?.fat).toBe(4.5)
      expect(reading?.snf).toBe(8.8)
      expect(reading?.clrDensity).toBe(30.0)
      expect(reading?.isBiologicallyValid).toBe(true)
    })
  })

  describe('Thermal Receipt Printer Driver (ESC/POS)', () => {
    const mockTxn: CollectionTransaction = {
      id: 'txn-001-uuid',
      transactionCode: 'TXN-ABC12345',
      sessionId: 'session-01',
      dairyId: '00000000-0000-0000-0000-000000000001',
      customerId: 'cust-101',
      customerCode: 'FARM-1001',
      customerName: 'Ananda Ganpatrao More',
      timestamp: '2026-11-17T10:30:00.000Z',
      date: '2026-11-17',
      shift: 'MORNING',
      milkCategory: 'COW',
      weightLiters: 15.5,
      fatPercentage: 4.2,
      snfPercentage: 8.6,
      clrDensity: 29.2,
      appliedRatePerLiter: 41.3,
      rateChartVersion: 1,
      totalAmount: 640.15,
      identificationMethod: 'FACE_YUNET_SFACE',
      syncStatus: 'SYNCED_CLOUD',
      deviceId: 'KIOSK_MAIN',
      operatorName: 'Vikas Patil',
    }

    it('generates valid ESC/POS byte sequence with header, itemization, and paper cut command', () => {
      const bytes = thermalPrinterDriver.buildEscPosPayload(mockTxn, {
        dairyName: 'Gokul Milk Sahakari',
        centerName: 'Shirgaon Center',
      })

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBeGreaterThan(100)

      // ESC @ (Initialize): 0x1B, 0x40
      expect(bytes[0]).toBe(0x1b)
      expect(bytes[1]).toBe(0x40)

      // GS V (Paper cut): 0x1D, 0x56, 0x00 at the end
      const len = bytes.length
      expect(bytes[len - 3]).toBe(0x1d)
      expect(bytes[len - 2]).toBe(0x56)
      expect(bytes[len - 1]).toBe(0x00)

      // Converts bytes back to text to verify presence of receipt details
      const text = new TextDecoder().decode(bytes)
      expect(text).toContain('GOKUL MILK SAHAKARI')
      expect(text).toContain('FARM-1001')
      expect(text).toContain('15.50 L')
      expect(text).toContain('Rs. 640.15')
    })

    it('includes PENDING OFFLINE banner when transaction is unconfirmed', () => {
      const offlineTxn: CollectionTransaction = {
        ...mockTxn,
        syncStatus: 'PENDING_OFFLINE',
      }
      const bytes = thermalPrinterDriver.buildEscPosPayload(offlineTxn)
      const text = new TextDecoder().decode(bytes)
      expect(text).toContain('*** PENDING OFFLINE COPY ***')
    })

    it('includes DUPLICATE REPRINT banner when printing reprint', () => {
      const bytes = thermalPrinterDriver.buildEscPosPayload(mockTxn, { isReprint: true })
      const text = new TextDecoder().decode(bytes)
      expect(text).toContain('*** DUPLICATE REPRINT ***')
    })
  })
})
