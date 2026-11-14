import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CollectionStateMachine,
  IllegalStateTransitionException,
} from '../domain/statemachine/CollectionStateMachine';
import { Customer } from '../types';

test('Collection State Machine Lifecycle & Transitions Suite', async (t) => {
  const activeCowCustomer: Customer = {
    id: 'c1111111-1111-1111-1111-111111111111',
    organizationId: 'org_sangli',
    primaryCenterId: 'center_tasgaon_01',
    farmerCode: 'FARMER-001',
    fullName: 'Pandurang Patil',
    mobileNumber: '+919876543210',
    status: 'ACTIVE',
    permittedCategories: ['COW'],
  };

  const bothCategoryCustomer: Customer = {
    id: 'c3333333-3333-3333-3333-333333333333',
    organizationId: 'org_sangli',
    primaryCenterId: 'center_tasgaon_01',
    farmerCode: 'FARMER-003',
    fullName: 'Sambhaji Kadam',
    mobileNumber: '+919876543212',
    status: 'ACTIVE',
    permittedCategories: ['COW', 'BUFFALO'],
  };

  await t.test('1. Initial State is WAITING_FOR_CUSTOMER', () => {
    const sm = new CollectionStateMachine();
    assert.equal(sm.state, 'WAITING_FOR_CUSTOMER');
  });

  await t.test('2. Customer Identification and Auto-Category for Cow-only customer', () => {
    const sm = new CollectionStateMachine();
    sm.transition({ type: 'CUSTOMER_IDENTIFIED', customer: activeCowCustomer });
    assert.equal(sm.state, 'CUSTOMER_IDENTIFIED');

    sm.transition({ type: 'CUSTOMER_VERIFIED', customer: activeCowCustomer });
    assert.equal(sm.state, 'CATEGORY_SELECTED');
    assert.equal(sm.selectedCategory, 'COW');
  });

  await t.test('3. Both-category customer requires category selection (CATEGORY_PENDING)', () => {
    const sm = new CollectionStateMachine();
    sm.transition({ type: 'CUSTOMER_IDENTIFIED', customer: bothCategoryCustomer });
    sm.transition({ type: 'CUSTOMER_VERIFIED', customer: bothCategoryCustomer });
    assert.equal(sm.state, 'CATEGORY_PENDING');

    sm.transition({ type: 'CATEGORY_SELECTED', category: 'BUFFALO' });
    assert.equal(sm.state, 'CATEGORY_SELECTED');
    assert.equal(sm.selectedCategory, 'BUFFALO');
  });

  await t.test('4. Unauthorized category selection rejected', () => {
    const sm = new CollectionStateMachine();
    sm.transition({ type: 'CUSTOMER_IDENTIFIED', customer: activeCowCustomer });
    sm.transition({ type: 'CUSTOMER_VERIFIED', customer: activeCowCustomer });

    assert.throws(
      () => {
        sm.transition({ type: 'CATEGORY_SELECTED', category: 'BUFFALO' });
      },
      (err: any) => {
        return (
          err instanceof IllegalStateTransitionException &&
          err.message.includes('not authorized for milk category')
        );
      }
    );
  });

  await t.test('5. Complete successful collection lifecycle', () => {
    const sm = new CollectionStateMachine();
    sm.transition({ type: 'CUSTOMER_IDENTIFIED', customer: activeCowCustomer });
    sm.transition({ type: 'CUSTOMER_VERIFIED', customer: activeCowCustomer });

    const session = {
      sessionUuid: 'sess_12345',
      customerUuid: activeCowCustomer.id,
      organizationId: activeCowCustomer.organizationId,
      centerId: 'center_tasgaon_01',
      deviceId: 'dev_tablet_01',
      identificationMethod: 'FACE' as const,
      milkCategory: 'COW' as const,
      shift: 'MORNING' as const,
      businessDate: '2026-11-13',
      state: 'SESSION_CREATED' as const,
      idempotencyReference: 'idemp_123',
    };

    sm.transition({ type: 'SESSION_CREATED', session });
    assert.equal(sm.state, 'WAITING_FOR_MEASUREMENTS');

    sm.transition({
      type: 'QUALITY_MEASUREMENT_RECEIVED',
      measurement: { fatPercentage: 4.2, snfPercentage: 8.5, sessionUuid: session.sessionUuid },
    });
    assert.equal(sm.state, 'WAITING_FOR_MEASUREMENTS');

    sm.transition({
      type: 'WEIGHT_MEASUREMENT_RECEIVED',
      measurement: { netWeight: 15.5, sessionUuid: session.sessionUuid },
    });
    assert.equal(sm.state, 'MEASUREMENTS_RECEIVED');

    sm.transition({ type: 'MEASUREMENTS_VALIDATED' });
    assert.equal(sm.state, 'READY_FOR_REVIEW');

    sm.transition({
      type: 'RATE_CALCULATED',
      rate: {
        rateVersionId: 'v1',
        rateVersionNumber: 1,
        rateChartId: 'rc1',
        appliedRate: 37.8,
        quantity: 15.5,
        totalAmount: 585.9,
        calculationRule: 'EXACT',
        roundingMode: 'HALF_EVEN',
      },
    });
    assert.equal(sm.state, 'READY_FOR_REVIEW');

    sm.transition({ type: 'COMMIT_STARTED' });
    assert.equal(sm.state, 'COMMITTING');

    sm.transition({ type: 'COMMIT_SUCCESS' });
    assert.equal(sm.state, 'COMPLETED');
    assert.ok(sm.activeSession?.completedAt);
  });

  await t.test('6. Safe Category Change Cancels Active Session with Audit Reason', () => {
    const sm = new CollectionStateMachine();
    sm.transition({ type: 'CUSTOMER_IDENTIFIED', customer: bothCategoryCustomer });
    sm.transition({ type: 'CUSTOMER_VERIFIED', customer: bothCategoryCustomer });
    sm.transition({ type: 'CATEGORY_SELECTED', category: 'COW' });

    const session = {
      sessionUuid: 'sess_999',
      customerUuid: bothCategoryCustomer.id,
      organizationId: bothCategoryCustomer.organizationId,
      centerId: 'center_tasgaon_01',
      deviceId: 'dev_tablet_01',
      identificationMethod: 'FACE' as const,
      milkCategory: 'COW' as const,
      shift: 'MORNING' as const,
      businessDate: '2026-11-13',
      state: 'SESSION_CREATED' as const,
      idempotencyReference: 'idemp_999',
    };

    sm.transition({ type: 'SESSION_CREATED', session });
    assert.equal(sm.state, 'WAITING_FOR_MEASUREMENTS');

    sm.changeCategorySafely('BUFFALO', 'Farmer brought buffalo milk instead');
    assert.equal(sm.state, 'CATEGORY_SELECTED');
    assert.equal(sm.selectedCategory, 'BUFFALO');
    assert.equal(session.state, 'CANCELLED');
    assert.equal(
      session.cancellationReason,
      'Category change requested: Farmer brought buffalo milk instead'
    );
  });

  await t.test('7. Cannot cancel an already completed session', () => {
    const sm = new CollectionStateMachine();
    sm.transition({ type: 'CUSTOMER_IDENTIFIED', customer: activeCowCustomer });
    sm.transition({ type: 'CUSTOMER_VERIFIED', customer: activeCowCustomer });

    const session = {
      sessionUuid: 'sess_done',
      customerUuid: activeCowCustomer.id,
      organizationId: activeCowCustomer.organizationId,
      centerId: 'center_tasgaon_01',
      deviceId: 'dev_tablet_01',
      identificationMethod: 'FACE' as const,
      milkCategory: 'COW' as const,
      shift: 'MORNING' as const,
      businessDate: '2026-11-13',
      state: 'SESSION_CREATED' as const,
      idempotencyReference: 'idemp_done',
    };

    sm.transition({ type: 'SESSION_CREATED', session });
    sm.transition({
      type: 'QUALITY_MEASUREMENT_RECEIVED',
      measurement: { fatPercentage: 4.0, snfPercentage: 8.5, sessionUuid: session.sessionUuid },
    });
    sm.transition({
      type: 'WEIGHT_MEASUREMENT_RECEIVED',
      measurement: { netWeight: 10.0, sessionUuid: session.sessionUuid },
    });
    sm.transition({ type: 'MEASUREMENTS_VALIDATED' });
    sm.transition({ type: 'COMMIT_STARTED' });
    sm.transition({ type: 'COMMIT_SUCCESS' });

    assert.throws(
      () => {
        sm.transition({ type: 'CANCEL_SESSION', reason: 'Should fail' });
      },
      (err: any) => {
        return (
          err instanceof IllegalStateTransitionException &&
          err.message.includes('Cannot cancel an already completed session')
        );
      }
    );
  });
});
