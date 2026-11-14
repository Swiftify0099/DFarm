import {
  CollectionSession,
  Customer,
  MilkCategory,
  MilkQualityMeasurement,
  MilkWeightMeasurement,
  RateCalculationResult,
  SessionState,
} from '../../types';

export type StateMachineEvent =
  | { type: 'CUSTOMER_IDENTIFIED'; customer: Customer }
  | { type: 'CUSTOMER_VERIFIED'; customer: Customer }
  | { type: 'CATEGORY_SELECTED'; category: MilkCategory }
  | { type: 'SESSION_CREATED'; session: CollectionSession }
  | { type: 'QUALITY_MEASUREMENT_RECEIVED'; measurement: MilkQualityMeasurement }
  | { type: 'WEIGHT_MEASUREMENT_RECEIVED'; measurement: MilkWeightMeasurement }
  | { type: 'MEASUREMENTS_VALIDATED' }
  | { type: 'VALIDATION_FAILED'; reason: string }
  | { type: 'RATE_CALCULATED'; rate: RateCalculationResult }
  | { type: 'COMMIT_STARTED' }
  | { type: 'COMMIT_SUCCESS' }
  | { type: 'COMMIT_FAILED'; reason: string }
  | { type: 'CANCEL_SESSION'; reason: string }
  | { type: 'SESSION_TIMED_OUT' }
  | { type: 'MARK_PENDING_SYNC' }
  | { type: 'RESET' };

export class IllegalStateTransitionException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalStateTransitionException';
  }
}

export class CollectionStateMachine {
  public state: SessionState;
  public currentCustomer: Customer | null = null;
  public selectedCategory: MilkCategory | null = null;
  public activeSession: CollectionSession | null = null;
  public transitionHistory: SessionState[] = [];

  constructor(
    initialState: SessionState = 'WAITING_FOR_CUSTOMER',
    currentCustomer: Customer | null = null,
    selectedCategory: MilkCategory | null = null,
    activeSession: CollectionSession | null = null
  ) {
    this.state = initialState;
    this.currentCustomer = currentCustomer;
    this.selectedCategory = selectedCategory;
    this.activeSession = activeSession;
    this.transitionHistory.push(this.state);
  }

  transition(event: StateMachineEvent): SessionState {
    let nextState: SessionState;

    switch (event.type) {
      case 'CUSTOMER_IDENTIFIED': {
        if (
          this.state !== 'WAITING_FOR_CUSTOMER' &&
          this.state !== 'CANCELLED' &&
          this.state !== 'COMPLETED'
        ) {
          throw new IllegalStateTransitionException(
            `Cannot identify customer while in state: ${this.state}`
          );
        }
        if (event.customer.isDeleted) {
          throw new IllegalStateTransitionException(
            `Cannot select deleted customer: ${event.customer.id}`
          );
        }
        if (event.customer.status !== 'ACTIVE') {
          throw new IllegalStateTransitionException(
            `Cannot select inactive/suspended customer: ${event.customer.status}`
          );
        }
        this.currentCustomer = event.customer;
        nextState = 'CUSTOMER_IDENTIFIED';
        break;
      }

      case 'CUSTOMER_VERIFIED': {
        if (this.state !== 'CUSTOMER_IDENTIFIED') {
          throw new IllegalStateTransitionException(
            'Must be CUSTOMER_IDENTIFIED before CUSTOMER_VERIFIED'
          );
        }
        const cust = this.currentCustomer;
        if (!cust) {
          throw new IllegalStateTransitionException('No customer present');
        }

        // Business rule:
        // Single category -> Auto-select
        // Multiple categories -> CATEGORY_PENDING
        if (cust.permittedCategories.length === 1) {
          this.selectedCategory = cust.permittedCategories[0];
          nextState = 'CATEGORY_SELECTED';
        } else if (cust.permittedCategories.length > 1) {
          nextState = 'CATEGORY_PENDING';
        } else {
          throw new IllegalStateTransitionException(
            'Customer has no authorized milk categories'
          );
        }
        break;
      }

      case 'CATEGORY_SELECTED': {
        if (
          this.state !== 'CATEGORY_PENDING' &&
          this.state !== 'CUSTOMER_VERIFIED' &&
          this.state !== 'CATEGORY_SELECTED'
        ) {
          throw new IllegalStateTransitionException(
            `Cannot select category in state: ${this.state}`
          );
        }
        const cust = this.currentCustomer;
        if (!cust) {
          throw new IllegalStateTransitionException('Customer must be verified');
        }
        if (!cust.permittedCategories.includes(event.category)) {
          throw new IllegalStateTransitionException(
            `Customer is not authorized for milk category: ${event.category}`
          );
        }
        this.selectedCategory = event.category;
        nextState = 'CATEGORY_SELECTED';
        break;
      }

      case 'SESSION_CREATED': {
        if (this.state !== 'CATEGORY_SELECTED') {
          throw new IllegalStateTransitionException(
            'Category must be selected before session creation'
          );
        }
        this.activeSession = event.session;
        this.activeSession.state = 'SESSION_CREATED';
        nextState = 'WAITING_FOR_MEASUREMENTS';
        break;
      }

      case 'QUALITY_MEASUREMENT_RECEIVED': {
        if (
          this.state !== 'WAITING_FOR_MEASUREMENTS' &&
          this.state !== 'MEASUREMENTS_RECEIVED'
        ) {
          throw new IllegalStateTransitionException(
            `Cannot receive quality measurement in state: ${this.state}`
          );
        }
        const session = this.activeSession;
        if (!session) {
          throw new IllegalStateTransitionException('No active session');
        }
        session.qualityMeasurement = event.measurement;
        if (session.weightMeasurement) {
          session.state = 'MEASUREMENTS_RECEIVED';
          nextState = 'MEASUREMENTS_RECEIVED';
        } else {
          nextState = 'WAITING_FOR_MEASUREMENTS';
        }
        break;
      }

      case 'WEIGHT_MEASUREMENT_RECEIVED': {
        if (
          this.state !== 'WAITING_FOR_MEASUREMENTS' &&
          this.state !== 'MEASUREMENTS_RECEIVED'
        ) {
          throw new IllegalStateTransitionException(
            `Cannot receive weight measurement in state: ${this.state}`
          );
        }
        const session = this.activeSession;
        if (!session) {
          throw new IllegalStateTransitionException('No active session');
        }
        session.weightMeasurement = event.measurement;
        if (session.qualityMeasurement) {
          session.state = 'MEASUREMENTS_RECEIVED';
          nextState = 'MEASUREMENTS_RECEIVED';
        } else {
          nextState = 'WAITING_FOR_MEASUREMENTS';
        }
        break;
      }

      case 'MEASUREMENTS_VALIDATED': {
        if (
          this.state !== 'MEASUREMENTS_RECEIVED' &&
          this.state !== 'VALIDATING'
        ) {
          throw new IllegalStateTransitionException(
            'Measurements must be received before validation'
          );
        }
        nextState = 'READY_FOR_REVIEW';
        break;
      }

      case 'VALIDATION_FAILED': {
        nextState = 'WAITING_FOR_MEASUREMENTS';
        break;
      }

      case 'RATE_CALCULATED': {
        if (
          this.state !== 'READY_FOR_REVIEW' &&
          this.state !== 'MEASUREMENTS_RECEIVED'
        ) {
          throw new IllegalStateTransitionException(
            'Must be in review state to apply calculated rate'
          );
        }
        if (this.activeSession) {
          this.activeSession.rateCalculation = event.rate;
        }
        nextState = 'READY_FOR_REVIEW';
        break;
      }

      case 'COMMIT_STARTED': {
        if (this.state !== 'READY_FOR_REVIEW') {
          throw new IllegalStateTransitionException(
            'Session must be READY_FOR_REVIEW before committing'
          );
        }
        if (this.activeSession) {
          this.activeSession.state = 'COMMITTING';
        }
        nextState = 'COMMITTING';
        break;
      }

      case 'COMMIT_SUCCESS': {
        if (this.state !== 'COMMITTING') {
          throw new IllegalStateTransitionException(
            'Can only complete from COMMITTING state'
          );
        }
        if (this.activeSession) {
          this.activeSession.state = 'COMPLETED';
          this.activeSession.completedAt = Date.now();
        }
        nextState = 'COMPLETED';
        break;
      }

      case 'COMMIT_FAILED': {
        if (this.activeSession) {
          this.activeSession.state = 'FAILED';
        }
        nextState = 'FAILED';
        break;
      }

      case 'CANCEL_SESSION': {
        if (this.state === 'COMPLETED') {
          throw new IllegalStateTransitionException(
            'Cannot cancel an already completed session'
          );
        }
        if (this.activeSession) {
          this.activeSession.state = 'CANCELLED';
          this.activeSession.cancellationReason = event.reason;
        }
        nextState = 'CANCELLED';
        break;
      }

      case 'SESSION_TIMED_OUT': {
        if (this.activeSession) {
          this.activeSession.state = 'INCOMPLETE';
        }
        nextState = 'INCOMPLETE';
        break;
      }

      case 'MARK_PENDING_SYNC': {
        if (this.activeSession) {
          this.activeSession.state = 'PENDING_SYNC';
        }
        nextState = 'PENDING_SYNC';
        break;
      }

      case 'RESET': {
        this.currentCustomer = null;
        this.selectedCategory = null;
        this.activeSession = null;
        nextState = 'WAITING_FOR_CUSTOMER';
        break;
      }

      default:
        nextState = this.state;
    }

    this.state = nextState;
    this.transitionHistory.push(this.state);
    return this.state;
  }

  changeCategorySafely(newCategory: MilkCategory, reason: string): void {
    if (
      [
        'SESSION_CREATED',
        'WAITING_FOR_MEASUREMENTS',
        'MEASUREMENTS_RECEIVED',
        'VALIDATING',
        'READY_FOR_REVIEW',
      ].includes(this.state)
    ) {
      this.transition({
        type: 'CANCEL_SESSION',
        reason: `Category change requested: ${reason}`,
      });
      this.selectedCategory = newCategory;
      this.state = 'CATEGORY_SELECTED';
      this.transitionHistory.push(this.state);
    } else {
      this.transition({ type: 'CATEGORY_SELECTED', category: newCategory });
    }
  }
}
