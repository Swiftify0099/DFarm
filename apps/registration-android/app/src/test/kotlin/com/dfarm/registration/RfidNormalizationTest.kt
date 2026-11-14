package com.dfarm.registration

import com.dfarm.registration.hardware.SoftwareManualEntryRfidAdapter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RfidNormalizationTest {

  private lateinit var adapter: SoftwareManualEntryRfidAdapter

  @Before
  fun setup() {
    adapter = SoftwareManualEntryRfidAdapter()
  }

  @Test
  fun testNormalizesColonSeparatedHex() {
    val input = "04:a1:b2:c3:d4"
    val normalized = adapter.normalizeUid(input)
    assertEquals("04A1B2C3D4", normalized)
    assertTrue(adapter.isValidHexUid(normalized))
  }

  @Test
  fun testNormalizesHyphenSeparatedHex() {
    val input = "04-A1-B2-C3-D4"
    val normalized = adapter.normalizeUid(input)
    assertEquals("04A1B2C3D4", normalized)
    assertTrue(adapter.isValidHexUid(normalized))
  }

  @Test
  fun testNormalizesSpaceSeparatedHex() {
    val input = " 04 a1 b2 c3 d4 "
    val normalized = adapter.normalizeUid(input)
    assertEquals("04A1B2C3D4", normalized)
    assertTrue(adapter.isValidHexUid(normalized))
  }

  @Test
  fun testRejectsInvalidCharacters() {
    val input = "04:A1:ZZ:C3:D4"
    val normalized = adapter.normalizeUid(input)
    assertEquals("04A1ZZC3D4", normalized)
    assertFalse(adapter.isValidHexUid(normalized))
  }

  @Test
  fun testRejectsTooShortHex() {
    val input = "0A"
    val normalized = adapter.normalizeUid(input)
    assertFalse(adapter.isValidHexUid(normalized))
  }

  @Test
  fun testHardwareLabelIdentifiesPhysicalReaderDeferred() {
    assertEquals(
      "SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED",
      adapter.sourceLabel
    )
    assertFalse(adapter.isPhysicalReader)
  }
}

