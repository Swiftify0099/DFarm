package com.dfarm.collection.domain.statemachine

import com.dfarm.collection.domain.model.CollectionSession
import com.dfarm.collection.domain.model.Customer
import com.dfarm.collection.domain.model.CustomerStatus
import com.dfarm.collection.domain.model.MilkCategory
import com.dfarm.collection.domain.model.MilkQualityMeasurement
import com.dfarm.collection.domain.model.MilkWeightMeasurement
import com.dfarm.collection.domain.model.RateCalculationResult
import com.dfarm.collection.domain.model.SessionState

sealed class StateMachineEvent {
    data class CustomerIdentified(val customer: Customer) : StateMachineEvent()
    data class CustomerVerified(val customer: Customer) : StateMachineEvent()
    data class CategorySelected(val category: MilkCategory) : StateMachineEvent()
    data class SessionCreated(val session: CollectionSession) : StateMachineEvent()
    data class QualityMeasurementReceived(val measurement: MilkQualityMeasurement) : StateMachineEvent()
    data class WeightMeasurementReceived(val measurement: MilkWeightMeasurement) : StateMachineEvent()
    object MeasurementsValidated : StateMachineEvent()
    data class ValidationFailed(val reason: String) : StateMachineEvent()
    data class RateCalculated(val rate: RateCalculationResult) : StateMachineEvent()
    object CommitStarted : StateMachineEvent()
    object CommitSuccess : StateMachineEvent()
    data class CommitFailed(val reason: String) : StateMachineEvent()
    data class CancelSession(val reason: String) : StateMachineEvent()
    object SessionTimedOut : StateMachineEvent()
    object MarkPendingSync : StateMachineEvent()
    object Reset : StateMachineEvent()
}

class IllegalStateTransitionException(message: String) : IllegalStateException(message)

class CollectionStateMachine(
    initialState: SessionState = SessionState.WAITING_FOR_CUSTOMER,
    var currentCustomer: Customer? = null,
    var selectedCategory: MilkCategory? = null,
    var activeSession: CollectionSession? = null
) {
    var state: SessionState = initialState
        private set

    val transitionHistory = mutableListOf<SessionState>()

    init {
        transitionHistory.add(state)
    }

    fun transition(event: StateMachineEvent): SessionState {
        val nextState = when (event) {
            is StateMachineEvent.CustomerIdentified -> {
                if (state != SessionState.WAITING_FOR_CUSTOMER && state != SessionState.CANCELLED && state != SessionState.COMPLETED) {
                    throw IllegalStateTransitionException("Cannot identify customer while in state: $state")
                }
                if (event.customer.isDeleted) {
                    throw IllegalStateTransitionException("Cannot select deleted customer: ${event.customer.id}")
                }
                if (event.customer.status != CustomerStatus.ACTIVE) {
                    throw IllegalStateTransitionException("Cannot select inactive/suspended customer: ${event.customer.status}")
                }
                currentCustomer = event.customer
                SessionState.CUSTOMER_IDENTIFIED
            }

            is StateMachineEvent.CustomerVerified -> {
                if (state != SessionState.CUSTOMER_IDENTIFIED) {
                    throw IllegalStateTransitionException("Must be CUSTOMER_IDENTIFIED before CUSTOMER_VERIFIED")
                }
                val cust = currentCustomer ?: throw IllegalStateTransitionException("No customer present")
                
                // Milk category business rule:
                // Cow Only -> Auto-select COW
                // Buffalo Only -> Auto-select BUFFALO
                // Both -> CATEGORY_PENDING
                if (cust.permittedCategories.size == 1) {
                    selectedCategory = cust.permittedCategories.first()
                    SessionState.CATEGORY_SELECTED
                } else if (cust.permittedCategories.size > 1) {
                    SessionState.CATEGORY_PENDING
                } else {
                    throw IllegalStateTransitionException("Customer has no authorized milk categories")
                }
            }

            is StateMachineEvent.CategorySelected -> {
                if (state != SessionState.CATEGORY_PENDING && state != SessionState.CUSTOMER_VERIFIED) {
                    throw IllegalStateTransitionException("Cannot select category in state: $state")
                }
                val cust = currentCustomer ?: throw IllegalStateTransitionException("Customer must be verified")
                if (!cust.permittedCategories.contains(event.category)) {
                    throw IllegalStateTransitionException("Customer is not authorized for milk category: ${event.category}")
                }
                selectedCategory = event.category
                SessionState.CATEGORY_SELECTED
            }

            is StateMachineEvent.SessionCreated -> {
                if (state != SessionState.CATEGORY_SELECTED) {
                    throw IllegalStateTransitionException("Category must be selected before session creation")
                }
                activeSession = event.session
                activeSession?.state = SessionState.SESSION_CREATED
                SessionState.WAITING_FOR_MEASUREMENTS
            }

            is StateMachineEvent.QualityMeasurementReceived -> {
                if (state != SessionState.WAITING_FOR_MEASUREMENTS && state != SessionState.MEASUREMENTS_RECEIVED) {
                    throw IllegalStateTransitionException("Cannot receive quality measurement in state: $state")
                }
                val session = activeSession ?: throw IllegalStateTransitionException("No active session")
                session.qualityMeasurement = event.measurement
                if (session.weightMeasurement != null) {
                    session.state = SessionState.MEASUREMENTS_RECEIVED
                    SessionState.MEASUREMENTS_RECEIVED
                } else {
                    SessionState.WAITING_FOR_MEASUREMENTS
                }
            }

            is StateMachineEvent.WeightMeasurementReceived -> {
                if (state != SessionState.WAITING_FOR_MEASUREMENTS && state != SessionState.MEASUREMENTS_RECEIVED) {
                    throw IllegalStateTransitionException("Cannot receive weight measurement in state: $state")
                }
                val session = activeSession ?: throw IllegalStateTransitionException("No active session")
                session.weightMeasurement = event.measurement
                if (session.qualityMeasurement != null) {
                    session.state = SessionState.MEASUREMENTS_RECEIVED
                    SessionState.MEASUREMENTS_RECEIVED
                } else {
                    SessionState.WAITING_FOR_MEASUREMENTS
                }
            }

            is StateMachineEvent.MeasurementsValidated -> {
                if (state != SessionState.MEASUREMENTS_RECEIVED && state != SessionState.VALIDATING) {
                    throw IllegalStateTransitionException("Measurements must be received before validation")
                }
                SessionState.READY_FOR_REVIEW
            }

            is StateMachineEvent.ValidationFailed -> {
                SessionState.WAITING_FOR_MEASUREMENTS
            }

            is StateMachineEvent.RateCalculated -> {
                if (state != SessionState.READY_FOR_REVIEW && state != SessionState.MEASUREMENTS_RECEIVED) {
                    throw IllegalStateTransitionException("Must be in review state to apply calculated rate")
                }
                activeSession?.rateCalculation = event.rate
                SessionState.READY_FOR_REVIEW
            }

            is StateMachineEvent.CommitStarted -> {
                if (state != SessionState.READY_FOR_REVIEW) {
                    throw IllegalStateTransitionException("Session must be READY_FOR_REVIEW before committing")
                }
                activeSession?.state = SessionState.COMMITTING
                SessionState.COMMITTING
            }

            is StateMachineEvent.CommitSuccess -> {
                if (state != SessionState.COMMITTING) {
                    throw IllegalStateTransitionException("Can only complete from COMMITTING state")
                }
                activeSession?.state = SessionState.COMPLETED
                activeSession?.completedAt = System.currentTimeMillis()
                SessionState.COMPLETED
            }

            is StateMachineEvent.CommitFailed -> {
                activeSession?.state = SessionState.FAILED
                SessionState.FAILED
            }

            is StateMachineEvent.CancelSession -> {
                if (state == SessionState.COMPLETED) {
                    throw IllegalStateTransitionException("Cannot cancel an already completed session")
                }
                activeSession?.state = SessionState.CANCELLED
                activeSession?.cancellationReason = event.reason
                SessionState.CANCELLED
            }

            is StateMachineEvent.SessionTimedOut -> {
                activeSession?.state = SessionState.INCOMPLETE
                SessionState.INCOMPLETE
            }

            is StateMachineEvent.MarkPendingSync -> {
                activeSession?.state = SessionState.PENDING_SYNC
                SessionState.PENDING_SYNC
            }

            is StateMachineEvent.Reset -> {
                currentCustomer = null
                selectedCategory = null
                activeSession = null
                SessionState.WAITING_FOR_CUSTOMER
            }
        }

        state = nextState
        transitionHistory.add(state)
        return state
    }

    /**
     * Category modification rule:
     * Once SESSION_CREATED, category cannot be silently changed.
     * The active session MUST be safely cancelled with an audit reason before selecting a new category.
     */
    fun changeCategorySafely(newCategory: MilkCategory, reason: String) {
        if (state in listOf(
            SessionState.SESSION_CREATED,
            SessionState.WAITING_FOR_MEASUREMENTS,
            SessionState.MEASUREMENTS_RECEIVED,
            SessionState.VALIDATING,
            SessionState.READY_FOR_REVIEW
        )) {
            transition(StateMachineEvent.CancelSession("Category change requested: $reason"))
            selectedCategory = newCategory
            state = SessionState.CATEGORY_SELECTED
            transitionHistory.add(state)
        } else {
            transition(StateMachineEvent.CategorySelected(newCategory))
        }
    }
}
