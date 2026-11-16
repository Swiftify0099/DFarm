import React from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../features/auth/useAuth';
import { DFARM_COLORS } from '../design-system/theme';

export default function Index() {
  const { session, isLoadingSession } = useAuth();

  if (isLoadingSession) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: DFARM_COLORS.primaryCream,
        }}
      >
        <ActivityIndicator size="large" color={DFARM_COLORS.primaryOrange} />
      </View>
    );
  }

  if (session?.token) {
    if (session.status === 'PENDING_APPROVAL') {
      return <Redirect href="/(onboarding)/pending-approval" />;
    }
    return <Redirect href="/(main)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
