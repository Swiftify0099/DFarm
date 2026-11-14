import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { OfflineBanner } from '../../components/common/OfflineBanner';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { profileApi, CustomerProfileData } from '../../api/profile.api';
import { formatDateShort } from '../../utils/date';

export interface ProfileScreenProps {
  navigation: any;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { currentCustomer, session, logout } = useAuth();
  const { isOnline } = useNetwork();
  const customerId = currentCustomer?.id || session?.customer_id;

  const [profile, setProfile] = useState<CustomerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!customerId) return;
    try {
      const response = await profileApi.getProfile(customerId);
      setProfile(response.data);
      setIsFromCache(response.fromCache);
      setLastSyncedAt(response.syncedAt);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    fetchProfile();
  }, [fetchProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of DFarm Customer Portal? Offline cached data for your session will be securely cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  const primaryAddress = profile?.customerAddresses?.[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner
        isOnline={isOnline}
        isCachedData={isFromCache}
        lastSyncedAt={lastSyncedAt || undefined}
      />

      {loading && !refreshing ? (
        <LoadingSpinner message="Loading customer profile..." fullScreen />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* Top Profile Card */}
          <Card variant="elevated" style={styles.avatarCard}>
            <View style={styles.avatarBig}>
              <Text style={styles.avatarBigText}>
                {(profile?.fullName || currentCustomer?.fullName || 'DF').substring(0, 2).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.nameText}>
              {profile?.fullName || currentCustomer?.fullName || 'Farmer Partner'}
            </Text>
            <Text style={styles.mobileText}>
              +91 {profile?.normalizedMobileNumber || currentCustomer?.normalizedMobileNumber || '---'}
            </Text>

            <View style={styles.badgesRow}>
              <Badge
                label={`Code: ${profile?.farmerCode || currentCustomer?.farmerCode || '---'}`}
                variant="info"
                size="md"
              />
              <Badge
                label={profile?.status || 'ACTIVE'}
                variant={profile?.status === 'ACTIVE' ? 'success' : 'warning'}
                size="md"
              />
            </View>
          </Card>

          {/* Privacy Safeguard Notice */}
          <View style={styles.privacyNoticeCard}>
            <Text style={styles.privacyNoticeTitle}>🔒 Privacy & Biometrics Safeguard</Text>
            <Text style={styles.privacyNoticeDesc}>
              In accordance with DPDP and DFarm Privacy Policies: Biometric templates, facial vectors, and raw banking credentials are never exposed or stored on this device. Bank account numbers are strictly masked.
            </Text>
          </View>

          {/* Banking Details (Masked) */}
          <Card variant="flat" style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Banking & Direct Disbursement</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Bank Name</Text>
              <Text style={styles.infoVal}>{profile?.bankName || 'Not Registered'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Number</Text>
              <Text style={styles.infoVal}>
                {profile?.bankAccountNumber || 'XXXX-XXXX-XXXX'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>IFSC Code</Text>
              <Text style={styles.infoVal}>{profile?.bankIfscCode || '---'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Holder</Text>
              <Text style={styles.infoVal}>{profile?.bankAccountHolderName || profile?.fullName || '---'}</Text>
            </View>
          </Card>

          {/* Farm Location & Authorized Milk */}
          <Card variant="flat" style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Farm & Location</Text>

            {primaryAddress ? (
              <View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Village / Area</Text>
                  <Text style={styles.infoVal}>{primaryAddress.village || primaryAddress.hamletArea || '---'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Taluka & District</Text>
                  <Text style={styles.infoVal}>
                    {primaryAddress.talukaSubdistrict ? `${primaryAddress.talukaSubdistrict}, ` : ''}
                    {primaryAddress.district || '---'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>State & PIN</Text>
                  <Text style={styles.infoVal}>
                    {primaryAddress.state || 'Maharashtra'} - {primaryAddress.postalCode || '---'}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.noAddress}>No registered farm address on record.</Text>
            )}

            <View style={styles.divider} />

            <Text style={[styles.sectionHeading, { fontSize: 13, marginBottom: 8 }]}>
              Authorized Milk Categories
            </Text>
            <View style={styles.categoryPillsRow}>
              {profile?.customerMilkCategories && profile.customerMilkCategories.length > 0 ? (
                profile.customerMilkCategories.map((c, idx) => (
                  <Badge
                    key={idx}
                    label={`${c.milkCategory} MILK`}
                    variant={c.milkCategory === 'COW' ? 'info' : 'success'}
                    size="sm"
                  />
                ))
              ) : (
                <Text style={styles.infoVal}>Cow & Buffalo Milk</Text>
              )}
            </View>
          </Card>

          {/* Navigation Menu Links */}
          <Card variant="flat" style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Text style={styles.menuIcon}>⚙️</Text>
              <Text style={styles.menuLabel}>Edit Preferences & Consent</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.menuIcon}>📱</Text>
              <Text style={styles.menuLabel}>App Storage & Offline Cache</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('Support')}
            >
              <Text style={styles.menuIcon}>📞</Text>
              <Text style={styles.menuLabel}>Dairy Center Help & Support</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          </Card>

          {/* Logout Action */}
          <Button
            title="Log Out of Customer App"
            variant="danger"
            onPress={handleLogout}
            style={styles.logoutBtn}
          />

          <Text style={styles.versionFooter}>
            DFarm Customer Mobile App v1.0.0 (Phase 18)
          </Text>
        </ScrollView>
      )}
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
    paddingBottom: 36,
  },
  avatarCard: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 14,
    backgroundColor: colors.card,
  },
  avatarBig: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarBigText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textInverse,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  mobileText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  privacyNoticeCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  privacyNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 2,
  },
  privacyNoticeDesc: {
    fontSize: 11,
    color: '#15803D',
    lineHeight: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
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
  noAddress: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 10,
  },
  categoryPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  menuCard: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: colors.card,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  menuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  menuArrow: {
    fontSize: 20,
    color: colors.textMuted,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: 12,
  },
  logoutBtn: {
    marginBottom: 16,
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
  },
});
