import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  ClayCard,
  ClayButton,
  ClayInput,
  ClayBadge,
} from '../../design-system';
import { DFarmBrandMark } from '../../assets/vectors/DFarmBrandMark';
import { useAuth } from '../../features/auth/useAuth';
import { DirectDoveSmsService } from '../../services/smsService';

export default function LoginScreen() {
  const router = useRouter();
  const { requestOtp, isRequestingOtp } = useAuth();
  const [mobileNumber, setMobileNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async () => {
    setError(null);
    const cleaned = mobileNumber.replace(/\D/g, '');

    if (cleaned.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    if (!/^[6-9]\d{9}$/.test(cleaned)) {
      setError('Mobile number must begin with digits 6, 7, 8, or 9');
      return;
    }

    try {
      await requestOtp({ mobileNumber: cleaned });
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { mobileNumber: cleaned },
      });
    } catch (err: any) {
      // If primary backend request fails, try fail-safe direct SMS dispatch
      try {
        const directRes = await DirectDoveSmsService.sendDirectDoveOtp(cleaned);
        if (directRes.success) {
          router.push({
            pathname: '/(auth)/verify-otp',
            params: { mobileNumber: cleaned },
          });
          return;
        }
      } catch {
        // Fall through to display error
      }
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to dispatch SMS verification. Please check network connection.'
      );
    }
  };

  const isFormValid = mobileNumber.replace(/\D/g, '').length === 10;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Brand Visual Anchor */}
          <View style={styles.brandContainer}>
            <View style={styles.logoBadgeContainer}>
              <DFarmBrandMark width={180} height={44} />
            </View>
            <Text style={styles.tagline}>Smart Dairy Transparency</Text>
            <Text style={styles.subTagline}>पारदर्शक दूध संकलन व थेट बँक जमा</Text>
          </View>

          {/* Main Claymorphic Login Card */}
          <ClayCard variant="raised" style={styles.card}>
            <View style={styles.badgeRow}>
              <ClayBadge label="Customer & Farmer Portal" variant="orange" />
            </View>

            <Text style={styles.heading}>Enter Mobile Number</Text>
            <Text style={styles.subtitle}>
              We will send an instant SMS verification code to connect with your
              dairy collection center.
            </Text>

            <ClayInput
              label="Mobile Number / मोबाईल नंबर"
              placeholder="98765 43210"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="done"
              onSubmitEditing={isFormValid ? handleSendOtp : undefined}
              maxLength={10}
              value={mobileNumber}
              onChangeText={(text) => {
                setMobileNumber(text.replace(/[^0-9]/g, ''));
                if (error) setError(null);
              }}
              error={error || undefined}
              leftElement={
                <View style={styles.prefixContainer}>
                  <Text style={styles.flagIcon}>🇮🇳</Text>
                  <Text style={styles.prefixText}>+91</Text>
                  <View style={styles.prefixDivider} />
                </View>
              }
            />

            <ClayButton
              title="Get OTP Verification Code"
              onPress={handleSendOtp}
              loading={isRequestingOtp}
              disabled={!isFormValid}
              style={styles.submitBtn}
            />

            <View style={styles.termsBox}>
              <Text style={styles.termsText}>
                By proceeding, you agree to DFarm's{' '}
                <Text style={styles.termsLink}>Milk Producer Service Terms</Text> &{' '}
                <Text style={styles.termsLink}>Biometric Data Privacy Policy</Text>.
              </Text>
            </View>
          </ClayCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadgeContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: DFARM_RADIUS.pill,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    shadowColor: DFARM_COLORS.primaryOrange,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  tagline: {
    ...DFARM_TYPOGRAPHY.bodyLg,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginTop: 12,
  },
  subTagline: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 2,
  },
  card: {
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  badgeRow: {
    marginBottom: 12,
  },
  heading: {
    ...DFARM_TYPOGRAPHY.h1,
    color: DFARM_COLORS.primaryText,
    marginBottom: 6,
  },
  subtitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 20,
    marginBottom: 20,
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  flagIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  prefixText: {
    ...DFARM_TYPOGRAPHY.bodyLg,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginRight: 8,
  },
  prefixDivider: {
    width: 1.5,
    height: 20,
    backgroundColor: DFARM_COLORS.border,
  },
  submitBtn: {
    marginTop: 6,
    marginBottom: 16,
  },
  termsBox: {
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
    paddingTop: 14,
    marginTop: 4,
  },
  termsText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 16,
  },
  termsLink: {
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '600',
  },
});
