package com.dfarm.collection

import com.dfarm.collection.domain.measurement.*
import com.dfarm.collection.domain.model.*
import org.junit.Assert.*
import org.junit.Test

class MeasurementValidationTest {

    private val limits = CenterValidationLimits(
        cowFatMin = 2.8,
        cowFatMax = 6.0,
        cowSnfMin = 7.8,
        cowSnfMax = 10.2,
        buffaloFatMin = 5.0,
        buffaloFatMax = 12.0,
        buffaloSnfMin = 8.2,
        buffaloSnfMax = 11.5,
        minWeightKg = 0.5,
        maxWeightKg = 200.0
    )

    @Test
    fun testValidCowMeasurementsPass() {
        val qm = MilkQualityMeasurement(fatPercentage = 4.2, snfPercentage = 8.6, sessionUuid = "sess_01")
        val wm = MilkWeightMeasurement(netWeight = 12.5, unit = MeasurementUnit.KG, sessionUuid = "sess_01")

        val qOutcome = MeasurementValidationEngine.validateQuality(qm, MilkCategory.COW, limits)
        val wOutcome = MeasurementValidationEngine.validateWeight(wm, limits)

        assertTrue(qOutcome.isValid)
        assertTrue(wOutcome.isValid)
    }

    @Test
    fun testValidBuffaloMeasurementsPass() {
        val qm = MilkQualityMeasurement(fatPercentage = 7.5, snfPercentage = 9.2, sessionUuid = "sess_02")
        val wm = MilkWeightMeasurement(netWeight = 25.0, unit = MeasurementUnit.KG, sessionUuid = "sess_02")

        val qOutcome = MeasurementValidationEngine.validateQuality(qm, MilkCategory.BUFFALO, limits)
        val wOutcome = MeasurementValidationEngine.validateWeight(wm, limits)

        assertTrue(qOutcome.isValid)
        assertTrue(wOutcome.isValid)
    }

    @Test
    fun testInvalidCowFatRejected() {
        // 2.0% Fat is below Cow minimum 2.8%
        val qmLow = MilkQualityMeasurement(fatPercentage = 2.0, snfPercentage = 8.5, sessionUuid = "sess_03")
        val outcomeLow = MeasurementValidationEngine.validateQuality(qmLow, MilkCategory.COW, limits)
        assertFalse(outcomeLow.isValid)
        assertTrue(outcomeLow.errors.any { it.contains("outside approved biological limits") })

        // 7.5% Fat is above Cow maximum 6.0%
        val qmHigh = MilkQualityMeasurement(fatPercentage = 7.5, snfPercentage = 8.5, sessionUuid = "sess_03")
        val outcomeHigh = MeasurementValidationEngine.validateQuality(qmHigh, MilkCategory.COW, limits)
        assertFalse(outcomeHigh.isValid)
    }

    @Test
    fun testInvalidBuffaloSnfRejected() {
        // 7.5% SNF is below Buffalo minimum 8.2%
        val qm = MilkQualityMeasurement(fatPercentage = 6.5, snfPercentage = 7.5, sessionUuid = "sess_04")
        val outcome = MeasurementValidationEngine.validateQuality(qm, MilkCategory.BUFFALO, limits)
        assertFalse(outcome.isValid)
        assertTrue(outcome.errors.any { it.contains("SNF") })
    }

    @Test
    fun testNegativeOrZeroNetWeightRejected() {
        val wmZero = MilkWeightMeasurement(netWeight = 0.0, sessionUuid = "sess_05")
        val outcomeZero = MeasurementValidationEngine.validateWeight(wmZero, limits)
        assertFalse(outcomeZero.isValid)

        val wmNeg = MilkWeightMeasurement(netWeight = -5.0, sessionUuid = "sess_05")
        val outcomeNeg = MeasurementValidationEngine.validateWeight(wmNeg, limits)
        assertFalse(outcomeNeg.isValid)
    }

    @Test
    fun testWeightExceedingMaxIntakeRejected() {
        // 250kg exceeds max single delivery limit of 200kg
        val wmExcess = MilkWeightMeasurement(netWeight = 250.0, sessionUuid = "sess_06")
        val outcome = MeasurementValidationEngine.validateWeight(wmExcess, limits)
        assertFalse(outcome.isValid)
        assertTrue(outcome.errors.any { it.contains("exceeds maximum") })
    }

    @Test
    fun testHardwareDeferredNoticeInProduction() {
        val prodQualityProvider = ProductionManualQualityProvider()
        assertEquals(HardwareConnectionStatus.DEFERRED_HARDWARE_BOUNDARY, prodQualityProvider.getMeasurementStatus())

        val prodWeightProvider = ProductionManualWeightProvider()
        assertEquals(HardwareConnectionStatus.DEFERRED_HARDWARE_BOUNDARY, prodWeightProvider.getMeasurementStatus())
    }
}
