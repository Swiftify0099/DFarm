import React, { useState, useEffect, useMemo } from 'react';
import { SafeAreaView, StyleSheet, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from './src/theme/colors';
import {
  Customer,
  IdentificationMethod,
  MilkCategory,
  RateCalculationResult,
  Shift,
} from './src/types';
import { SessionManager } from './src/storage/SessionManager';
import { CollectionApiClient } from './src/api/client';
import { ExpoSqliteCollectionDatabase } from './src/database/CollectionDatabase';
import { OfflineRevocationGuard } from './src/domain/sync/OfflineRevocationGuard';
import { DFarmSyncEngine } from './src/domain/sync/DFarmSyncEngine';
import { CollectionRepository } from './src/domain/repository/CollectionRepository';

// Screens
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { IdentificationScreen } from './src/screens/IdentificationScreen';
import { CustomerInfoScreen } from './src/screens/CustomerInfoScreen';
import { CategorySelectionScreen } from './src/screens/CategorySelectionScreen';
import { MeasurementScreen } from './src/screens/MeasurementScreen';
import { TransactionReviewScreen } from './src/screens/TransactionReviewScreen';
import { ReceiptScreen } from './src/screens/ReceiptScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';

export type CurrentScreen =
  | 'LOGIN'
  | 'DASHBOARD'
  | 'IDENTIFICATION'
  | 'CUSTOMER_INFO'
  | 'CATEGORY_SELECTION'
  | 'MEASUREMENTS'
  | 'REVIEW'
  | 'RECEIPT'
  | 'HISTORY';

export default function App() {
  const sessionManager = useMemo(() => new SessionManager(), []);
  const apiService = useMemo(() => new CollectionApiClient(sessionManager), [sessionManager]);
  const database = useMemo(() => new ExpoSqliteCollectionDatabase(), []);
  const revocationGuard = useMemo(() => new OfflineRevocationGuard(database), [database]);
  const syncEngine = useMemo(
    () => new DFarmSyncEngine(database, revocationGuard),
    [database, revocationGuard]
  );
  const repository = useMemo(
    () => new CollectionRepository(apiService, sessionManager, database, syncEngine),
    [apiService, sessionManager, database, syncEngine]
  );

  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>('LOGIN');
  const [isInitializing, setIsInitializing] = useState(true);

  // App & Shift context
  const currentShift: Shift = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 15 ? 'MORNING' : 'EVENING';
  }, []);

  const businessDate = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const [operatorName, setOperatorName] = useState('Operator');
  const [centerName, setCenterName] = useState('Assigned Dairy Center');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Active Intake Session State
  const [identifiedCustomer, setIdentifiedCustomer] = useState<Customer | null>(null);
  const [identificationMethod, setIdentificationMethod] = useState<IdentificationMethod>('RFID');
  const [selectedCategory, setSelectedCategory] = useState<MilkCategory>('COW');

  const [netWeight, setNetWeight] = useState(0.0);
  const [fatPercentage, setFatPercentage] = useState(0.0);
  const [snfPercentage, setSnfPercentage] = useState(0.0);
  const [rateResult, setRateResult] = useState<RateCalculationResult | null>(null);

  const [isCommitting, setIsCommitting] = useState(false);
  const [commitErrorMessage, setCommitErrorMessage] = useState<string | null>(null);
  const [generatedReceiptText, setGeneratedReceiptText] = useState('');

  // Initial authentication & session check
  useEffect(() => {
    (async () => {
      try {
        const loggedIn = await repository.isLoggedIn();
        if (loggedIn) {
          const op = await repository.getOfficerName();
          const ctr = await repository.getActiveCenterName();
          const count = await repository.getPendingSyncCount();
          setOperatorName(op);
          setCenterName(ctr);
          setPendingSyncCount(count);
          setCurrentScreen('DASHBOARD');
        } else {
          setCurrentScreen('LOGIN');
        }
      } catch (_e) {
        setCurrentScreen('LOGIN');
      } finally {
        setIsInitializing(false);
      }
    })();
  }, [repository]);

  const refreshDashboardContext = async () => {
    const op = await repository.getOfficerName();
    const ctr = await repository.getActiveCenterName();
    const count = await repository.getPendingSyncCount();
    setOperatorName(op);
    setCenterName(ctr);
    setPendingSyncCount(count);
  };

  const handleSyncNow = async () => {
    try {
      const deviceId = await repository.getDeviceId();
      const centerId = await repository.getActiveCenterId();
      await syncEngine.pushPendingJournal(deviceId, centerId, async (_url, body) => {
        try {
          const parsed = JSON.parse(body);
          const res = await apiService.pushSyncEvents(parsed);
          return { status: 200, body: JSON.stringify(res) };
        } catch (e: any) {
          return { status: e.status || 500, body: JSON.stringify(e.data || {}) };
        }
      });
    } catch (_e) {}
    const count = await repository.getPendingSyncCount();
    setPendingSyncCount(count);
  };

  if (isInitializing) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {currentScreen === 'LOGIN' && (
        <LoginScreen
          repository={repository}
          onLoginSuccess={async () => {
            await refreshDashboardContext();
            setCurrentScreen('DASHBOARD');
          }}
        />
      )}

      {currentScreen === 'DASHBOARD' && (
        <DashboardScreen
          operatorName={operatorName}
          centerName={centerName}
          shift={currentShift}
          pendingSyncCount={pendingSyncCount}
          onStartCollection={() => {
            setIdentifiedCustomer(null);
            setCommitErrorMessage(null);
            setCurrentScreen('IDENTIFICATION');
          }}
          onViewHistory={() => {
            setCurrentScreen('HISTORY');
          }}
          onSyncNow={handleSyncNow}
          onLogout={async () => {
            await repository.logout();
            setCurrentScreen('LOGIN');
          }}
        />
      )}

      {currentScreen === 'IDENTIFICATION' && (
        <IdentificationScreen
          repository={repository}
          onIdentified={(cust, method) => {
            setIdentifiedCustomer(cust);
            setIdentificationMethod(method);
            setCurrentScreen('CUSTOMER_INFO');
          }}
          onCancel={() => {
            setCurrentScreen('DASHBOARD');
          }}
        />
      )}

      {currentScreen === 'CUSTOMER_INFO' && identifiedCustomer && (
        <CustomerInfoScreen
          customer={identifiedCustomer}
          method={identificationMethod}
          onProceed={() => {
            if (identifiedCustomer.permittedCategories.length === 1) {
              setSelectedCategory(identifiedCustomer.permittedCategories[0]);
              setCurrentScreen('MEASUREMENTS');
            } else {
              setCurrentScreen('CATEGORY_SELECTION');
            }
          }}
          onReject={() => {
            setCurrentScreen('IDENTIFICATION');
          }}
        />
      )}

      {currentScreen === 'CATEGORY_SELECTION' && identifiedCustomer && (
        <CategorySelectionScreen
          customer={identifiedCustomer}
          onCategoryChosen={cat => {
            setSelectedCategory(cat);
            setCurrentScreen('MEASUREMENTS');
          }}
          onCancel={() => {
            setCurrentScreen('DASHBOARD');
          }}
        />
      )}

      {currentScreen === 'MEASUREMENTS' && identifiedCustomer && (
        <MeasurementScreen
          customer={identifiedCustomer}
          category={selectedCategory}
          repository={repository}
          onRateCalculated={(w, f, s, rr) => {
            setNetWeight(w);
            setFatPercentage(f);
            setSnfPercentage(s);
            setRateResult(rr);
            setCommitErrorMessage(null);
            setCurrentScreen('REVIEW');
          }}
          onCancel={() => {
            setCurrentScreen('DASHBOARD');
          }}
        />
      )}

      {currentScreen === 'REVIEW' && identifiedCustomer && rateResult && (
        <TransactionReviewScreen
          customer={identifiedCustomer}
          category={selectedCategory}
          netWeight={netWeight}
          fat={fatPercentage}
          snf={snfPercentage}
          rateCalculation={rateResult}
          isLoading={isCommitting}
          errorMessage={commitErrorMessage}
          onConfirmCommit={async () => {
            setIsCommitting(true);
            setCommitErrorMessage(null);
            const idempotencyKey = `IDEMP-COL-${Math.random().toString(36).substring(2, 12).toUpperCase()}-${Date.now()}`;
            const res = await repository.commitMilkCollection({
              customer: identifiedCustomer,
              category: selectedCategory,
              method: identificationMethod,
              shift: currentShift,
              businessDate,
              netWeight,
              fat: fatPercentage,
              snf: snfPercentage,
              appliedRate: rateResult.appliedRate,
              totalAmount: rateResult.totalAmount,
              idempotencyKey,
            });
            setIsCommitting(false);
            if (res.success && res.result) {
              setGeneratedReceiptText(res.result.receiptText);
              const count = await repository.getPendingSyncCount();
              setPendingSyncCount(count);
              setCurrentScreen('RECEIPT');
            } else {
              setCommitErrorMessage(res.error || 'Transaction commit failed');
            }
          }}
          onCancelSession={() => {
            setCurrentScreen('DASHBOARD');
          }}
        />
      )}

      {currentScreen === 'RECEIPT' && (
        <ReceiptScreen
          receiptText={generatedReceiptText}
          onDone={async () => {
            await refreshDashboardContext();
            setCurrentScreen('DASHBOARD');
          }}
        />
      )}

      {currentScreen === 'HISTORY' && (
        <HistoryScreen
          repository={repository}
          currentShift={currentShift}
          onDone={() => {
            setCurrentScreen('DASHBOARD');
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
