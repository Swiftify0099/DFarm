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
  ClayButton,
  ClayHeader,
} from '../../../design-system';
import { useProfile } from '../../../features/profile/useProfile';
import { useAuth } from '../../../features/auth/useAuth';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader title="Account & Biometrics" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Farmer Identity Card */}
        <ClayCard variant="raised" style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {profile?.fullName.charAt(0) || 'V'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.farmerName}>
                {profile?.fullName || 'Vitthal Dnyandeo Patil'}
              </Text>
              <Text style={styles.farmerPhone}>
                {profile?.mobileNumber || '+91 98224 55678'}
              </Text>
              <ClayBadge label="Active Producer" variant="success" />
            </View>
          </View>

          <View style={styles.metaBox}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Customer UUID</Text>
              <Text style={styles.metaValueMono} numberOfLines={1}>
                {profile?.id || 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Affiliated Dairy</Text>
              <Text style={styles.metaValue}>{profile?.dairyName}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Village</Text>
              <Text style={styles.metaValue}>{profile?.village}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Supply Animals</Text>
              <Text style={styles.metaValue}>
                {profile?.milkSupplyType === 'COW'
                  ? 'Cow'
                  : profile?.milkSupplyType === 'BUFFALO'
                  ? 'Buffalo'
                  : 'Cow & Buffalo'}
              </Text>
            </View>
          </View>
        </ClayCard>

        {/* Biometrics & Diagnostics Management */}
        <ClayCard variant="highlight" style={styles.bioCard}>
          <View style={styles.bioHeader}>
            <Text style={styles.sectionTitle}>Face Biometrics</Text>
            <ClayBadge
              label={profile?.biometricStatus.version || 'v1.0 (YuNet + SFace)'}
              variant="orange"
            />
          </View>

          <Text style={styles.bioDescription}>
            Your facial biometric template is enrolled using OpenCV YuNet (Face
            Detection) and SFace INT8 (128-D Face Recognition).
          </Text>

          <View style={styles.bioActionRow}>
            <ClayButton
              title="Test My Face (Diagnostics)"
              onPress={() => router.push('/(main)/profile/diagnostics')}
              variant="secondary"
              style={styles.bioBtn}
            />

            <ClayButton
              title="Update Biometric Photo"
              onPress={() => router.push('/(main)/profile/update-face')}
              variant="outline"
              style={styles.bioBtn}
            />
          </View>
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
            <Text style={styles.settingLabel}>Target Architecture</Text>
            <Text style={styles.settingValue}>Android 14+ (ARM64 / x86_64)</Text>
          </View>

          <ClayButton
            title="Secure Logout"
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
    paddingTop: 12,
    paddingBottom: 84,
  },
  profileCard: {
    padding: 18,
    marginBottom: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: DFARM_COLORS.peach,
    borderWidth: 2,
    borderColor: DFARM_COLORS.primaryOrange,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: DFARM_COLORS.primaryOrange,
  },
  profileInfo: {
    flex: 1,
  },
  farmerName: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryText,
    marginBottom: 2,
  },
  farmerPhone: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 6,
  },
  metaBox: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  metaValue: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  metaValueMono: {
    fontSize: 11,
    fontWeight: '600',
    color: DFARM_COLORS.primaryOrange,
    maxWidth: '55%',
  },
  bioCard: {
    padding: 18,
    marginBottom: 16,
  },
  bioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
    gap: 8,
  },
  bioBtn: {
    marginBottom: 6,
  },
  settingsCard: {
    padding: 18,
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DFARM_COLORS.border,
  },
  settingLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  settingValue: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  logoutBtn: {
    marginTop: 18,
  },
});
