import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  ClayCard,
  ClayButton,
  ClayOTPInput,
  ClayHeader,
  ClayBadge,
} from '../../design-system';
import { useAuth } from '../../features/auth/useAuth';
import { DirectDoveSmsService } from '../../services/smsService';

export default function VerifyOtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mobileNumber?: string }>();
  const mobileNumber = params.mobileNumber || '';
  const { verifyOtp, isVerifyingOtp, requestOtp } = useAuth();

  const [otp, setOtp] = useState('');
  const [timer, setTimer] = useState(60);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleResend = async () => {
    if (timer > 0) return;
    setError(null);
    setTimer(60);
    try {
      await requestOtp({ mobileNumber });
    } catch (err: any) {
      try {
        await DirectDoveSmsService.sendDirectDoveOtp(mobileNumber);
      } catch {
        setError(err?.response?.data?.message || 'Failed to resend OTP');
      }
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError('Please enter all 6 digits of your verification code');
      return;
    }

    try {
      const session = await verifyOtp({
        mobileNumber,
        otp,
      });

      if (session.user.status === 'APPROVED') {
        router.replace('/(main)');
      } else if (session.user.status === 'PENDING_APPROVAL') {
        router.replace('/(onboarding)/pending-approval');
      } else {
        router.replace({
          pathname: '/(onboarding)/dairy-discovery',
          params: { mobileNumber },
        });
      }
    } catch (err: any) {
      // Check emergency direct SMS verification fallback
      const isDirectValid = await DirectDoveSmsService.verifyDirectDoveOtp(mobileNumber, otp);
      if (isDirectValid) {
        router.replace({
          pathname: '/(onboarding)/dairy-discovery',
          params: { mobileNumber },
        });
        return;
      }

      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Invalid or expired verification code'
      );
    }
  };

  const maskedNumber =
    mobileNumber.length === 10
      ? `+91 ${mobileNumber.slice(0, 2)}*** ***${mobileNumber.slice(8)}`
      : `+91 ${mobileNumber}`;

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Verification"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ClayCard variant="raised" style={styles.card}>
            <View style={styles.badgeRow}>
              <ClayBadge label="Step 2 of 2: OTP Security" variant="orange" />
            </View>

            <Text style={styles.heading}>Enter 6-Digit Code</Text>
            <Text style={styles.subtitle}>
              Code sent to <Text style={styles.boldText}>{maskedNumber}</Text>
            </Text>

            <Pressable
              onPress={() => router.back()}
              style={styles.changeNumberBtn}
            >
              <Text style={styles.changeNumberText}>Edit Phone Number</Text>
            </Pressable>

            <ClayOTPInput
              value={otp}
              onChange={(val) => {
                setOtp(val);
                if (error) setError(null);
              }}
              error={!!error}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <ClayButton
              title="Verify & Continue"
              onPress={handleVerify}
              loading={isVerifyingOtp}
              disabled={otp.length !== 6}
              style={styles.verifyBtn}
            />

            <View style={styles.resendRow}>
              <Text style={styles.resendLabel}>Didn't receive code? </Text>
              {timer > 0 ? (
                <Text style={styles.timerText}>Resend in {timer}s</Text>
              ) : (
                <Pressable onPress={handleResend}>
                  <Text style={styles.resendAction}>Resend OTP</Text>
                </Pressable>
              )}
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
    marginBottom: 4,
  },
  boldText: {
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  changeNumberBtn: {
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  changeNumberText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  errorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.error,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  verifyBtn: {
    marginTop: 6,
    marginBottom: 16,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  resendLabel: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
  },
  timerText: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    fontWeight: '600',
  },
  resendAction: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
});
