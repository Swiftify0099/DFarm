package com.dfarm.registration

import com.dfarm.registration.data.InMemoryRfidRepository
import com.dfarm.registration.hardware.SoftwareManualEntryRfidAdapter
import com.dfarm.registration.model.CustomerStatus
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RfidAssignmentTest {

  private lateinit var repository: InMemoryRfidRepository
  private lateinit var adapter: SoftwareManualEntryRfidAdapter

  @Before
  fun setup() {
    adapter = SoftwareManualEntryRfidAdapter()
    repository = InMemoryRfidRepository(adapter)
  }

  @Test
  fun testAssignCardSuccessfullyActivatesCompletedCustomer() = runTest {
    // Customer 1: Face is enrolled, status is PENDING_RFID_ASSIGNMENT
    val customerId = "c1000000-0000-0000-0000-000000000001"
    val cardUid = "AA:BB:CC:DD:01"

    val result = repository.assignCard(customerId, cardUid, "officer-01")
    assertTrue("Assignment should succeed", result.isSuccess)

    val assignment = result.getOrThrow()
    assertEquals("AABBCCDD01", assignment.cardUid)
    assertTrue(assignment.isActive)

    // Verify Customer is now ACTIVE and COMPLETED
    val updatedCustomer = repository.getCustomer(customerId).first()
    assertNotNull(updatedCustomer)
    assertEquals(CustomerStatus.ACTIVE, updatedCustomer!!.status)
    assertEquals("COMPLETED", updatedCustomer.registrationStatus)
    assertEquals("AABBCCDD01", updatedCustomer.activeCardUid)
  }

  @Test
  fun testAssignDuplicateCardIsRejected() = runTest {
    // Card 04A1B2C3D4 is already actively assigned to Customer 2
    val customerId = "c1000000-0000-0000-0000-000000000001"
    val existingUid = "04:A1:B2:C3:D4"

    val result = repository.assignCard(customerId, existingUid, "officer-01")
    assertTrue("Duplicate card assignment must fail", result.isFailure)
    assertTrue(
      result.exceptionOrNull()?.message?.contains("already actively assigned") == true
    )
  }

  @Test
  fun testAssignSecondCardToCustomerWithoutReplacementIsRejected() = runTest {
    // Customer 2 already has an active card (04A1B2C3D4)
    val customerId = "c1000000-0000-0000-0000-000000000002"
    val newUid = "EE:FF:11:22:33"

    val result = repository.assignCard(customerId, newUid, "officer-01")
    assertTrue("Should reject assigning second active card", result.isFailure)
    assertTrue(
      result.exceptionOrNull()?.message?.contains("already has an active RFID Card") == true
    )
  }

  @Test
  fun testCardReplacementDeactivatesPriorCardAndAssignsNew() = runTest {
    val customerId = "c1000000-0000-0000-0000-000000000002"
    val newUid = "55:66:77:88:99"

    val result = repository.replaceCard(customerId, newUid, "DAMAGED", "officer-01")
    assertTrue("Card replacement should succeed", result.isSuccess)

    val newAssignment = result.getOrThrow()
    assertEquals("5566778899", newAssignment.cardUid)
    assertTrue(newAssignment.isActive)

    // Check assignments list
    val assignments = repository.getAssignments(customerId).first()
    assertEquals(2, assignments.size)

    val oldAssignment = assignments.find { it.cardUid == "04A1B2C3D4" }
    assertNotNull(oldAssignment)
    assertFalse(oldAssignment!!.isActive)
    assertTrue(oldAssignment.revocationReason?.contains("REPLACED: DAMAGED") == true)
  }

  @Test
  fun testRevokeCardDeactivatesAssignmentAndClearsCustomerActiveCard() = runTest {
    val customerId = "c1000000-0000-0000-0000-000000000002"
    val assignments = repository.getAssignments(customerId).first()
    val active = assignments.first { it.isActive }

    val result = repository.revokeCard(customerId, active.id, "LOST_CARD", "officer-01")
    assertTrue("Revocation should succeed", result.isSuccess)

    val updatedCustomer = repository.getCustomer(customerId).first()
    assertNull(updatedCustomer?.activeCardUid)

    val updatedAssignments = repository.getAssignments(customerId).first()
    assertFalse(updatedAssignments.first { it.id == active.id }.isActive)
  }

  @Test
  fun testBlockCardMarksAssignmentAsBlocked() = runTest {
    val customerId = "c1000000-0000-0000-0000-000000000002"
    val assignments = repository.getAssignments(customerId).first()
    val active = assignments.first { it.isActive }

    val result = repository.blockCard(customerId, active.id, "SUSPICIOUS_TAP", "officer-01")
    assertTrue("Blocking should succeed", result.isSuccess)

    val updatedAssignments = repository.getAssignments(customerId).first()
    val blocked = updatedAssignments.first { it.id == active.id }
    assertFalse(blocked.isActive)
    assertTrue(blocked.revocationReason?.contains("BLOCKED: SUSPICIOUS_TAP") == true)
  }
}

