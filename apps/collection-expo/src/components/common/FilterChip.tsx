import React from 'react';
import { ViewStyle } from 'react-native';
import { ClayFilterChip } from '../clay/ClayFilterChip';

export interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  selected,
  onPress,
  style,
}) => {
  return (
    <ClayFilterChip
      label={label}
      selected={selected}
      onPress={onPress}
      style={style}
    />
  );
};
