package com.dfarm.collection.domain.measurement

import com.dfarm.collection.domain.model.CenterValidationLimits
import com.dfarm.collection.domain.model.MeasurementUnit
import com.dfarm.collection.domain.model.MilkCategory
import com.dfarm.collection.domain.model.MilkQualityMeasurement
import com.dfarm.collection.domain.model.MilkWeightMeasurement
import com.dfarm.collection.domain.model.ReadingSource
import com.dfarm.collection.domain.model.ValidationStatus

enum class HardwareConnectionStatus {
    CONNECTED,
    DISCONNECTED,
    NOT_CONFIGURED,
    DEFERRED_HARDWARE_BOUNDARY
}

sealed class QualityResult {
    data class Success(val measurement: MilkQualityMeasurement) : QualityResult()
    data class Error(val message: String, val code: String) : QualityResult()
}

sealed class WeightResult {
    data class Success(val measurement: MilkWeightMeasurement) : WeightResult()
    data class Error(val message: String, val code: String) : WeightResult()
}

interface MilkQualityProvider {
    suspend fun readQuality(sessionUuid: String): QualityResult
    fun validateQuality(measurement: MilkQualityMeasurement, category: MilkCategory, limits: CenterValidationLimits): Boolean
    fun getMeasurementStatus(): HardwareConnectionStatus
}

interface MilkWeightProvider {
    suspend fun readWeight(sessionUuid: String): WeightResult
    fun validateWeight(measurement: MilkWeightMeasurement, limits: CenterValidationLimits): Boolean
    fun getMeasurementStatus(): HardwareConnectionStatus
}

/**
 * Production Software Provider:
 * Strict boundary where physical analyzer hardware is deferred.
 * Accepts manual operator entry with source = MANUAL_ENTRY.
 * Never fabricates automated analyzer signals.
 */
class ProductionManualQualityProvider : MilkQualityProvider {
    private var pendingManualFat: Double? = null
    private var pendingManualSnf: Double? = null
    private var pendingClr: Double? = null

    fun setManualInput(fat: Double, snf: Double, clr: Double? = null) {
        pendingManualFat = fat
        pendingManualSnf = snf
        pendingClr = clr
    }

    override suspend fun readQuality(sessionUuid: String): QualityResult {
        val fat = pendingManualFat
        val snf = pendingManualSnf
        if (fat == null || snf == null) {
            return QualityResult.Error(
                "MEASUREMENT SOURCE NOT CONNECTED. Manual entry required.",
                "NO_QUALITY_READING"
            )
        }
        val measurement = MilkQualityMeasurement(
            fatPercentage = fat,
            snfPercentage = snf,
            clr = pendingClr,
            source = ReadingSource.MANUAL_ENTRY,
            sessionUuid = sessionUuid,
            validationStatus = ValidationStatus.PENDING
        )
        return QualityResult.Success(measurement)
    }

    override fun validateQuality(
        measurement: MilkQualityMeasurement,
        category: MilkCategory,
        limits: CenterValidationLimits
    ): Boolean {
        return MeasurementValidationEngine.validateQuality(measurement, category, limits).isValid
    }

    override fun getMeasurementStatus(): HardwareConnectionStatus {
        return HardwareConnectionStatus.DEFERRED_HARDWARE_BOUNDARY
    }
}

class ProductionManualWeightProvider : MilkWeightProvider {
    private var pendingManualWeight: Double? = null

    fun setManualInput(weight: Double) {
        pendingManualWeight = weight
    }

    override suspend fun readWeight(sessionUuid: String): WeightResult {
        val weight = pendingManualWeight
        if (weight == null) {
            return WeightResult.Error(
                "MEASUREMENT SOURCE NOT CONNECTED. Manual entry required.",
                "NO_WEIGHT_READING"
            )
        }
        val measurement = MilkWeightMeasurement(
            netWeight = weight,
            unit = MeasurementUnit.KG,
            source = ReadingSource.MANUAL_ENTRY,
            sessionUuid = sessionUuid,
            validationStatus = ValidationStatus.PENDING
        )
        return WeightResult.Success(measurement)
    }

    override fun validateWeight(
        measurement: MilkWeightMeasurement,
        limits: CenterValidationLimits
    ): Boolean {
        return MeasurementValidationEngine.validateWeight(measurement, limits).isValid
    }

    override fun getMeasurementStatus(): HardwareConnectionStatus {
        return HardwareConnectionStatus.DEFERRED_HARDWARE_BOUNDARY
    }
}

/**
 * Test Fixture Providers:
 * Available ONLY in test environments. Explicitly marks source as TEST_FIXTURE.
 */
class TestFixtureQualityProvider(
    private val fixtureFat: Double = 4.2,
    private val fixtureSnf: Double = 8.5
) : MilkQualityProvider {
    override suspend fun readQuality(sessionUuid: String): QualityResult {
        return QualityResult.Success(
            MilkQualityMeasurement(
                fatPercentage = fixtureFat,
                snfPercentage = fixtureSnf,
                source = ReadingSource.TEST_FIXTURE,
                sessionUuid = sessionUuid,
                validationStatus = ValidationStatus.PENDING
            )
        )
    }

    override fun validateQuality(
        measurement: MilkQualityMeasurement,
        category: MilkCategory,
        limits: CenterValidationLimits
    ): Boolean = MeasurementValidationEngine.validateQuality(measurement, category, limits).isValid

    override fun getMeasurementStatus(): HardwareConnectionStatus = HardwareConnectionStatus.CONNECTED
}

class TestFixtureWeightProvider(
    private val fixtureWeight: Double = 15.5
) : MilkWeightProvider {
    override suspend fun readWeight(sessionUuid: String): WeightResult {
        return WeightResult.Success(
            MilkWeightMeasurement(
                netWeight = fixtureWeight,
                unit = MeasurementUnit.KG,
                source = ReadingSource.TEST_FIXTURE,
                sessionUuid = sessionUuid,
                validationStatus = ValidationStatus.PENDING
            )
        )
    }

    override fun validateWeight(
        measurement: MilkWeightMeasurement,
        limits: CenterValidationLimits
    ): Boolean = MeasurementValidationEngine.validateWeight(measurement, limits).isValid

    override fun getMeasurementStatus(): HardwareConnectionStatus = HardwareConnectionStatus.CONNECTED
}

data class ValidationOutcome(
    val isValid: Boolean,
    val errors: List<String> = emptyList()
)

object MeasurementValidationEngine {

    fun validateQuality(
        measurement: MilkQualityMeasurement,
        category: MilkCategory,
        limits: CenterValidationLimits
    ): ValidationOutcome {
        val errors = mutableListOf<String>()

        if (measurement.fatPercentage <= 0.0) {
            errors.add("Fat percentage must be strictly positive (got ${measurement.fatPercentage})")
        }
        if (measurement.snfPercentage <= 0.0) {
            errors.add("SNF percentage must be strictly positive (got ${measurement.snfPercentage})")
        }

        when (category) {
            MilkCategory.COW -> {
                if (measurement.fatPercentage < limits.cowFatMin || measurement.fatPercentage > limits.cowFatMax) {
                    errors.add("Cow Fat ${measurement.fatPercentage}% is outside approved biological limits [${limits.cowFatMin} - ${limits.cowFatMax}%]")
                }
                if (measurement.snfPercentage < limits.cowSnfMin || measurement.snfPercentage > limits.cowSnfMax) {
                    errors.add("Cow SNF ${measurement.snfPercentage}% is outside approved biological limits [${limits.cowSnfMin} - ${limits.cowSnfMax}%]")
                }
            }
            MilkCategory.BUFFALO -> {
                if (measurement.fatPercentage < limits.buffaloFatMin || measurement.fatPercentage > limits.buffaloFatMax) {
                    errors.add("Buffalo Fat ${measurement.fatPercentage}% is outside approved biological limits [${limits.buffaloFatMin} - ${limits.buffaloFatMax}%]")
                }
                if (measurement.snfPercentage < limits.buffaloSnfMin || measurement.snfPercentage > limits.buffaloSnfMax) {
                    errors.add("Buffalo SNF ${measurement.snfPercentage}% is outside approved biological limits [${limits.buffaloSnfMin} - ${limits.buffaloSnfMax}%]")
                }
            }
        }

        return ValidationOutcome(isValid = errors.isEmpty(), errors = errors)
    }

    fun validateWeight(
        measurement: MilkWeightMeasurement,
        limits: CenterValidationLimits
    ): ValidationOutcome {
        val errors = mutableListOf<String>()

        if (measurement.netWeight <= 0.0) {
            errors.add("Net weight must be strictly positive (got ${measurement.netWeight})")
        }
        if (measurement.netWeight < limits.minWeightKg) {
            errors.add("Weight ${measurement.netWeight} kg is below minimum deliverable intake ${limits.minWeightKg} kg")
        }
        if (measurement.netWeight > limits.maxWeightKg) {
            errors.add("Weight ${measurement.netWeight} kg exceeds maximum single intake limit ${limits.maxWeightKg} kg")
        }
        if (measurement.unit != MeasurementUnit.KG) {
            errors.add("Weight must be recorded in KG (no silent unit conversion)")
        }

        return ValidationOutcome(isValid = errors.isEmpty(), errors = errors)
    }
}
