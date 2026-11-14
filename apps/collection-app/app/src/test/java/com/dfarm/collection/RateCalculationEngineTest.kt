package com.dfarm.collection

import com.dfarm.collection.domain.model.MilkCategory
import com.dfarm.collection.domain.pricing.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class RateCalculationEngineTest {

    private lateinit var engine: RateCalculationEngine
    private lateinit var cowVersion: RateChartVersion

    @Before
    fun setUp() {
        engine = RateCalculationEngine()
        cowVersion = RateChartVersion(
            id = "rcv_cow_01",
            rateChartId = "rc_cow_01",
            versionNumber = 1,
            milkCategory = MilkCategory.COW,
            isApproved = true,
            effectiveFrom = System.currentTimeMillis() - 86400000,
            cells = listOf(
                RateCell(fatPercentage = 3.5, snfPercentage = 8.5, ratePerUnit = 34.00),
                RateCell(fatPercentage = 4.0, snfPercentage = 8.5, ratePerUnit = 36.50),
                RateCell(fatPercentage = 4.2, snfPercentage = 8.5, ratePerUnit = 37.80),
                RateCell(fatPercentage = 4.5, snfPercentage = 8.6, ratePerUnit = 39.50)
            )
        )
    }

    @Test
    fun testExactMatrixCellRateCalculation() {
        val result = engine.calculateRate(
            version = cowVersion,
            fat = 4.2,
            snf = 8.5,
            quantityKg = 15.0
        )

        assertEquals(37.80, result.appliedRate, 0.001)
        assertEquals(15.0, result.quantity, 0.001)
        // 15.0 * 37.80 = 567.00
        assertEquals(567.00, result.totalAmount, 0.01)
        assertEquals("EXACT_FAT_SNF_MATRIX_CELL", result.calculationRule)
    }

    @Test(expected = RateCellNotFoundException::class)
    fun testMissingRateCellThrowsControlledPricingError() {
        // Fat 5.1 / SNF 9.0 is not in the rate matrix -> must NOT invent rate or interpolate
        engine.calculateRate(
            version = cowVersion,
            fat = 5.1,
            snf = 9.0,
            quantityKg = 20.0
        )
    }

    @Test(expected = IllegalStateException::class)
    fun testUnapprovedRateChartVersionRejected() {
        val draftVersion = cowVersion.copy(isApproved = false)
        engine.calculateRate(
            version = draftVersion,
            fat = 4.0,
            snf = 8.5,
            quantityKg = 10.0
        )
    }

    @Test
    fun testHistoricalRateVersionPreservation() {
        val oldHistoricalVersion = RateChartVersion(
            id = "rcv_cow_hist_00",
            rateChartId = "rc_cow_01",
            versionNumber = 0,
            milkCategory = MilkCategory.COW,
            isApproved = true,
            effectiveFrom = System.currentTimeMillis() - 86400000 * 30,
            effectiveTo = System.currentTimeMillis() - 86400000,
            cells = listOf(
                RateCell(fatPercentage = 4.0, snfPercentage = 8.5, ratePerUnit = 33.00) // Old rate was 33.00
            )
        )

        val result = engine.calculateRate(
            version = oldHistoricalVersion,
            fat = 4.0,
            snf = 8.5,
            quantityKg = 10.0
        )

        assertEquals(33.00, result.appliedRate, 0.001)
        assertEquals(330.00, result.totalAmount, 0.01)
        assertEquals(0, result.rateVersionNumber)
    }
}
