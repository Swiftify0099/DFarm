import React from 'react';
import { Redirect } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useAuth } from '../features/auth/useAuth';
import { DFARM_COLORS, DFARM_TYPOGRAPHY } from '../design-system/theme';
import { DFarmBrandMark } from '../assets/vectors/DFarmBrandMark';

export default function Index() {
  const { session, isLoadingSession } = useAuth();

  if (isLoadingSession) {
    return (
      <View style={styles.container}>
        <View style={styles.brandBox}>
          <DFarmBrandMark width={180} height={44} />
          <View style={styles.spinnerRow}>
            <ActivityIndicator size="small" color={DFARM_COLORS.primaryOrange} />
            <Text style={styles.loadingText}>Connecting to DFarm Network...</Text>
          </View>
        </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DFARM_COLORS.primaryCream,
    paddingHorizontal: 24,
  },
  brandBox: {
    alignItems: 'center',
    gap: 20,
  },
  spinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  loadingText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    fontWeight: '500',
  },
});
