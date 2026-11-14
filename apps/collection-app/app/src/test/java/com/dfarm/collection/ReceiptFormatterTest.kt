package com.dfarm.collection

import com.dfarm.collection.domain.model.*
import com.dfarm.collection.domain.receipt.ReceiptFormatter
import org.junit.Assert.*
import org.junit.Test

class ReceiptFormatterTest {

    @Test
    fun testThermalReceiptSlipFormattingWithin40Columns() {
        val receipt = CollectionReceipt(
            receiptNumber = "RCP-001234",
            sessionUuid = "sess_f8b1c4e2-1234-5678-90ab-cdef12345678",
            businessDate = "2026-11-13",
            shift = Shift.MORNING,
            centerName = "Tasgaon Milk Collection Center 01",
            operatorName = "Suresh Patil",
            customerCode = "FARMER-042",
            customerName = "Pandurang Balasaheb Patil",
            identificationMethod = IdentificationMethod.FACE,
            milkCategory = MilkCategory.COW,
            weightKg = 18.5,
            fatPercentage = 4.2,
            snfPercentage = 8.6,
            ratePerUnit = 37.80,
            totalAmount = 699.30,
            timestamp = 1794567890000L,
            verificationHash = "8f4a123bca9876543210fedcba098765"
        )

        val text = ReceiptFormatter.generateReceiptText(receipt)
        assertNotNull(text)

        // Verify each line is within 40 characters width
        val lines = text.lines()
        for (line in lines) {
            assertTrue("Line exceeds 40 characters: '$line'", line.length <= 40)
        }

        // Verify key fields are present
        assertTrue(text.contains("DFARM DAIRY COLLECTION"))
        assertTrue(text.contains("RCP-001234"))
        assertTrue(text.contains("FARMER-042"))
        assertTrue(text.contains("COW"))
        assertTrue(text.contains("18.50 kg"))
        assertTrue(text.contains("INR 699.30"))
        assertTrue(text.contains("FACE"))
    }

    @Test
    fun testCryptographicVerificationHash() {
        val receipt = CollectionReceipt(
            receiptNumber = "RCP-001",
            sessionUuid = "sess_01",
            businessDate = "2026-11-13",
            shift = Shift.EVENING,
            centerName = "Center A",
            operatorName = "Op 1",
            customerCode = "F-001",
            customerName = "Ramesh Kumar",
            identificationMethod = IdentificationMethod.RFID,
            milkCategory = MilkCategory.BUFFALO,
            weightKg = 10.0,
            fatPercentage = 6.5,
            snfPercentage = 9.0,
            ratePerUnit = 58.00,
            totalAmount = 580.00,
            timestamp = 1794567890000L,
            verificationHash = ""
        )

        val hash = ReceiptFormatter.computeVerificationHash(receipt)
        assertNotNull(hash)
        assertEquals(64, hash.length) // SHA-256 hex string is 64 chars
    }
}
