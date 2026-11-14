import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Shift } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';

interface DashboardScreenProps {
  operatorName: string;
  centerName: string;
  shift: Shift;
  pendingSyncCount: number;
  onStartCollection: () => void;
  onViewHistory: () => void;
  onSyncNow: () => void;
  onLogout: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  operatorName,
  centerName,
  shift,
  pendingSyncCount,
  onStartCollection,
  onViewHistory,
  onSyncNow,
  onLogout,
}) => {
  const isSynced = pendingSyncCount === 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={typography.headlineMedium}>DFarm Collection Terminal</Text>
          <Text style={[typography.bodyMedium, { marginTop: 4 }]}>
            Center: {centerName} | Shift: {shift} | Operator: {operatorName}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <View
            style={[
              styles.syncBadge,
              {
                backgroundColor: isSynced
                  ? 'rgba(76, 175, 80, 0.2)'
                  : 'rgba(255, 160, 0, 0.2)',
                borderColor: isSynced ? colors.statusValid : colors.statusWarning,
              },
            ]}
          >
            <Text
              style={[
                styles.syncBadgeText,
                { color: isSynced ? colors.statusValid : colors.statusWarning },
              ]}
            >
              {isSynced ? 'SYNCED (ONLINE)' : `OFFLINE (${pendingSyncCount} PENDING)`}
            </Text>
          </View>

          <Button
            title="SYNC NOW"
            onPress={onSyncNow}
            variant="outline"
            style={styles.syncBtn}
            textStyle={{ fontSize: 13 }}
          />

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={onLogout}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutText}>LOGOUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 32 }} />

      {/* Action Cards */}
      <View style={styles.cardsRow}>
        <Card
          style={styles.actionCard}
          backgroundColor={colors.primaryGreen}
          onPress={onStartCollection}
        >
          <View style={styles.cardInner}>
            <Text style={[typography.headlineMedium, { color: colors.textPrimary, textAlign: 'center' }]}>
              NEW MILK INTAKE
            </Text>
            <View style={{ height: 8 }} />
            <Text style={[typography.bodyMedium, { color: colors.textPrimary, textAlign: 'center' }]}>
              RFID Tap / Supervisor Manual / Face
            </Text>
          </View>
        </Card>

        <Card
          style={styles.actionCard}
          backgroundColor={colors.surfaceDark}
          onPress={onViewHistory}
        >
          <View style={styles.cardInner}>
            <Text style={[typography.headlineMedium, { color: colors.textPrimary, textAlign: 'center' }]}>
              SHIFT TRANSACTIONS
            </Text>
            <View style={{ height: 8 }} />
            <Text style={[typography.bodyMedium, { color: colors.textSecondary, textAlign: 'center' }]}>
              Shift Summary, Receipts & History
            </Text>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  content: {
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerLeft: {
    flex: 1,
    minWidth: 260,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  syncBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  syncBadgeText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  syncBtn: {
    height: 38,
    paddingHorizontal: 12,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutText: {
    color: colors.statusError,
    fontWeight: 'bold',
    fontSize: 13,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 24,
    flexWrap: 'wrap',
  },
  actionCard: {
    flex: 1,
    minWidth: 280,
    minHeight: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
