import React, { useState } from 'react';
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
  DFARM_RADIUS,
  ClayCard,
  ClayBadge,
} from '../../design-system';
import { useAuth } from '../../features/auth/useAuth';
import { useCollection } from '../../features/collection/useCollection';
import { useLedger } from '../../features/ledger/useLedger';
import { useProfile } from '../../features/profile/useProfile';
import { ShiftSunIcon, ShiftMoonIcon, NavBillsIcon, NavMilkIcon } from '../../assets/vectors/NavAssets';
import { DairyCenterIcon } from '../../assets/vectors/LocationAssets';
import { CowIcon } from '../../assets/vectors/CowIcon';
import { BuffaloIcon } from '../../assets/vectors/BuffaloIcon';
import { BiometricSuccessBadge } from '../../assets/vectors/BiometricAssets';
import { DairySwitchModal } from '../../components/DairySwitchModal';

export default function DashboardScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [switchModalVisible, setSwitchModalVisible] = useState(false);
  const { collections, monthlySummary } = useCollection();
  const { summary: khata } = useLedger();
  const { profile } = useProfile();

  const todayRecord = collections[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Top App Bar with Farmer Greeting & Biometric Badge */}
      <View style={styles.topBar}>
        <View style={styles.userColumn}>
          <Text style={styles.greetingText}>Namaste / नमस्कार,</Text>
          <Text style={styles.userName} numberOfLines={1}>
            {profile?.fullName || 'DFarm Producer'}
          </Text>
          <Pressable
            onPress={() => setSwitchModalVisible(true)}
            style={({ pressed }) => [styles.dairyTagRow, pressed && styles.pressed]}
          >
            <DairyCenterIcon size={16} />
            <Text style={styles.dairyTag} numberOfLines={1}>
              {profile?.dairyName || session?.dairyName || 'DFarm Cooperative Society'}
            </Text>
            <View style={styles.switchPill}>
              <Text style={styles.switchPillText}>बदला ▾</Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/(main)/profile/diagnostics')}
          style={({ pressed }) => [styles.diagBadgeBtn, pressed && styles.pressed]}
        >
          <ClayBadge label="Test Face" variant="orange" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Biometric Enrollment Action Banner (When Approved but not yet enrolled) */}
        {profile && !profile?.biometricStatus?.isEnrolled && (
          <ClayCard variant="highlight" style={styles.enrollmentBanner}>
            <View style={styles.enrollmentBannerHeader}>
              <View style={styles.enrollmentBannerIconBox}>
                <Text style={styles.enrollmentBannerEmoji}>📸</Text>
              </View>
              <View style={styles.enrollmentBannerTextBox}>
                <Text style={styles.enrollmentBannerTitle}>
                  Face Biometrics Not Enrolled / चेहरा नोंदणी अपूर्ण
                </Text>
                <Text style={styles.enrollmentBannerSubtitle}>
                  Please enroll your face (5 quality-checked samples) to enable seamless, instant
                  milk collection recognition at the center.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => router.push('/(main)/profile/update-face')}
              style={({ pressed }) => [styles.enrollmentActionBtn, pressed && styles.pressed]}
            >
              <Text style={styles.enrollmentActionBtnText}>
                Enroll Face Biometrics Now (५ नमुने) →
              </Text>
            </Pressable>
          </ClayCard>
        )}

        {/* Today's Milk Collection Card (Hero Clay Surface) */}
        <ClayCard variant="highlight" style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.shiftPill}>
              {todayRecord?.shift === 'EVENING' ? (
                <ShiftMoonIcon size={16} />
              ) : (
                <ShiftSunIcon size={16} />
              )}
              <Text style={styles.shiftPillText}>
                {todayRecord ? `${todayRecord.shift} SHIFT` : 'TODAY SHIFT'}
              </Text>
            </View>

            {todayRecord && (
              <ClayBadge
                label={todayRecord.animalType || (todayRecord as any).milkCategory || 'COW'}
                variant={(todayRecord.animalType || (todayRecord as any).milkCategory) === 'BUFFALO' ? 'buffalo' : 'cow'}
                icon={
                  (todayRecord.animalType || (todayRecord as any).milkCategory) === 'BUFFALO' ? (
                    <BuffaloIcon size={14} />
                  ) : (
                    <CowIcon size={14} />
                  )
                }
              />
            )}
          </View>

          {todayRecord ? (
            <>
              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Milk Volume</Text>
                  <Text style={styles.metricValueLarge}>
                    {((todayRecord.quantityLiters ?? (todayRecord as any).weightLiters ?? 0)).toFixed(1)}
                    <Text style={styles.unitText}> L</Text>
                  </Text>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Today's Value</Text>
                  <Text style={styles.metricValueLarge}>
                    ₹{((todayRecord.totalAmount ?? 0)).toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Quality Indicators: FAT & SNF */}
              <View style={styles.qualityContainer}>
                <View style={styles.qualityPill}>
                  <Text style={styles.qualityLabel}>FAT / फॅट</Text>
                  <Text style={styles.qualityValue}>
                    {((todayRecord.fatPercentage ?? (todayRecord as any).fat ?? 0)).toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.qualityPill}>
                  <Text style={styles.qualityLabel}>SNF / एस.एन.एफ</Text>
                  <Text style={styles.qualityValue}>
                    {((todayRecord.snfPercentage ?? (todayRecord as any).snf ?? 0)).toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.qualityPill}>
                  <Text style={styles.qualityLabel}>RATE / दर</Text>
                  <Text style={styles.qualityValue}>
                    ₹{((todayRecord.ratePerLiter ?? (todayRecord as any).appliedRatePerLiter ?? 0)).toFixed(2)}/L
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.emptyToday}>
              <Text style={styles.emptyTodayTitle}>No Milk Collection Recorded Today</Text>
              <Text style={styles.emptyTodayText}>
                Deliver your milk to your local collection center. Your shift pour and quality
                metrics will reflect here automatically.
              </Text>
            </View>
          )}
        </ClayCard>

        {/* Khata / Financial Summary Card */}
        <Pressable
          onPress={() => router.push('/(main)/ledger')}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <ClayCard variant="raised" style={styles.khataCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardSectionTitle}>Khata Ledger Balance / खाते शिल्लक</Text>
              <ClayBadge
                label={(khata?.currentBalance ?? 0) >= 0 ? 'Payable to You' : 'Due to Dairy'}
                variant={(khata?.currentBalance ?? 0) >= 0 ? 'success' : 'error'}
              />
            </View>

            <Text style={styles.balanceAmount}>
              ₹
              {(khata?.currentBalance ?? 0).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>

            <View style={styles.khataStatsRow}>
              <View style={styles.khataStatCol}>
                <Text style={styles.khataSubLabel}>Total Milk Earnings</Text>
                <Text style={styles.khataSubValueCredit}>
                  +₹
                  {(khata?.totalMilkEarnings ?? 0).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.khataStatCol}>
                <Text style={styles.khataSubLabel}>Feed Deductions</Text>
                <Text style={styles.khataSubValueDebit}>
                  -₹
                  {(khata?.totalDeductions ?? 0).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
            </View>
          </ClayCard>
        </Pressable>

        {/* Monthly Performance Summary */}
        <ClayCard variant="raised" style={styles.monthlyCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSectionTitle}>
              {monthlySummary?.monthYear ||
                new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}{' '}
              Performance
            </Text>
            <ClayBadge
              label={`${monthlySummary?.transactionCount ?? 0} Pours`}
              variant="neutral"
            />
          </View>

          <View style={styles.monthlyGrid}>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Total Volume</Text>
              <Text style={styles.gridCellValue}>
                {(monthlySummary?.totalLiters ?? 0).toFixed(1)} L
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Avg Fat / SNF</Text>
              <Text style={styles.gridCellValue}>
                {(monthlySummary?.avgFat ?? 0).toFixed(1)}% /{' '}
                {(monthlySummary?.avgSnf ?? 0).toFixed(1)}%
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Cow Volume</Text>
              <Text style={styles.gridCellValue}>
                {(monthlySummary?.cowLiters ?? 0).toFixed(1)} L
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridCellLabel}>Buffalo Volume</Text>
              <Text style={styles.gridCellValue}>
                {(monthlySummary?.buffaloLiters ?? 0).toFixed(1)} L
              </Text>
            </View>
          </View>
        </ClayCard>

        {/* Quick Actions Grid */}
        <View style={styles.quickActionsRow}>
          <Pressable
            onPress={() => router.push('/(main)/collection')}
            style={({ pressed }) => [styles.quickActionBox, pressed && styles.pressed]}
          >
            <ClayCard variant="raised" style={styles.quickActionInner}>
              <NavMilkIcon size={26} color={DFARM_COLORS.primaryOrange} />
              <Text style={styles.quickActionTitle}>Shift History</Text>
            </ClayCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/bills')}
            style={({ pressed }) => [styles.quickActionBox, pressed && styles.pressed]}
          >
            <ClayCard variant="raised" style={styles.quickActionInner}>
              <NavBillsIcon size={26} color={DFARM_COLORS.primaryOrange} />
              <Text style={styles.quickActionTitle}>Statements</Text>
            </ClayCard>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(main)/profile/diagnostics')}
            style={({ pressed }) => [styles.quickActionBox, pressed && styles.pressed]}
          >
            <ClayCard variant="raised" style={styles.quickActionInner}>
              <BiometricSuccessBadge size={26} />
              <Text style={styles.quickActionTitle}>Face Sensor</Text>
            </ClayCard>
          </Pressable>
        </View>
      </ScrollView>

      <DairySwitchModal
        visible={switchModalVisible}
        onClose={() => setSwitchModalVisible(false)}
      />
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
  dairyTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dairyTag: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '600',
    flex: 1,
  },
  switchPill: {
    backgroundColor: '#FFE9D6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  switchPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: DFARM_COLORS.primaryOrange,
  },
  diagBadgeBtn: {
    alignSelf: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
  },
  enrollmentBanner: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.primaryOrange,
  },
  enrollmentBannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  enrollmentBannerIconBox: {
    width: 38,
    height: 38,
    borderRadius: DFARM_RADIUS.md,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrollmentBannerEmoji: {
    fontSize: 20,
  },
  enrollmentBannerTextBox: {
    flex: 1,
  },
  enrollmentBannerTitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginBottom: 4,
  },
  enrollmentBannerSubtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 16,
  },
  enrollmentActionBtn: {
    backgroundColor: DFARM_COLORS.primaryOrange,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: DFARM_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrollmentActionBtnText: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: '#FFFFFF',
    fontWeight: '700',
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: DFARM_RADIUS.pill,
    borderWidth: 1,
    borderColor: '#F7D6C1',
    gap: 6,
  },
  shiftPillText: {
    ...DFARM_TYPOGRAPHY.badge,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  metricValueLarge: {
    ...DFARM_TYPOGRAPHY.numberDisplay,
    color: DFARM_COLORS.primaryText,
  },
  unitText: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.secondaryText,
  },
  metricDivider: {
    width: 1.5,
    height: 38,
    backgroundColor: DFARM_COLORS.border,
    marginHorizontal: 14,
  },
  qualityContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F7D6C1',
  },
  qualityPill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: DFARM_RADIUS.sm,
    borderWidth: 1,
    borderColor: '#F7D6C1',
    alignItems: 'center',
  },
  qualityLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontSize: 10,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  qualityValue: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
  },
  emptyToday: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyTodayTitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginBottom: 4,
  },
  emptyTodayText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
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
    ...DFARM_TYPOGRAPHY.numberDisplay,
    color: DFARM_COLORS.primaryOrange,
    marginVertical: 4,
  },
  khataStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
  },
  khataStatCol: {
    flex: 1,
  },
  khataSubLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  khataSubValueCredit: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: '#2E7D32',
    marginTop: 2,
  },
  khataSubValueDebit: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: '#D32F2F',
    marginTop: 2,
  },
  monthlyCard: {
    marginBottom: 16,
    padding: 18,
  },
  monthlyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  gridCell: {
    flexBasis: '47%',
    backgroundColor: DFARM_COLORS.surfaceInset,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: DFARM_RADIUS.sm,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  gridCellLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  gridCellValue: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionBox: {
    flex: 1,
  },
  quickActionInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  quickActionTitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
});
