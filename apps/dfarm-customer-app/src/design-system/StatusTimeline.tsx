import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_TYPOGRAPHY } from './theme';

export interface TimelineStep {
  title: string;
  subtitle: string;
  status: 'completed' | 'current' | 'pending';
}

export interface StatusTimelineProps {
  steps: TimelineStep[];
}

export const StatusTimeline: React.FC<StatusTimelineProps> = ({ steps }) => {
  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <View key={index} style={styles.stepRow}>
            <View style={styles.indicatorCol}>
              <View
                style={[
                  styles.circle,
                  step.status === 'completed' && styles.circleCompleted,
                  step.status === 'current' && styles.circleCurrent,
                ]}
              >
                {step.status === 'completed' ? (
                  <Text style={styles.check}>✓</Text>
                ) : step.status === 'current' ? (
                  <View style={styles.innerDot} />
                ) : (
                  <Text style={styles.stepNum}>{index + 1}</Text>
                )}
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.connector,
                    step.status === 'completed' && styles.connectorCompleted,
                  ]}
                />
              )}
            </View>

            <View style={styles.contentCol}>
              <Text
                style={[
                  styles.title,
                  step.status === 'current' && styles.titleCurrent,
                  step.status === 'completed' && styles.titleCompleted,
                ]}
              >
                {step.title}
              </Text>
              <Text style={styles.subtitle}>{step.subtitle}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    width: '100%',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  indicatorCol: {
    alignItems: 'center',
    width: 32,
    marginRight: 12,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderWidth: 2,
    borderColor: DFARM_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCompleted: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
  },
  circleCurrent: {
    backgroundColor: '#FFF3E0',
    borderColor: DFARM_COLORS.primaryOrange,
  },
  innerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: DFARM_COLORS.primaryOrange,
  },
  check: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '800',
  },
  stepNum: {
    color: DFARM_COLORS.secondaryText,
    fontSize: 12,
    fontWeight: '700',
  },
  connector: {
    width: 2,
    height: 34,
    backgroundColor: DFARM_COLORS.border,
    marginVertical: 2,
  },
  connectorCompleted: {
    backgroundColor: '#2E7D32',
  },
  contentCol: {
    flex: 1,
    paddingTop: 4,
    paddingBottom: 18,
  },
  title: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '600',
    color: DFARM_COLORS.secondaryText,
  },
  titleCurrent: {
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
  titleCompleted: {
    color: DFARM_COLORS.primaryText,
    fontWeight: '700',
  },
  subtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 2,
  },
});
