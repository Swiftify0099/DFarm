import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';

interface ReceiptScreenProps {
  receiptText: string;
  onDone: () => void;
}

export const ReceiptScreen: React.FC<ReceiptScreenProps> = ({
  receiptText,
  onDone,
}) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.headlineMedium, { textAlign: 'center' }]}>
        INTAKE RECEIPT (40-COL THERMAL SLIP)
      </Text>
      <View style={{ height: 16 }} />

      <Card style={styles.receiptCard} backgroundColor={colors.cardBackground}>
        <Text style={typography.monospaceReceipt}>{receiptText}</Text>
      </Card>

      <View style={{ height: 24 }} />

      <Button
        title="DONE (NEXT CUSTOMER)"
        onPress={onDone}
        variant="primary"
        style={styles.doneBtn}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  content: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
  },
  doneBtn: {
    width: '100%',
    maxWidth: 420,
    height: 48,
  },
});
