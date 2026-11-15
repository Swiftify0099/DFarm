import React from 'react';
import { ViewStyle } from 'react-native';
import { ClayCard } from '../clay/ClayCard';
import { colors } from '../../theme/colors';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  backgroundColor?: string;
  borderColor?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  onPress,
  backgroundColor = colors.claySurfaceCard,
  borderColor,
}) => {
  return (
    <ClayCard
      style={style}
      onPress={onPress}
      backgroundColor={backgroundColor}
      borderColor={borderColor}
    >
      {children}
    </ClayCard>
  );
};
