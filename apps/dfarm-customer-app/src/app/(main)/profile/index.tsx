import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  ClayCard,
  ClayBadge,
  ClayButton,
  ClayHeader,
} from '../../../design-system';
import { useProfile } from '../../../features/profile/useProfile';
import { useAuth } from '../../../features/auth/useAuth';
import { BiometricSuccessBadge } from '../../../assets/vectors/BiometricAssets';
import { DairyCenterIcon } from '../../../assets/vectors/LocationAssets';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const { logout, session, memberships } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const initialLetter = profile?.fullName ? profile.fullName.trim().charAt(0).toUpperCase() : 'P';

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Account & Biometrics"
        subtitle="शेतकरी प्रोफाइल व बायोमेट्रिक व्यवस्थापन"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Farmer Identity Card */}
        <ClayCard variant="raised" style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              <View pointerEvents="none" style={styles.specular} />
              <Text style={styles.avatarText}>{initialLetter}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.farmerName}>
                {profile?.fullName || 'DFarm Registered Producer'}
              </Text>
              {profile?.mobileNumber && (
                <Text style={styles.farmerPhone}>{profile.mobileNumber}</Text>
              )}
              <ClayBadge label="Verified Producer" variant="success" />
            </View>
          </View>

          <View style={styles.metaBox}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Customer ID</Text>
              <Text style={styles.metaValueMono} numberOfLines={1}>
                {profile?.id || 'Active'}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Affiliated Dairy</Text>
              <Text style={styles.metaValue}>
                {profile?.dairyName || 'Cooperative Milk Center'}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Village</Text>
              <Text style={styles.metaValue}>{profile?.village || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Supply Animals</Text>
              <Text style={styles.metaValue}>
                {profile?.milkSupplyType === 'COW'
                  ? 'Cow (गाय)'
                  : profile?.milkSupplyType === 'BUFFALO'
                  ? 'Buffalo (म्हैस)'
                  : 'Cow & Buffalo (दोन्ही)'}
              </Text>
            </View>
          </View>
        </ClayCard>

        {/* Multi-Dairy Memberships Card */}
        <ClayCard variant="raised" style={styles.settingsCard}>
          <View style={styles.bioHeader}>
            <View style={styles.bioTitleRow}>
              <DairyCenterIcon size={24} />
              <Text style={styles.sectionTitle}>Dairy Memberships / डेअरी खाती</Text>
            </View>
            <ClayBadge
              label={`${memberships?.length || 1} Registered`}
              variant="orange"
            />
          </View>
          <Text style={styles.bioDescription}>
            Active: {profile?.dairyName || session?.dairyName || 'Cooperative Milk Center'}. Each dairy has an isolated passbook, ledger, and approval lifecycle.
          </Text>
          <View style={styles.bioActionRow}>
            <ClayButton
              title="Switch Dairy / डेअरी बदला"
              onPress={() => router.push('/(auth)/select-dairy')}
              variant="secondary"
              size="md"
              style={styles.bioBtn}
            />
            <ClayButton
              title="+ Add New Dairy"
              onPress={() => router.push('/(onboarding)/dairy-discovery')}
              variant="outline"
              size="md"
              style={styles.bioBtn}
            />
          </View>
        </ClayCard>

        {/* Biometrics & Diagnostics Management */}
        <ClayCard variant="highlight" style={styles.bioCard}>
          <View style={styles.bioHeader}>
            <View style={styles.bioTitleRow}>
              <BiometricSuccessBadge size={28} />
              <Text style={styles.sectionTitle}>Face Biometrics</Text>
            </View>
            <ClayBadge
              label={profile?.biometricStatus?.version || 'YuNet + SFace INT8'}
              variant="orange"
            />
          </View>

          <Text style={styles.bioDescription}>
            Your facial biometric template is enrolled and encrypted using OpenCV YuNet (Face
            Detection) and SFace INT8 (128-D Feature Extraction) for contactless collection.
          </Text>

          <View style={styles.bioActionRow}>
            <ClayButton
              title="Test Face Sensor"
              onPress={() => router.push('/(main)/profile/diagnostics')}
              variant="secondary"
              size="md"
              style={styles.bioBtn}
            />

            <ClayButton
              title="Update Biometrics"
              onPress={() => router.push('/(main)/profile/update-face')}
              variant="outline"
              size="md"
              style={styles.bioBtn}
            />
          </View>
        </ClayCard>

        {/* Bank Beneficiary Details Card */}
        <ClayCard variant="raised" style={styles.settingsCard}>
          <View style={styles.bioHeader}>
            <Text style={styles.sectionTitle}>Bank Beneficiary / बँक खाते</Text>
            <ClayBadge
              label={
                profile?.bankDetails?.accountNumber || profile?.bankDetails?.accountNumberMask
                  ? 'Details Submitted'
                  : 'Action Required'
              }
              variant={
                profile?.bankDetails?.accountNumber || profile?.bankDetails?.accountNumberMask
                  ? 'success'
                  : 'orange'
              }
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Bank Name</Text>
            <Text style={styles.settingValue}>
              {profile?.bankDetails?.bankName || 'Not Registered'}
            </Text>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Account Number</Text>
            <Text style={styles.settingValueMono}>
              {profile?.bankDetails?.accountNumberMask ||
                (profile?.bankDetails?.accountNumber
                  ? (String(profile.bankDetails.accountNumber).startsWith('XXXX')
                      ? profile.bankDetails.accountNumber
                      : `XXXX-XXXX-${String(profile.bankDetails.accountNumber).slice(-4)}`)
                  : 'Not Provided')}
            </Text>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>IFSC Code</Text>
            <Text style={styles.settingValueMono}>
              {profile?.bankDetails?.ifscCode || 'Not Provided'}
            </Text>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Account Holder</Text>
            <Text style={styles.settingValue}>
              {profile?.bankDetails?.accountHolderName || profile?.fullName || 'Not Provided'}
            </Text>
          </View>

          <Text style={styles.bankNote}>
            🔒 Payout disbursements are deposited directly to this registered bank account via double-entry subledger reconciliation.
          </Text>
        </ClayCard>

        {/* System Settings & Logout */}
        <ClayCard variant="raised" style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Application Settings</Text>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Language / भाषा</Text>
            <Text style={styles.settingValue}>English (मराठी)</Text>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Platform Build</Text>
            <Text style={styles.settingValue}>DFarm v1.0.0 (Expo SDK 58)</Text>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Biometric Architecture</Text>
            <Text style={styles.settingValue}>OpenCV YuNet + SFace INT8 (ARM64)</Text>
          </View>

          <ClayButton
            title="Secure Logout / लॉगआउट"
            onPress={handleLogout}
            variant="danger"
            style={styles.logoutBtn}
          />
        </ClayCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
    gap: 16,
  },
  profileCard: {
    padding: 18,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 14,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: DFARM_COLORS.primaryOrange,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarText: {
    ...DFARM_TYPOGRAPHY.h1,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  specular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  farmerName: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryText,
  },
  farmerPhone: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  metaBox: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: DFARM_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    padding: 12,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  metaValue: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  metaValueMono: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryOrange,
    maxWidth: '60%',
  },
  bioCard: {
    padding: 18,
  },
  bioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bioTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
  },
  bioDescription: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 18,
    marginBottom: 14,
  },
  bioActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  bioBtn: {
    flex: 1,
  },
  settingsCard: {
    padding: 18,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DFARM_COLORS.border,
  },
  settingLabel: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.primaryText,
  },
  settingValue: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '600',
    color: DFARM_COLORS.secondaryText,
  },
  settingValueMono: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryOrange,
  },
  bankNote: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 12,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  logoutBtn: {
    marginTop: 20,
  },
});
