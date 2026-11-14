import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';

export interface SupportScreenProps {
  navigation: any;
}

export const SupportScreen: React.FC<SupportScreenProps> = ({ navigation }) => {
  const { currentCustomer } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Contact Banner */}
        <Card variant="elevated" style={styles.heroCard}>
          <Text style={styles.heroEmoji}>🤝</Text>
          <Text style={styles.heroTitle}>Farmer Support Desk</Text>
          <Text style={styles.heroSubtitle}>
            Have questions about milk fat test rates, weighing records, cattle feed orders, or payment disbursements?
          </Text>
        </Card>

        {/* Primary Dairy Center Card */}
        <Card variant="flat" style={styles.card}>
          <Text style={styles.cardTitle}>Your Registered Collection Center</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Primary Center</Text>
            <Text style={styles.infoVal}>Sangli Central Dairy (BMC-01)</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Center Supervisor</Text>
            <Text style={styles.infoVal}>Prakash Patil (Station Lead)</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Helpline Mobile</Text>
            <Text style={[styles.infoVal, { color: colors.primary }]}>+91 98220 12345</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Farmer Partner Code</Text>
            <Text style={styles.infoVal}>{currentCustomer?.farmerCode || '---'}</Text>
          </View>
        </Card>

        {/* Operating Hours */}
        <Card variant="flat" style={styles.card}>
          <Text style={styles.cardTitle}>Intake & Testing Shifts</Text>

          <View style={styles.shiftBox}>
            <Text style={styles.shiftName}>🌅 Morning Collection Shift</Text>
            <Text style={styles.shiftTime}>06:00 AM – 09:30 AM (Daily)</Text>
            <Text style={styles.shiftNote}>MilkoTester analyzer & electronic weighbridge active.</Text>
          </View>

          <View style={[styles.shiftBox, { marginTop: 10 }]}>
            <Text style={styles.shiftName}>🌇 Evening Collection Shift</Text>
            <Text style={styles.shiftTime}>05:00 PM – 08:30 PM (Daily)</Text>
            <Text style={styles.shiftNote}>Weighment slips printed and synced to mobile app.</Text>
          </View>
        </Card>

        {/* Dispute Resolution Note */}
        <Card variant="flat" style={styles.card}>
          <Text style={styles.cardTitle}>Weight or Quality Dispute</Text>
          <Text style={styles.disputeText}>
            If you notice any difference between your collection slip and physical weighment:
          </Text>
          <Text style={styles.disputeStep}>1. Keep your thermal collection slip receipt or in-app receipt number.</Text>
          <Text style={styles.disputeStep}>2. Report to the center operator before the collection shift closes.</Text>
          <Text style={styles.disputeStep}>3. Shift supervisors can re-test milk samples within 15 minutes of intake.</Text>
        </Card>

        <Button
          title="Back to Profile"
          variant="secondary"
          onPress={() => navigation.goBack()}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  heroCard: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.card,
  },
  heroEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heroSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  infoVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  shiftBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
  },
  shiftName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  shiftTime: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  shiftNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  disputeText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  disputeStep: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
});
