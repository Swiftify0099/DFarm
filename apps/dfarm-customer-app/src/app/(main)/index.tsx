import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  ClayCard,
  ClayBadge,
} from '../../design-system';
import { useCollection } from '../../features/collection/useCollection';
import { useLedger } from '../../features/ledger/useLedger';
import { useProfile } from '../../features/profile/useProfile';

export default function DashboardScreen() {
  const router = useRouter();
  const { collections, monthlySummary } = useCollection();
  const { summary: khata } = useLedger();
  const { profile } = useProfile();

  const todayRecord = collections[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <View style={styles.userColumn}>
          <Text style={styles.greetingText}>Namaste,</Text>
          <Text style={styles.userName} numberOfLines={1}>
            {profile?.fullName || 'Vitthal Dnyandeo Patil'}
          </Text>
          <Text style={styles.dairyTag} numberOfLines={1}>
            🏛️ {profile?.dairyName || 'Shree Krishna Sahakari Dudh Sanstha'}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push('/(main)/profile/diagnostics')}
          style={styles.diagBadgeBtn}
        >
          <ClayBadge label="Test Face" variant="orange" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Today's Milk Collection Card (Hero Clay Surface) */}
        <ClayCard variant="highlight" style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.shiftPill}>
              <Text style={styles.shiftPillText}>
                {todayRecord ? `☀️ ${todayRecord.shift} SHIFT` : '☀️ TODAY SHIFT'}
              </Text>
            </View>
            <ClayBadge
              label={todayRecord?.animalType || 'COW MILK'}
              variant={todayRecord?.animalType === 'BUFFALO' ? 'buffalo' : 'cow'}
            />
          </View>

          {todayRecord ? (
            <>
              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Quantity</Text>
                  <Text style={styles.metricValueLarge}>
                    {todayRecord.quantityLiters.toFixed(1)}
                    <Text style={styles.unitText}> L</Text>
                  </Text>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Today's Value</Text>
                  <Text style={styles.metricValueLarge}>
                    ₹{todayRecord.totalAmount.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Quality Indicators: FAT & SNF */}
              <View style={styles.qualityContainer}>
                <View style={styles.qualityPill}>
                  <Text style={styles.qualityLabel}>FAT</Text>
                  <Text style={styles.qualityValue}>{todayRecord.fatPercentage}%</Text>
                </View>
                <View style={styles.qualityPill}>
                  <Text style={styles.qualityLabel}>SNF</Text>
                  <Text style={styles.qualityValue}>{todayRecord.snfPercentage}%</Text>
                </View>
                <View style={styles.qualityPill}>
                  <Text style={styles.qualityLabel}>RATE</Text>
                  <Text style={styles.qualityValue}>₹{todayRecord.ratePerLiter}/L</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.emptyToday}>
              <Text style={styles.emptyTodayText}>
                Morning collection starts at 06:00 AM
              </Text>
            </View>
          )}
        </ClayCard>

        {/* Khata / Financial Summary Card */}
        <Pressable onPress={() => router.push('/(main)/ledger')}>
          <ClayCard variant="raised" style={styles.khataCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardSectionTitle}>Khata Ledger Balance</Text>
              <ClayBadge label="Payable to You" variant="success" />
            </View>

            <Text style={styles.balanceAmount}>
              ₹{khata?.currentBalance.toLocaleString('en-IN') || '12,480.00'}
            </Text>

            <View style={styles.khataStatsRow}>
              <View>
                <Text style={styles.khataSubLabel}>Total Milk Earnings</Text>
                <Text style={styles.khataSubValue}>
                  ₹{khata?.totalMilkEarnings.toLocaleString('en-IN') || '28,530.00'}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View>
                <Text style={styles.khataSubLabel}>Feed Deductions</Text>
                <Text style={styles.khataSubValue}>
                  ₹{khata?.totalDeductions.toLocaleString('en-IN') || '16,050.00'}
                </Text>
              </View>
            </View>
          </ClayCard>
        </Pressable>

        {/* Monthly Performance Summary */}
        <ClayCard variant="raised" style={styles.monthlyCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSectionTitle}>
              {monthlySummary?.monthYear || 'November 2026'} Performance
            </Text>
            <Text style={styles.txCount}>
              {monthlySummary?.transactionCount || 28} Collections
            </Text>
          </View>

          <View style={styles.monthlyGrid}>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Total Volume</Text>
              <Text style={styles.gridCellValue}>
                {monthlySummary?.totalLiters || 382.4} L
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Avg Fat / SNF</Text>
              <Text style={styles.gridCellValue}>
                {monthlySummary?.avgFat || 4.85}% / {monthlySummary?.avgSnf || 8.78}%
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Cow Volume</Text>
              <Text style={styles.gridCellValue}>
                {monthlySummary?.cowLiters || 242.0} L
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Buffalo Volume</Text>
              <Text style={styles.gridCellValue}>
                {monthlySummary?.buffaloLiters || 140.4} L
              </Text>
            </View>
          </View>
        </ClayCard>

        {/* Quick Actions Grid */}
        <View style={styles.quickActionsRow}>
          <Pressable
            onPress={() => router.push('/(main)/collection')}
            style={styles.quickActionBox}
          >
            <ClayCard variant="raised" style={styles.quickActionInner}>
              <Text style={styles.quickActionIcon}>📋</Text>
              <Text style={styles.quickActionTitle}>Shift History</Text>
            </ClayCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/bills')}
            style={styles.quickActionBox}
          >
            <ClayCard variant="raised" style={styles.quickActionInner}>
              <Text style={styles.quickActionIcon}>🧾</Text>
              <Text style={styles.quickActionTitle}>Statements</Text>
            </ClayCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/profile/diagnostics')}
            style={styles.quickActionBox}
          >
            <ClayCard variant="raised" style={styles.quickActionInner}>
              <Text style={styles.quickActionIcon}>🔍</Text>
              <Text style={styles.quickActionTitle}>Biometrics</Text>
            </ClayCard>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DFARM_COLORS.border,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  userColumn: {
    flex: 1,
    marginRight: 12,
  },
  greetingText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  userName: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryText,
  },
  dairyTag: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    marginTop: 2,
    fontWeight: '600',
  },
  diagBadgeBtn: {
    alignSelf: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 84,
  },
  heroCard: {
    marginBottom: 16,
    padding: 18,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  shiftPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  shiftPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 4,
  },
  metricValueLarge: {
    ...DFARM_TYPOGRAPHY.numberDisplay,
  },
  unitText: {
    fontSize: 18,
    color: DFARM_COLORS.primaryText,
  },
  metricDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E8D0C0',
  },
  qualityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
  },
  qualityPill: {
    flex: 1,
    alignItems: 'center',
  },
  qualityLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  qualityValue: {
    fontSize: 14,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
  },
  emptyToday: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyTodayText: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
  },
  khataCard: {
    marginBottom: 16,
    padding: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardSectionTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: DFARM_COLORS.success,
    marginBottom: 14,
  },
  khataStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
  },
  khataSubLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  khataSubValue: {
    fontSize: 14,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  monthlyCard: {
    marginBottom: 16,
    padding: 18,
  },
  txCount: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  monthlyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  gridCell: {
    width: '50%',
    paddingVertical: 8,
  },
  gridCellLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  gridCellValue: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quickActionBox: {
    flex: 1,
    marginHorizontal: 4,
  },
  quickActionInner: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  quickActionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  quickActionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
});
