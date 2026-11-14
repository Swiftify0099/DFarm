package com.dfarm.collection

import com.dfarm.collection.domain.model.*
import com.dfarm.collection.domain.statemachine.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class CollectionStateMachineTest {

    private lateinit var stateMachine: CollectionStateMachine
    private val activeCowCustomer = Customer(
        id = "c1111111-1111-1111-1111-111111111111",
        organizationId = "org_sangli",
        primaryCenterId = "center_tasgaon_01",
        farmerCode = "FARMER-001",
        fullName = "Pandurang Patil",
        mobileNumber = "+919876543210",
        status = CustomerStatus.ACTIVE,
        permittedCategories = listOf(MilkCategory.COW)
    )

    private val bothCategoryCustomer = Customer(
        id = "c3333333-3333-3333-3333-333333333333",
        organizationId = "org_sangli",
        primaryCenterId = "center_tasgaon_01",
        farmerCode = "FARMER-003",
        fullName = "Sambhaji Kadam",
        mobileNumber = "+919876543212",
        status = CustomerStatus.ACTIVE,
        permittedCategories = listOf(MilkCategory.COW, MilkCategory.BUFFALO)
    )

    @Before
    fun setUp() {
        stateMachine = CollectionStateMachine()
    }

    @Test
    fun testInitialStateIsWaitingForCustomer() {
        assertEquals(SessionState.WAITING_FOR_CUSTOMER, stateMachine.state)
    }

    @Test
    fun testCustomerIdentificationAndAutoCategoryForCowOnly() {
        // Step 1: Identify customer
        stateMachine.transition(StateMachineEvent.CustomerIdentified(activeCowCustomer))
        assertEquals(SessionState.CUSTOMER_IDENTIFIED, stateMachine.state)

        // Step 2: Customer Verified -> Cow only customer automatically selects COW
        stateMachine.transition(StateMachineEvent.CustomerVerified(activeCowCustomer))
        assertEquals(SessionState.CATEGORY_SELECTED, stateMachine.state)
        assertEquals(MilkCategory.COW, stateMachine.selectedCategory)
    }

    @Test
    fun testBothCategoryCustomerRequiresManualSelection() {
        stateMachine.transition(StateMachineEvent.CustomerIdentified(bothCategoryCustomer))
        stateMachine.transition(StateMachineEvent.CustomerVerified(bothCategoryCustomer))
        assertEquals(SessionState.CATEGORY_PENDING, stateMachine.state)

        // Select Buffalo
        stateMachine.transition(StateMachineEvent.CategorySelected(MilkCategory.BUFFALO))
        assertEquals(SessionState.CATEGORY_SELECTED, stateMachine.state)
        assertEquals(MilkCategory.BUFFALO, stateMachine.selectedCategory)
    }

    @Test(expected = IllegalStateTransitionException::class)
    fun testUnauthorizedCategorySelectionRejected() {
        stateMachine.transition(StateMachineEvent.CustomerIdentified(activeCowCustomer))
        stateMachine.transition(StateMachineEvent.CustomerVerified(activeCowCustomer))
        // Cow only customer cannot select BUFFALO
        stateMachine.transition(StateMachineEvent.CategorySelected(MilkCategory.BUFFALO))
    }

    @Test
    fun testCompleteSuccessfulCollectionLifecycle() {
        stateMachine.transition(StateMachineEvent.CustomerIdentified(activeCowCustomer))
        stateMachine.transition(StateMachineEvent.CustomerVerified(activeCowCustomer))

        val session = CollectionSession(
            customerUuid = activeCowCustomer.id,
            organizationId = activeCowCustomer.organizationId,
            centerId = "center_tasgaon_01",
            deviceId = "dev_tablet_01",
            identificationMethod = IdentificationMethod.FACE,
            milkCategory = MilkCategory.COW,
            shift = Shift.MORNING,
            businessDate = "2026-11-13"
        )
        stateMachine.transition(StateMachineEvent.SessionCreated(session))
        assertEquals(SessionState.WAITING_FOR_MEASUREMENTS, stateMachine.state)

        val qm = MilkQualityMeasurement(fatPercentage = 4.2, snfPercentage = 8.5, sessionUuid = session.sessionUuid)
        stateMachine.transition(StateMachineEvent.QualityMeasurementReceived(qm))
        assertEquals(SessionState.WAITING_FOR_MEASUREMENTS, stateMachine.state)

        val wm = MilkWeightMeasurement(netWeight = 15.5, sessionUuid = session.sessionUuid)
        stateMachine.transition(StateMachineEvent.WeightMeasurementReceived(wm))
        assertEquals(SessionState.MEASUREMENTS_RECEIVED, stateMachine.state)

        stateMachine.transition(StateMachineEvent.MeasurementsValidated)
        assertEquals(SessionState.READY_FOR_REVIEW, stateMachine.state)

        val rate = RateCalculationResult(
            rateVersionId = "v1",
            rateVersionNumber = 1,
            rateChartId = "rc1",
            appliedRate = 37.80,
            quantity = 15.5,
            totalAmount = 585.90
        )
        stateMachine.transition(StateMachineEvent.RateCalculated(rate))
        assertEquals(SessionState.READY_FOR_REVIEW, stateMachine.state)

        stateMachine.transition(StateMachineEvent.CommitStarted)
        assertEquals(SessionState.COMMITTING, stateMachine.state)

        stateMachine.transition(StateMachineEvent.CommitSuccess)
        assertEquals(SessionState.COMPLETED, stateMachine.state)
        assertNotNull(stateMachine.activeSession?.completedAt)
    }

    @Test
    fun testSafeCategoryChangeRequiresCancellation() {
        stateMachine.transition(StateMachineEvent.CustomerIdentified(bothCategoryCustomer))
        stateMachine.transition(StateMachineEvent.CustomerVerified(bothCategoryCustomer))
        stateMachine.transition(StateMachineEvent.CategorySelected(MilkCategory.COW))

        val session = CollectionSession(
            customerUuid = bothCategoryCustomer.id,
            organizationId = bothCategoryCustomer.organizationId,
            centerId = "center_tasgaon_01",
            deviceId = "dev_tablet_01",
            identificationMethod = IdentificationMethod.FACE,
            milkCategory = MilkCategory.COW,
            shift = Shift.MORNING,
            businessDate = "2026-11-13"
        )
        stateMachine.transition(StateMachineEvent.SessionCreated(session))
        assertEquals(SessionState.WAITING_FOR_MEASUREMENTS, stateMachine.state)

        // Changing category on active session cancels old session with audit reason
        stateMachine.changeCategorySafely(MilkCategory.BUFFALO, "Farmer brought buffalo milk instead")
        assertEquals(SessionState.CATEGORY_SELECTED, stateMachine.state)
        assertEquals(MilkCategory.BUFFALO, stateMachine.selectedCategory)
        assertEquals(SessionState.CANCELLED, session.state)
        assertEquals("Category change requested: Farmer brought buffalo milk instead", session.cancellationReason)
    }

    @Test(expected = IllegalStateTransitionException::class)
    fun testCannotCancelAlreadyCompletedSession() {
        stateMachine.transition(StateMachineEvent.CustomerIdentified(activeCowCustomer))
        stateMachine.transition(StateMachineEvent.CustomerVerified(activeCowCustomer))
        val session = CollectionSession(
            customerUuid = activeCowCustomer.id,
            organizationId = activeCowCustomer.organizationId,
            centerId = "center_tasgaon_01",
            deviceId = "dev_tablet_01",
            identificationMethod = IdentificationMethod.FACE,
            milkCategory = MilkCategory.COW,
            shift = Shift.MORNING,
            businessDate = "2026-11-13"
        )
        stateMachine.transition(StateMachineEvent.SessionCreated(session))
        stateMachine.transition(StateMachineEvent.QualityMeasurementReceived(MilkQualityMeasurement(4.0, 8.5, sessionUuid = session.sessionUuid)))
        stateMachine.transition(StateMachineEvent.WeightMeasurementReceived(MilkWeightMeasurement(netWeight = 10.0, sessionUuid = session.sessionUuid)))
        stateMachine.transition(StateMachineEvent.MeasurementsValidated)
        stateMachine.transition(StateMachineEvent.CommitStarted)
        stateMachine.transition(StateMachineEvent.CommitSuccess)

        // Attempting to cancel a completed session must throw exception
        stateMachine.transition(StateMachineEvent.CancelSession("Should fail"))
    }
}
