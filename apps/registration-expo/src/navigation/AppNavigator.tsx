/**
 * DFarm Registration App - App Navigator
 * Complete parity with Navigation.kt & NavigationKeys.kt
 * Configured with Claymorphism Canvas Transitions & Direct Screen Inspection
 */

import React from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { CustomerListScreen } from '../screens/CustomerListScreen';
import { RegistrationWizardScreen } from '../screens/RegistrationWizardScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { CustomerEditScreen } from '../screens/CustomerEditScreen';
import { FaceEnrollmentScreen } from '../screens/FaceEnrollmentScreen';
import { RfidAssignmentScreen } from '../screens/RfidAssignmentScreen';
import { MainScreen } from '../screens/MainScreen';
import { clayColors } from '../theme/claymorphism';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { isLoggedIn, isLoading } = useAuth();

  let initialRoute: keyof RootStackParamList = isLoggedIn ? 'CustomerList' : 'Login';

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, '?'));
      const screenParam = (searchParams.get('screen') || hashParams.get('screen')) as keyof RootStackParamList;
      if (
        screenParam &&
        [
          'Login',
          'CustomerList',
          'RegistrationWizard',
          'CustomerDetail',
          'CustomerEdit',
          'FaceEnrollment',
          'RfidAssignment',
          'Main',
        ].includes(screenParam)
      ) {
        initialRoute = screenParam;
      }
    } catch {}
  }

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        animation: 'default',
        contentStyle: {
          backgroundColor: clayColors.canvasBackground,
        },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="CustomerList" component={CustomerListScreen} />
      <Stack.Screen name="RegistrationWizard" component={RegistrationWizardScreen} />
      <Stack.Screen
        name="CustomerDetail"
        component={CustomerDetailScreen}
        initialParams={{ customerId: 'c1111111-1111-1111-1111-111111111111' }}
      />
      <Stack.Screen
        name="CustomerEdit"
        component={CustomerEditScreen}
        initialParams={{ customerId: 'c1111111-1111-1111-1111-111111111111' }}
      />
      <Stack.Screen
        name="FaceEnrollment"
        component={FaceEnrollmentScreen}
        initialParams={{
          customerId: 'c1111111-1111-1111-1111-111111111111',
          customerName: 'Suresh Patil',
          farmerCode: 'DF-2026-0042',
        }}
      />
      <Stack.Screen name="RfidAssignment" component={RfidAssignmentScreen} />
      <Stack.Screen name="Main" component={MainScreen} />
    </Stack.Navigator>
  );
};
