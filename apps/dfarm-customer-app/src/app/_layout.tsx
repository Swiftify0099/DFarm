import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { DFARM_COLORS } from '../design-system/theme';

// Prevent native splash screen from auto-hiding before React is ready
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore in web or environments where splash screen auto-hide is unhandled
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: DFARM_COLORS.primaryCream },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(auth)/verify-otp" />
          <Stack.Screen name="(onboarding)/dairy-discovery" />
          <Stack.Screen name="(onboarding)/register" />
          <Stack.Screen name="(onboarding)/face-enroll" />
          <Stack.Screen name="(onboarding)/pending-approval" />
          <Stack.Screen name="(main)" />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
