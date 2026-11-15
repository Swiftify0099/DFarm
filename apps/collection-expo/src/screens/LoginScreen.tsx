import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayInput } from '../components/clay/ClayInput';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayAlert } from '../components/clay/ClayAlert';
import { ClayImages } from '../theme/assets';

interface LoginScreenProps {
  repository: CollectionRepository;
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  repository,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('operator_tasgaon@test.dfarm.com');
  const [password, setPassword] = useState('Password@123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter username and password');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await repository.login(username, password);
      setIsLoading(false);
      if (res.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(res.error || 'Login failed');
      }
    } catch (e: any) {
      setIsLoading(false);
      setErrorMessage(e.message || 'Login failed');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Claymorphic 3D Terminal Hero */}
        <View style={styles.heroSection}>
          <View style={styles.imageCircle}>
            <Image
              source={ClayImages.onboarding}
              style={styles.heroImage}
              resizeMode="cover"
            />
          </View>
          <Text style={[typography.headlineLarge, styles.appTitle]}>
            DFARM INTAKE COUNTER
          </Text>
          <Text style={[typography.bodyMedium, styles.appSubtitle]}>
            Dairy Milk Collection &amp; Weighing Terminal
          </Text>
        </View>

        {/* 3D Clay Authentication Card */}
        <ClayCard variant="elevated" style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={typography.titleLarge}>Operator Authentication</Text>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusPillText}>TERMINAL ACTIVE</Text>
            </View>
          </View>

          <Text style={styles.cardSubtitle}>
            Sign in with center credentials to initiate intake sessions
          </Text>

          <View style={{ height: 16 }} />

          {errorMessage && (
            <ClayAlert
              type="error"
              title="Authentication Error"
              message={errorMessage}
              onDismiss={() => setErrorMessage(null)}
            />
          )}

          <ClayInput
            label="Operator Email or Username"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              setErrorMessage(null);
            }}
            placeholder="operator@dfarm.com"
            keyboardType="email-address"
          />

          <View style={{ height: 10 }} />

          <ClayInput
            label="Password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setErrorMessage(null);
            }}
            placeholder="Password"
            secureTextEntry
          />

          <View style={{ height: 24 }} />

          <ClayButton
            title="START COUNTER SESSION"
            onPress={handleLogin}
            isLoading={isLoading}
            variant="primary"
            size="lg"
          />

          <View style={styles.securityNotice}>
            <Text style={styles.securityNoticeText}>
              🛡️ Session encrypted via Android Keystore • Offline-First Journal Protected
            </Text>
          </View>
        </ClayCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.clayBgDark,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  imageCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 3,
    borderRightWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    borderLeftColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: '#0E3711',
    borderRightColor: '#0E3711',
    marginBottom: 16,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  appTitle: {
    color: colors.clayGreenLight,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  appSubtitle: {
    textAlign: 'center',
    marginTop: 4,
    color: colors.textSecondary,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    padding: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: 'rgba(76, 175, 80, 0.4)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.clayGreenLight,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.clayGreenLight,
    letterSpacing: 0.5,
  },
  securityNotice: {
    marginTop: 18,
    alignItems: 'center',
  },
  securityNoticeText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});
