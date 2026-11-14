import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { clearOfflineCache } from '../../storage/cache';
import { useNetwork } from '../../context/NetworkContext';

export const SettingsScreen: React.FC = () => {
  const { isOnline } = useNetwork();
  const [clearing, setClearing] = useState(false);

  const handleClearCache = async () => {
    Alert.alert(
      'Clear Offline Cache',
      'This will delete all locally cached milk deliveries, ledger statements, and feed receipts. Data will re-sync when online.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await clearOfflineCache();
              Alert.alert('Cache Cleared', 'Local offline data cache has been wiped.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to clear cache');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Connectivity Status */}
        <Card variant="flat" style={styles.card}>
          <View style={styles.row}>
            <View>
              <Text style={styles.title}>Network Status</Text>
              <Text style={styles.subtitle}>
                {isOnline ? 'Connected to DFarm Cloud Server' : 'Device is working in Offline Mode'}
              </Text>
            </View>
            <Badge
              label={isOnline ? 'Online' : 'Offline'}
              variant={isOnline ? 'success' : 'danger'}
              size="md"
            />
          </View>
        </Card>

        {/* Offline Cache & Storage Management */}
        <Card variant="flat" style={styles.card}>
          <Text style={styles.title}>Offline Storage & Caching</Text>
          <Text style={styles.subtitle}>
            DFarm caches read-only summaries of your milk intake, passbook ledger, and invoices to allow fast viewing even when there is no cellular reception in rural areas.
          </Text>

          <View style={styles.cacheRuleBox}>
            <Text style={styles.ruleTitle}>📌 Read-Only Offline Guarantees</Text>
            <Text style={styles.ruleDesc}>
              • The customer mobile app operates in strict read-only mode offline.{'\n'}
              • No offline financial alteration or ledger manipulation is permitted.{'\n'}
              • Server remains the single authoritative source of truth.
            </Text>
          </View>

          <Button
            title="Clear Cached Offline Data"
            variant="outline"
            onPress={handleClearCache}
            loading={clearing}
            style={styles.clearBtn}
          />
        </Card>

        {/* DPDP Privacy Policy */}
        <Card variant="flat" style={styles.card}>
          <Text style={styles.title}>Digital Personal Data Protection (DPDP)</Text>
          <Text style={styles.subtitle}>
            Your data is stored securely under ISO 27001 / DPDP principles:
          </Text>
          <Text style={styles.policyBullet}>• Zero Biometric Leakage: Biometric templates are never sent or stored on customer phones.</Text>
          <Text style={styles.policyBullet}>• Bank Number Masking: Bank account details are masked (XXXX-XXXX-1234).</Text>
          <Text style={styles.policyBullet}>• Session Tokens: High-security tokens stored in hardware-backed SecureStore keystores.</Text>
        </Card>

        {/* Software Build Information */}
        <Card variant="flat" style={styles.card}>
          <Text style={styles.title}>Application Build</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Name</Text>
            <Text style={styles.infoVal}>DFarm Farmer Mobile</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoVal}>1.0.0 (Phase 18)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Target Platforms</Text>
            <Text style={styles.infoVal}>Android 8.0+ / iOS 15.0+</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Architecture</Text>
            <Text style={styles.infoVal}>React Native 0.76 + Expo 52</Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  cacheRuleBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
  },
  ruleTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  ruleDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  clearBtn: {
    marginTop: 4,
  },
  policyBullet: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  infoVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
