/**
 * DFarm Registration App - Main / Diagnostic Screen
 * Complete parity with Kotlin MainScreen.kt
 * Transformed with Premium 3D Claymorphism Aesthetics
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const Icon = Ionicons as unknown as React.ComponentType<any>;
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';
import { RootStackParamList } from '../types/navigation';
import { PrimaryButton } from '../components/PrimaryButton';

export const MainScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.container}>
      {/* 3D Clay Top Bar */}
      <View style={styles.topAppBar}>
        <View style={styles.brandIconWrap}>
          <Text style={styles.brandEmoji}>🥛</Text>
        </View>
        <Text style={styles.topBarTitle}>DFarm Registration</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            Farmer Identification & Registration Flow
          </Text>
          <Text style={styles.sectionSubtitle}>
            Direct operational access to hardware-assisted biometric and RFID workflows.
          </Text>
        </View>

        {/* 3D Clay Card: Face Enrollment */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconEmoji}>👤</Text>
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>Suresh Patil</Text>
              <Text style={styles.cardSubtitle}>
                Code: DF-2026-0042 • UUID: c1111111-1111-1111-1111-111111111111
              </Text>
            </View>
          </View>

          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.cardStatus}>
              Biometric Status: Consent Verified • Pending Face Capture
            </Text>
          </View>

          <PrimaryButton
            text="Launch Face Enrollment"
            onClick={() =>
              navigation.navigate('FaceEnrollment', {
                customerId: 'c1111111-1111-1111-1111-111111111111',
                customerName: 'Suresh Patil',
                farmerCode: 'DF-2026-0042',
              })
            }
            leadingIcon="📷"
          />
        </View>

        {/* 3D Clay Card: RFID Card Management */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#E0F0F8' }]}>
              <Icon name="card" size={22} color={clayColors.primary} />
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>
                RFID Smart Card Provisioning
              </Text>
              <Text style={styles.cardSubtitle}>
                Assign unique RFID card UID, execute replacements, view assignment history, and activate customer registrations.
              </Text>
            </View>
          </View>

          <PrimaryButton
            text="Open RFID Assignment Screen"
            onClick={() => navigation.navigate('RfidAssignment')}
            leadingIcon="💳"
          />
        </View>

        {/* Diagnostic Status Box */}
        <View style={styles.diagnosticCard}>
          <View style={styles.onlineDot} />
          <Text style={styles.statusText}>
            Status: DFarm Ledger Engine Online (Connected)
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clayColors.canvasBackground,
  },
  topAppBar: {
    height: 56,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#DFE7ED',
  },
  brandIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E5F3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandEmoji: {
    fontSize: 20,
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: clayColors.primary,
  },
  placeholder: {
    width: 38,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    gap: 4,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: clayColors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: clayColors.textSecondary,
    lineHeight: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
    gap: 14,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EDF5FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  iconEmoji: {
    fontSize: 22,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: clayColors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: clayColors.textMuted,
    lineHeight: 17,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF5FA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: clayRadius.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B06000',
    marginRight: 6,
  },
  cardStatus: {
    fontSize: 12,
    color: clayColors.primary,
    fontWeight: '700',
    flex: 1,
  },
  diagnosticCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E4F6EB',
    borderRadius: clayRadius.card,
    padding: 14,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#BCE8CA',
    borderBottomColor: '#BCE8CA',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#137333',
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#137333',
  },
});
