import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { CollectionDetailScreen } from '../screens/milk/CollectionDetailScreen';
import { PdfViewerScreen } from '../screens/billing/PdfViewerScreen';
import { FeedHistoryScreen } from '../screens/feed/FeedHistoryScreen';
import { FeedSaleDetailScreen } from '../screens/feed/FeedSaleDetailScreen';
import { PaymentsScreen } from '../screens/payments/PaymentsScreen';
import { PaymentDetailScreen } from '../screens/payments/PaymentDetailScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { SettingsScreen } from '../screens/profile/SettingsScreen';
import { SupportScreen } from '../screens/profile/SupportScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { MilkHistoryScreen } from '../screens/milk/MilkHistoryScreen';
import { CustomerLedgerScreen } from '../screens/ledger/CustomerLedgerScreen';
import { MonthlyBillsScreen } from '../screens/billing/MonthlyBillsScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { colors } from '../components/theme/colors';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSpinner message="Checking DFarm session..." fullScreen />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '700',
        },
      }}
    >
      {!isAuthenticated ? (
        <Stack.Screen
          name="Auth"
          component={AuthNavigator}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="MilkHistory"
            component={MilkHistoryScreen}
            options={{ title: 'Milk Deliveries' }}
          />
          <Stack.Screen
            name="CollectionDetail"
            component={CollectionDetailScreen as any}
            options={{ title: 'Milk Intake Slip', headerStyle: { backgroundColor: '#1E293B' }, headerTintColor: '#FFFFFF' }}
          />
          <Stack.Screen
            name="CustomerLedger"
            component={CustomerLedgerScreen}
            options={{ title: 'Passbook Ledger' }}
          />
          <Stack.Screen
            name="MonthlyBills"
            component={MonthlyBillsScreen}
            options={{ title: 'Monthly Statements' }}
          />
          <Stack.Screen
            name="PdfViewer"
            component={PdfViewerScreen as any}
            options={{ title: 'Statement PDF' }}
          />
          <Stack.Screen
            name="FeedHistory"
            component={FeedHistoryScreen}
            options={{ title: 'Cattle Feed Invoices' }}
          />
          <Stack.Screen
            name="FeedSaleDetail"
            component={FeedSaleDetailScreen as any}
            options={{ title: 'Feed Purchase Invoice' }}
          />
          <Stack.Screen
            name="Payments"
            component={PaymentsScreen}
            options={{ title: 'Payment Disbursements' }}
          />
          <Stack.Screen
            name="PaymentDetail"
            component={PaymentDetailScreen as any}
            options={{ title: 'Disbursement Voucher' }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: 'Customer Profile' }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ title: 'Preferences & Consent' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'App & Storage Settings' }}
          />
          <Stack.Screen
            name="Support"
            component={SupportScreen}
            options={{ title: 'Center Helpline & Support' }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ title: 'Alerts & Messages' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
