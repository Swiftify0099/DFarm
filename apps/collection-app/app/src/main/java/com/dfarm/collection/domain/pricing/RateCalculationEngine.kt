package com.dfarm.collection.domain.pricing

import com.dfarm.collection.domain.model.MilkCategory
import com.dfarm.collection.domain.model.RateCalculationResult
import java.math.BigDecimal
import java.math.RoundingMode

data class RateCell(
    val fatPercentage: Double,
    val snfPercentage: Double,
    val ratePerUnit: Double
)

data class RateChartVersion(
    val id: String,
    val rateChartId: String,
    val versionNumber: Int,
    val milkCategory: MilkCategory,
    val isApproved: Boolean,
    val effectiveFrom: Long,
    val effectiveTo: Long? = null,
    val cells: List<RateCell>
)

class RateCellNotFoundException(message: String) : Exception(message)

class RateCalculationEngine {

    /**
     * Resolves exact rate from approved chart cells.
     * Throws RateCellNotFoundException if the exact Fat/SNF cell is not found.
     * No invented rates, no silent rounding of rates, no interpolation unless configured.
     */
    fun calculateRate(
        version: RateChartVersion,
        fat: Double,
        snf: Double,
        quantityKg: Double
    ): RateCalculationResult {
        if (!version.isApproved) {
            throw IllegalStateException("Rate chart version ${version.versionNumber} is not approved for production use")
        }

        val roundedFat = BigDecimal(fat).setScale(1, RoundingMode.HALF_UP).toDouble()
        val roundedSnf = BigDecimal(snf).setScale(1, RoundingMode.HALF_UP).toDouble()

        val matchingCell = version.cells.find {
            Math.abs(it.fatPercentage - roundedFat) < 0.001 &&
            Math.abs(it.snfPercentage - roundedSnf) < 0.001
        } ?: throw RateCellNotFoundException(
            "Controlled Pricing Error: No approved rate cell found for ${version.milkCategory} at Fat: $roundedFat%, SNF: $roundedSnf% in version ${version.versionNumber}"
        )

        val appliedRate = matchingCell.ratePerUnit
        val amount = BigDecimal(quantityKg)
            .multiply(BigDecimal(appliedRate))
            .setScale(2, RoundingMode.HALF_EVEN)
            .toDouble()

        return RateCalculationResult(
            rateVersionId = version.id,
            rateVersionNumber = version.versionNumber,
            rateChartId = version.rateChartId,
            appliedRate = appliedRate,
            quantity = quantityKg,
            totalAmount = amount,
            calculationRule = "EXACT_FAT_SNF_MATRIX_CELL",
            roundingMode = "HALF_EVEN_2_DECIMALS"
        )
    }
}
