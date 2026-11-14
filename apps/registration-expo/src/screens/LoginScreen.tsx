import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';
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
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* DFarm Dairy Branding */}
        <View style={styles.brandIconContainer}>
          <Text style={styles.brandEmoji}>🥛</Text>
        </View>

        <Text style={styles.brandTitle}>DFarm Dairy</Text>
        <Text style={styles.brandSubtitle}>
          Officer Registration & KYC Portal
        </Text>

        {/* Login Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Officer Sign In</Text>
          <Text style={styles.cardSubtitle}>
            Enter authorized staff credentials to manage center registrations.
          </Text>

          <FormInput
            value={email}
            onValueChange={(val) => {
              setEmail(val);
              setErrorMessage(null);
            }}
            label="Officer Email"
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
            label="Password"
            leadingIcon="🔒"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.buttonSpacer} />

          <PrimaryButton
            text="Secure Sign In"
            onClick={handleLogin}
            isLoading={isLoading}
            leadingIcon="🛡️"
          />
        </View>

        {/* Footnote */}
        <View style={styles.footnoteRow}>
          <Text style={styles.footnoteIcon}>🛡️</Text>
          <Text style={styles.footnoteText}>
            Hardware Keystore Encrypted • P05/P06 Verified
          </Text>
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
            <Text style={styles.modalTitle}>Select Operational Center</Text>
            <Text style={styles.modalSubtitle}>
              Please select the milk collection center for this session:
            </Text>

            <View style={styles.centersList}>
              {availableCenters.map((center) => {
                const isSelected = selectedCenterId === center.centerId;
                return (
                  <TouchableOpacity
                    key={center.centerId}
                    activeOpacity={0.7}
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
                        Code: {center.centerCode}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.modalConfirmButton}
              onPress={() => {
                if (selectedCenterId) {
                  handleCenterSelect(selectedCenterId);
                }
              }}
            >
              <Text style={styles.modalConfirmText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  brandIconContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  brandEmoji: {
    fontSize: 36,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  brandSubtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginBottom: 28,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E6E8EC',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 20,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  errorBoxText: {
    color: colors.onErrorContainer,
    fontSize: 13,
    lineHeight: 18,
  },
  buttonSpacer: {
    height: 14,
  },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  footnoteIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  footnoteText: {
    fontSize: 11,
    color: colors.outline,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginBottom: 16,
  },
  centersList: {
    gap: 10,
    marginBottom: 20,
  },
  centerOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  centerOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(35, 117, 155, 0.15)',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  centerDetails: {
    flex: 1,
  },
  centerName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  centerCode: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  modalConfirmButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
