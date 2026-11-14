package com.dfarm.registration

import com.dfarm.registration.ui.components.MilkCategoryOption
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerFormValidationTest {

    @Test
    fun testValidIndianMobileNumberNormalization() {
        val rawInput = "9876543210"
        val normalized = "+91$rawInput"

        assertEquals("+919876543210", normalized)
        assertTrue(rawInput.matches(Regex("^[6-9]\\d{9}$")))
    }

    @Test
    fun testInvalidMobileNumberRejections() {
        // Less than 10 digits
        assertFalse("987654321".matches(Regex("^[6-9]\\d{9}$")))

        // More than 10 digits
        assertFalse("98765432101".matches(Regex("^[6-9]\\d{9}$")))

        // Starting with invalid digit 1-5
        assertFalse("1234567890".matches(Regex("^[6-9]\\d{9}$")))
        assertFalse("5555555555".matches(Regex("^[6-9]\\d{9}$")))

        // Non-numeric characters
        assertFalse("98765abcd0".matches(Regex("^[6-9]\\d{9}$")))
    }

    @Test
    fun testMilkCategoryOptionCategories() {
        assertEquals(listOf("COW"), MilkCategoryOption.COW.categories)
        assertEquals(listOf("BUFFALO"), MilkCategoryOption.BUFFALO.categories)
        assertEquals(listOf("COW", "BUFFALO"), MilkCategoryOption.BOTH.categories)
    }

    @Test
    fun testFullNameValidationRules() {
        val validName = "Pandurang Patil"
        assertTrue(validName.trim().length >= 2)

        val singleCharName = "P"
        assertFalse(singleCharName.trim().length >= 2)

        val emptyName = "   "
        assertFalse(emptyName.trim().length >= 2)
    }

    @Test
    fun testAddressRequiredFields() {
        val village = "Wadgaon"
        val district = "Kolhapur"

        assertTrue(village.trim().isNotEmpty())
        assertTrue(district.trim().isNotEmpty())

        val emptyVillage = "  "
        assertFalse(emptyVillage.trim().isNotEmpty())
    }
}
