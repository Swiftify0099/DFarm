/**
 * DFarm Registration App - Top Level Root Component
 * Parity with MainActivity.kt & Theme.kt
 */

import React from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/auth/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';

const defaultLinking = {
  prefixes: ['dfarm-registration://', '/'],
  config: {
    screens: {
      Login: '',
      CustomerList: 'customers',
      RegistrationWizard: 'register',
      CustomerDetail: 'customers/:customerId',
      CustomerEdit: 'customers/:customerId/edit',
      FaceEnrollment: 'face-enrollment',
      RfidAssignment: 'rfid',
      Main: 'main',
    },
  },
};

export default function App() {
  const isScreenQuery =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location &&
    (window.location.search.includes('screen=') || window.location.hash.includes('screen='));

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer linking={isScreenQuery ? undefined : defaultLinking}>
          <StatusBar style="dark" />
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
