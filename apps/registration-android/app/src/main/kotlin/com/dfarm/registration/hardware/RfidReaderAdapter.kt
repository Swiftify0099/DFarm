package com.dfarm.registration.hardware

/**
 * Architectural boundary interface for RFID card reader input.
 *
 * NOTE: Physical RFID hardware reader integration is DEFERRED in this phase.
 * Under project boundaries, no raw UART, Wiegand, or low-level controller drivers
 * are permitted. All entries use the SoftwareManualEntryRfidAdapter with explicit labeling.
 */
interface RfidReaderAdapter {
  val sourceLabel: String
  val isPhysicalReader: Boolean

  /**
   * Normalizes a raw hexadecimal card UID string into uppercase canonical representation.
   * Strips colons, hyphens, and whitespace.
   * e.g. "04:a1:b2:c3:d4" -> "04A1B2C3D4"
   */
  fun normalizeUid(rawInput: String): String

  /**
   * Validates whether a normalized UID conforms to hexadecimal standard (4 to 64 chars).
   */
  fun isValidHexUid(normalizedUid: String): Boolean
}

class SoftwareManualEntryRfidAdapter : RfidReaderAdapter {
  override val sourceLabel: String = "SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED"
  override val isPhysicalReader: Boolean = false

  override fun normalizeUid(rawInput: String): String {
    return rawInput.trim().replace(Regex("[:\\s-]"), "").uppercase()
  }

  override fun isValidHexUid(normalizedUid: String): Boolean {
    return normalizedUid.length in 4..64 && Regex("^[0-9A-F]+$").matches(normalizedUid)
  }
}

