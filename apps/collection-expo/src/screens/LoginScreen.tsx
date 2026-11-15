import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayInput } from '../components/clay/ClayInput';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayAlert } from '../components/clay/ClayAlert';
import { ClayDialog } from '../components/clay/ClayDialog';
import { ClayImages } from '../theme/assets';
import {
  getDefaultBaseUrl,
  loadPersistedBaseUrl,
  savePersistedBaseUrl,
  testConnection,
  getAutoDetectedHost,
} from '../api/client';

interface LoginScreenProps {
  repository: CollectionRepository;
  onLoginSuccess: () => void;
}

function isNetworkError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('connectexception') ||
    lower.includes('failed to connect') ||
    lower.includes('fetch failed') ||
    lower.includes('network request failed') ||
    lower.includes('econnrefused') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  );
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  repository,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('operator_tasgaon@test.dfarm.com');
  const [password, setPassword] = useState('Password@123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Server Endpoint Settings
  const [serverUrl, setServerUrl] = useState(getDefaultBaseUrl());
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState(getDefaultBaseUrl());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const autoDetectedHost = getAutoDetectedHost();

  useEffect(() => {
    let isMounted = true;
    loadPersistedBaseUrl().then((url) => {
      if (isMounted) {
        setServerUrl(url);
        setTempServerUrl(url);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const res = await testConnection(tempServerUrl);
      setConnectionTestResult(res);
    } catch (e: any) {
      setConnectionTestResult({
        success: false,
        message: e.message || 'Connection test failed',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveServerUrl = async () => {
    const saved = await savePersistedBaseUrl(tempServerUrl);
    setServerUrl(saved);
    setShowSettingsModal(false);
    setErrorMessage(null);
  };

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
          <TouchableOpacity
            style={styles.settingsGearBtn}
            onPress={() => {
              setTempServerUrl(serverUrl);
              setConnectionTestResult(null);
              setShowSettingsModal(true);
            }}
            accessibilityLabel="Configure Server Endpoint"
            activeOpacity={0.7}
          >
            <Text style={styles.gearIcon}>⚙</Text>
          </TouchableOpacity>

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
            <View style={styles.errorContainer}>
              <ClayAlert
                type="error"
                title="Authentication Error"
                message={errorMessage}
                onDismiss={() => setErrorMessage(null)}
              />
              {isNetworkError(errorMessage) && (
                <TouchableOpacity
                  style={styles.networkErrorHint}
                  onPress={() => {
                    setTempServerUrl(serverUrl);
                    setConnectionTestResult(null);
                    setShowSettingsModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.networkErrorHintText}>
                    ⚙ Target server: {serverUrl}
                  </Text>
                  <Text style={styles.networkErrorHintAction}>
                    Tap to verify or change Backend Server IP →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
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

        {/* Server Settings Dialog */}
        <ClayDialog
          visible={showSettingsModal}
          onDismiss={() => setShowSettingsModal(false)}
          title="Backend Server Settings"
          subtitle="Configure the DFarm backend service connection endpoint"
        >
          <View style={styles.dialogBody}>
            <ClayInput
              label="Backend Server Base URL"
              value={tempServerUrl}
              onChangeText={(t) => {
                setTempServerUrl(t);
                setConnectionTestResult(null);
              }}
              placeholder="http://10.114.224.223:4000"
            />

            <Text style={styles.presetsLabel}>QUICK PRESETS</Text>
            <View style={styles.presetsRow}>
              {autoDetectedHost && (
                <TouchableOpacity
                  style={styles.presetChip}
                  onPress={() => {
                    setTempServerUrl(`http://${autoDetectedHost}:4000`);
                    setConnectionTestResult(null);
                  }}
                >
                  <Text style={styles.presetChipText}>Auto-Host ({autoDetectedHost})</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => {
                  setTempServerUrl('http://10.114.224.223:4000');
                  setConnectionTestResult(null);
                }}
              >
                <Text style={styles.presetChipText}>PC Wi-Fi (10.114.224.223)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => {
                  setTempServerUrl('http://127.0.0.1:4000');
                  setConnectionTestResult(null);
                }}
              >
                <Text style={styles.presetChipText}>USB adb (127.0.0.1)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => {
                  setTempServerUrl('http://10.0.2.2:4000');
                  setConnectionTestResult(null);
                }}
              >
                <Text style={styles.presetChipText}>Emulator (10.0.2.2)</Text>
              </TouchableOpacity>
            </View>

            {connectionTestResult && (
              <View
                style={[
                  styles.testResultBox,
                  connectionTestResult.success
                    ? styles.testResultSuccess
                    : styles.testResultError,
                ]}
              >
                <Text
                  style={[
                    styles.testResultText,
                    connectionTestResult.success
                      ? styles.testResultTextSuccess
                      : styles.testResultTextError,
                  ]}
                >
                  {connectionTestResult.success ? '✓ ' : '✗ '}
                  {connectionTestResult.message}
                </Text>
              </View>
            )}

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.testBtn}
                onPress={handleTestConnection}
                disabled={isTestingConnection}
              >
                {isTestingConnection ? (
                  <ActivityIndicator size="small" color={colors.clayGreenLight} />
                ) : (
                  <Text style={styles.testBtnText}>Test Connection</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveServerUrl}
              >
                <Text style={styles.saveBtnText}>Save &amp; Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ClayDialog>
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
    position: 'relative',
    width: '100%',
    maxWidth: 480,
  },
  settingsGearBtn: {
    position: 'absolute',
    top: 4,
    right: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  gearIcon: {
    fontSize: 20,
    color: colors.clayGreenLight,
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
  errorContainer: {
    marginBottom: 14,
  },
  networkErrorHint: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  networkErrorHintText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  networkErrorHintAction: {
    fontSize: 12,
    color: colors.clayGreenLight,
    marginTop: 4,
    fontWeight: '700',
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
  dialogBody: {
    gap: 12,
  },
  presetsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  presetChipText: {
    fontSize: 11,
    color: colors.clayGreenLight,
    fontWeight: '600',
  },
  testResultBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  testResultSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  testResultError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  testResultText: {
    fontSize: 12,
    fontWeight: '600',
  },
  testResultTextSuccess: {
    color: '#4ade80',
  },
  testResultTextError: {
    color: '#f87171',
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  testBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  testBtnText: {
    fontSize: 13,
    color: colors.clayGreenLight,
    fontWeight: '700',
  },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.clayGreenLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    color: '#0D2111',
    fontWeight: '800',
  },
});
