import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { Shift } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayHardwareHUD } from '../components/clay/ClayHardwareHUD';
import { ClayImages } from '../theme/assets';

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
  const isMorning = shift === 'MORNING';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header Card */}
      <ClayCard variant="elevated" style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.titleRow}>
              <Text style={typography.headlineMedium}>DFarm Collection Terminal</Text>
              <View style={[styles.shiftBadge, isMorning ? styles.morningBadge : styles.eveningBadge]}>
                <Text style={styles.shiftIcon}>{isMorning ? '☀️' : '🌙'}</Text>
                <Text style={styles.shiftText}>{shift} SHIFT</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                📍 Center: <Text style={styles.metaValue}>{centerName}</Text>
              </Text>
              <Text style={styles.metaBullet}>•</Text>
              <Text style={styles.metaText}>
                👤 Operator: <Text style={styles.metaValue}>{operatorName}</Text>
              </Text>
            </View>
          </View>

          {/* Sync & Logout Controls */}
          <View style={styles.headerRight}>
            <View
              style={[
                styles.syncBadge,
                {
                  backgroundColor: isSynced
                    ? 'rgba(76, 175, 80, 0.16)'
                    : 'rgba(255, 160, 0, 0.16)',
                  borderColor: isSynced ? colors.statusValid : colors.statusWarning,
                },
              ]}
            >
              <View
                style={[
                  styles.syncDot,
                  { backgroundColor: isSynced ? colors.statusValid : colors.statusWarning },
                ]}
              />
              <Text
                style={[
                  styles.syncBadgeText,
                  { color: isSynced ? colors.statusValid : colors.statusWarning },
                ]}
              >
                {isSynced ? 'SYNCED (ONLINE)' : `OFFLINE (${pendingSyncCount} PENDING)`}
              </Text>
            </View>

            <ClayButton
              title="SYNC NOW"
              onPress={onSyncNow}
              variant="outline"
              size="sm"
            />

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={onLogout}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutText}>🚪 LOGOUT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Hardware HUD Ribbon */}
        <View style={styles.hardwareDivider} />
        <View style={styles.hudSection}>
          <Text style={styles.hudTitle}>HARDWARE CONNECTIVITY STATUS:</Text>
          <ClayHardwareHUD />
        </View>
      </ClayCard>

      <View style={{ height: 24 }} />

      {/* Main Action Cards (Tactile 3D Cards) */}
      <View style={styles.cardsRow}>
        {/* NEW MILK INTAKE CARD */}
        <ClayCard
          variant="green"
          style={styles.actionCard}
          onPress={onStartCollection}
        >
          <View style={styles.actionCardInner}>
            <View style={styles.actionIconContainer}>
              <Image
                source={ClayImages.weightScale}
                style={styles.actionIconImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.actionCardContent}>
              <View style={styles.actionTagPill}>
                <Text style={styles.actionTagText}>PRIMARY ACTION</Text>
              </View>
              <Text style={[typography.headlineMedium, styles.actionTitle]}>
                NEW MILK INTAKE
              </Text>
              <Text style={styles.actionSubtitle}>
                Identify Customer &bull; Record Gross/Tare Weight &bull; Analyze Fat/SNF &bull; Calculate Rate &bull; Instant Receipt
              </Text>

              <View style={styles.methodChipsRow}>
                <View style={styles.methodChip}>
                  <Text style={styles.methodChipText}>💳 RFID Tap</Text>
                </View>
                <View style={styles.methodChip}>
                  <Text style={styles.methodChipText}>📸 Face AI</Text>
                </View>
                <View style={styles.methodChip}>
                  <Text style={styles.methodChipText}>🛡️ Supervisor</Text>
                </View>
              </View>
            </View>
          </View>
        </ClayCard>

        {/* SHIFT TRANSACTIONS & HISTORY CARD */}
        <ClayCard
          variant="elevated"
          style={styles.actionCard}
          onPress={onViewHistory}
        >
          <View style={styles.actionCardInner}>
            <View style={styles.actionIconContainer}>
              <Image
                source={ClayImages.emptyState}
                style={styles.actionIconImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.actionCardContent}>
              <View style={[styles.actionTagPill, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
                <Text style={[styles.actionTagText, { color: colors.textSecondary }]}>
                  SHIFT LEDGER
                </Text>
              </View>
              <Text style={[typography.headlineMedium, styles.actionTitle]}>
                SHIFT TRANSACTIONS
              </Text>
              <Text style={styles.actionSubtitle}>
                Session Records &bull; Shift Volume &bull; Average Quality &bull; Thermal Receipts &bull; Offline Journal
              </Text>

              <View style={styles.methodChipsRow}>
                <View style={[styles.methodChip, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                  <Text style={styles.methodChipText}>📊 Summary</Text>
                </View>
                <View style={[styles.methodChip, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                  <Text style={styles.methodChipText}>🖨️ Reprints</Text>
                </View>
                <View style={[styles.methodChip, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                  <Text style={styles.methodChipText}>🔍 Filter/Search</Text>
                </View>
              </View>
            </View>
          </View>
        </ClayCard>
      </View>

      <View style={{ height: 24 }} />

      {/* Terminal Footer Status Bar */}
      <ClayCard variant="subtle" style={styles.footerCard}>
        <View style={styles.footerRow}>
          <Text style={styles.footerInfoText}>
            ⚡ Canonical Unit: <Text style={styles.footerBold}>KG (Gross - Tare)</Text>
          </Text>
          <Text style={styles.footerInfoText}>
            💰 Pricing Engine: <Text style={styles.footerBold}>Half-Even Banker Rounding</Text>
          </Text>
          <Text style={styles.footerInfoText}>
            🔒 Terminal State: <Text style={styles.footerBold}>IDEMPOTENT ATOMIC JOURNAL</Text>
          </Text>
        </View>
      </ClayCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.clayBgDark,
  },
  content: {
    padding: 24,
  },
  headerCard: {
    padding: 20,
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
    minWidth: 280,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 6,
  },
  shiftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
  },
  morningBadge: {
    backgroundColor: 'rgba(255, 143, 0, 0.18)',
    borderColor: 'rgba(255, 143, 0, 0.45)',
  },
  eveningBadge: {
    backgroundColor: 'rgba(2, 136, 209, 0.18)',
    borderColor: 'rgba(2, 136, 209, 0.45)',
  },
  shiftIcon: {
    fontSize: 12,
  },
  shiftText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaValue: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  metaBullet: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncBadgeText: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(229, 57, 53, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
  },
  logoutText: {
    color: colors.statusError,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  hardwareDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 16,
  },
  hudSection: {
    gap: 8,
  },
  hudTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 20,
    flexWrap: 'wrap',
  },
  actionCard: {
    flex: 1,
    minWidth: 320,
    padding: 24,
  },
  actionCardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  actionIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  actionIconImage: {
    width: 64,
    height: 64,
  },
  actionCardContent: {
    flex: 1,
  },
  actionTagPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
  },
  actionTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.6,
  },
  actionTitle: {
    color: colors.textPrimary,
    marginBottom: 6,
  },
  actionSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 18,
    marginBottom: 12,
  },
  methodChipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  methodChip: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  methodChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  footerCard: {
    padding: 16,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  footerInfoText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  footerBold: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
