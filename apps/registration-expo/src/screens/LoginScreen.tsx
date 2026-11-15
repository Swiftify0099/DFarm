import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Platform,
  SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';
import { clayColors, clayRadius, clayStyles } from '../theme/claymorphism';
import { clayAssets } from '../theme/assets';
import { FormInput } from '../components/FormInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { AssignedCenter, OfficerProfile } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { login, selectCenter } = useAuth();

  const [email, setEmail] = useState('officer.kolhapur@dfarm.local');
  const [password, setPassword] = useState('Officer@12345');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Center Selection Modal
  const [showCenterDialog, setShowCenterDialog] = useState(false);
  const [availableCenters, setAvailableCenters] = useState<AssignedCenter[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim()) {
      setErrorMessage('Email cannot be empty');
      return;
    }
    if (!password) {
      setErrorMessage('Password cannot be empty');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const officer: OfficerProfile = await login(email, password);
      const centers = officer.assignedCenters || [];

      if (centers.length > 1 && !officer.centerId) {
        setAvailableCenters(centers);
        setSelectedCenterId(centers[0]?.centerId || null);
        setShowCenterDialog(true);
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'CustomerList' }],
        });
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Login failed. Please check your staff credentials.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCenterSelect = async (centerId: string) => {
    await selectCenter(centerId);
    setShowCenterDialog(false);
    navigation.reset({
      index: 0,
      routes: [{ name: 'CustomerList' }],
    });
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 3D Clay Hero Onboarding Illustration */}
        <View style={styles.heroContainer}>
          <View style={styles.heroGlowBackdrop} />
          <Image
            source={clayAssets.onboarding3d}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </View>

        {/* DFarm Dairy Header Branding */}
        <View style={styles.brandHeader}>
          <View style={styles.brandPill}>
            <Text style={styles.brandPillEmoji}>🥛</Text>
            <Text style={styles.brandPillText}>DFARM SMART DAIRY</Text>
          </View>
          <Text style={styles.brandTitle}>Officer Registration Portal</Text>
          <Text style={styles.brandSubtitle}>
            Farmer KYC Ledger • Biometric Vault • RFID Provisioning
          </Text>
        </View>

        {/* 3D Clay Login Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconBadge}>
              <Text style={styles.cardIconEmoji}>🔐</Text>
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>Staff Authentication</Text>
              <Text style={styles.cardSubtitle}>
                Enter authorized credentials to operate dairy centers
              </Text>
            </View>
          </View>

          <View style={styles.formGap} />

          <FormInput
            value={email}
            onValueChange={(val) => {
              setEmail(val);
              setErrorMessage(null);
            }}
            label="Authorized Officer Email"
            placeholder="officer@dfarm.local"
            leadingIcon="✉️"
            keyboardType="email-address"
            returnKeyType="next"
          />

          <FormInput
            value={password}
            onValueChange={(val) => {
              setPassword(val);
              setErrorMessage(null);
            }}
            label="Staff Password"
            leadingIcon="🔒"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorBoxText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.buttonSpacer} />

          <PrimaryButton
            text="Secure Officer Sign In"
            onClick={handleLogin}
            isLoading={isLoading}
            leadingIcon="🛡️"
          />
        </View>

        {/* Security Trust Footnote */}
        <View style={styles.footnoteRow}>
          <View style={styles.footnotePill}>
            <Text style={styles.footnoteIcon}>🛡️</Text>
            <Text style={styles.footnoteText}>
              Hardware Keystore Encrypted • P05/P06 Verified
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Multi-Center Selection Modal Dialog */}
      <Modal
        visible={showCenterDialog}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (selectedCenterId) handleCenterSelect(selectedCenterId);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalIconPill}>
                <Text style={styles.modalIconText}>🏢</Text>
              </View>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Select Operating Center</Text>
                <Text style={styles.modalSubtitle}>
                  Choose the active milk collection center for this session:
                </Text>
              </View>
            </View>

            <View style={styles.centersList}>
              {availableCenters.map((center) => {
                const isSelected = selectedCenterId === center.centerId;
                return (
                  <TouchableOpacity
                    key={center.centerId}
                    activeOpacity={0.8}
                    style={[
                      styles.centerOptionCard,
                      isSelected && styles.centerOptionSelected,
                    ]}
                    onPress={() => setSelectedCenterId(center.centerId)}
                  >
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleSelected,
                      ]}
                    >
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={styles.centerDetails}>
                      <Text style={styles.centerName}>{center.centerName}</Text>
                      <Text style={styles.centerCode}>
                        Center Code: {center.centerCode}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <PrimaryButton
              text="Confirm & Continue to Dashboard"
              onClick={() => {
                if (selectedCenterId) {
                  handleCenterSelect(selectedCenterId);
                }
              }}
              leadingIcon="✓"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: clayColors.canvasBackground,
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  heroContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: clayColors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  heroGlowBackdrop: {
    position: 'absolute',
    width: 154,
    height: 154,
    borderRadius: 77,
    backgroundColor: 'rgba(0, 80, 110, 0.12)',
  },
  heroImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 22,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F0F8',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: clayRadius.pill,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  brandPillEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  brandPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: clayColors.primary,
    letterSpacing: 0.8,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: clayColors.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  brandSubtitle: {
    fontSize: 13,
    color: clayColors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 22,
    borderTopWidth: 2.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 4,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#D8E4EC',
    borderBottomColor: '#C4D5E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EDF5FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#FFFFFF',
  },
  cardIconEmoji: {
    fontSize: 22,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: clayColors.textMuted,
    marginTop: 2,
  },
  formGap: {
    height: 10,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: clayColors.errorSurface,
    borderRadius: clayRadius.md,
    padding: 12,
    marginTop: 10,
    marginBottom: 6,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: clayColors.errorBorder,
    borderBottomColor: clayColors.errorBorder,
  },
  errorIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  errorBoxText: {
    color: clayColors.error,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  buttonSpacer: {
    height: 14,
  },
  footnoteRow: {
    marginTop: 22,
  },
  footnotePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: clayRadius.pill,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  footnoteIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  footnoteText: {
    fontSize: 11,
    color: clayColors.textSecondary,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 20, 32, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.dialog,
    padding: 22,
    borderTopWidth: 2.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 4,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#D8E4EC',
    borderBottomColor: '#C4D5E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002538',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.24,
        shadowRadius: 22,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconPill: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E8F3FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  modalIconText: {
    fontSize: 22,
  },
  modalTitleWrap: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: clayColors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  centersList: {
    gap: 10,
    marginBottom: 20,
  },
  centerOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: clayRadius.md,
    backgroundColor: '#F5F9FC',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.8)',
    borderRightColor: '#DFE8EF',
    borderBottomColor: '#CEDEE8',
  },
  centerOptionSelected: {
    backgroundColor: '#E5F3FA',
    borderTopColor: '#FFFFFF',
    borderLeftColor: clayColors.primaryLight,
    borderRightColor: clayColors.primary,
    borderBottomColor: clayColors.primary,
    borderWidth: 1.5,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#B0C4D2',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleSelected: {
    borderColor: clayColors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: clayColors.primary,
  },
  centerDetails: {
    flex: 1,
  },
  centerName: {
    fontSize: 15,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  centerCode: {
    fontSize: 12,
    color: clayColors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
});
