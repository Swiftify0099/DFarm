import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';

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
        <Text style={[typography.headlineLarge, { color: colors.primaryLight, textAlign: 'center' }]}>
          DFARM INTAKE COUNTER
        </Text>
        <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: 4, marginBottom: 32 }]}>
          Dairy Milk Collection Terminal
        </Text>

        <Card style={styles.card} backgroundColor={colors.surfaceDark}>
          <Text style={typography.titleLarge}>Operator Authentication</Text>
          <View style={{ height: 16 }} />

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <Input
            label="Operator Email or Username"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              setErrorMessage(null);
            }}
            placeholder="operator@dfarm.com"
            keyboardType="email-address"
          />

          <View style={{ height: 12 }} />

          <Input
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

          <Button
            title="START COUNTER SESSION"
            onPress={handleLogin}
            isLoading={isLoading}
            variant="primary"
            style={{ height: 50 }}
            textStyle={{ fontSize: 16, fontWeight: 'bold' }}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 450,
    padding: 24,
  },
  errorBox: {
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderColor: colors.statusError,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: colors.statusError,
    fontSize: 13,
    textAlign: 'center',
  },
});
