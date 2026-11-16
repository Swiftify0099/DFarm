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
  ClayCard,
  ClayButton,
  ClayInput,
  ClayBadge,
} from '../../design-system';
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
      setError('Number must begin with digits 6, 7, 8, or 9');
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
            <View style={styles.logoPill}>
              <View style={styles.logoDot} />
              <Text style={styles.logoText}>DFARM</Text>
            </View>
            <Text style={styles.tagline}>Smart Dairy Transparency</Text>
          </View>

          {/* Main Claymorphic Login Card */}
          <ClayCard variant="raised" style={styles.card}>
            <View style={styles.badgeRow}>
              <ClayBadge label="Customer & Farmer Portal" variant="orange" />
            </View>

            <Text style={styles.heading}>Enter Mobile Number</Text>
            <Text style={styles.subtitle}>
              We will send an instant SMS verification code to connect with your
              dairy.
            </Text>

            <ClayInput
              label="Mobile Number"
              placeholder="98765 43210"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="done"
              onSubmitEditing={mobileNumber.length === 10 ? handleSendOtp : undefined}
              maxLength={10}
              value={mobileNumber}
              onChangeText={(text) => {
                setMobileNumber(text);
                if (error) setError(null);
              }}
              error={error || undefined}
              leftElement={
                <View style={styles.prefixContainer}>
                  <Text style={styles.prefixText}>🇮🇳 +91</Text>
                  <View style={styles.prefixDivider} />
                </View>
              }
            />

            <ClayButton
              title="Get OTP Verification Code"
              onPress={handleSendOtp}
              loading={isRequestingOtp}
              disabled={mobileNumber.length !== 10}
              style={styles.submitBtn}
            />

            <Text style={styles.termsText}>
              By proceeding, you agree to DFarm's Milk Producer Service Terms &
              Biometric Data Privacy Policy.
            </Text>
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
    marginBottom: 28,
  },
  logoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    shadowColor: DFARM_COLORS.primaryOrange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: DFARM_COLORS.primaryOrange,
    marginRight: 8,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
    letterSpacing: 1.5,
  },
  tagline: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    marginTop: 8,
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
    marginBottom: 20,
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefixText: {
    fontSize: 15,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginRight: 8,
  },
  prefixDivider: {
    width: 1,
    height: 20,
    backgroundColor: DFARM_COLORS.border,
  },
  submitBtn: {
    marginTop: 8,
    marginBottom: 16,
  },
  termsText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 16,
  },
});
