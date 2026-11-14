/**
 * DFarm Registration App - App Navigator
 * Complete parity with Navigation.kt & NavigationKeys.kt
 */

import React from 'react';
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

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator
      initialRouteName={isLoggedIn ? 'CustomerList' : 'Login'}
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="CustomerList" component={CustomerListScreen} />
      <Stack.Screen name="RegistrationWizard" component={RegistrationWizardScreen} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="CustomerEdit" component={CustomerEditScreen} />
      <Stack.Screen name="FaceEnrollment" component={FaceEnrollmentScreen} />
      <Stack.Screen name="RfidAssignment" component={RfidAssignmentScreen} />
      <Stack.Screen name="Main" component={MainScreen} />
    </Stack.Navigator>
  );
};
