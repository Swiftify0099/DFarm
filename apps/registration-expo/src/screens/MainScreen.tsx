/**
 * DFarm Registration App - Main / Diagnostic Screen
 * Complete parity with Kotlin MainScreen.kt
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const Icon = Ionicons as unknown as React.ComponentType<any>;
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../types/navigation';

export const MainScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.container}>
      <View style={styles.topAppBar}>
        <Text style={styles.topBarTitle}>DFarm Registration</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>
          Farmer Identification & Registration Flow
        </Text>

        {/* Card for Face Enrollment */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Suresh Patil</Text>
          <Text style={styles.cardSubtitle}>
            Code: DF-2026-0042 • UUID: c1111111-1111-1111-1111-111111111111
          </Text>
          <Text style={styles.cardStatus}>
            Biometric Status: Consent Verified • Pending Face Capture
          </Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              navigation.navigate('FaceEnrollment', {
                customerId: 'c1111111-1111-1111-1111-111111111111',
                customerName: 'Suresh Patil',
                farmerCode: 'DF-2026-0042',
              })
            }
          >
            <Text style={styles.actionButtonText}>Launch Face Enrollment</Text>
          </TouchableOpacity>
        </View>

        {/* Card for RFID Card Management */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Icon name="card" size={20} color={colors.primary} />
            <Text style={[styles.cardTitle, { marginLeft: 8 }]}>
              RFID Card Assignment & Replacement
            </Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Assign unique RFID card UID, execute replacements, view assignment history, and activate customer registrations.
          </Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('RfidAssignment')}
          >
            <Text style={styles.actionButtonText}>Open RFID Assignment Screen</Text>
          </TouchableOpacity>
        </View>

        {/* Diagnostic Status */}
        <View style={styles.diagnosticSection}>
          <Text style={styles.statusText}>Status: DFarm System Online (Connected)</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topAppBar: {
    height: 56,
    backgroundColor: colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.onSurface,
  },
  card: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.onSurfaceVariant,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.outline,
    lineHeight: 18,
  },
  cardStatus: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  diagnosticSection: {
    marginTop: 8,
  },
  statusText: {
    fontSize: 12,
    color: colors.outline,
    paddingVertical: 4,
  },
});
