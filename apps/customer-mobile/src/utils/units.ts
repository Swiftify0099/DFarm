/**
 * Measurement Unit Utility for DFarm Mobile
 * CRITICAL RULE: Never convert KG to Litre silently.
 * Always preserve and display the actual recorded measurement unit.
 */

export function formatWeight(
  weight: number | string | null | undefined,
  unit: string = 'KG'
): string {
  if (weight === null || weight === undefined || isNaN(Number(weight))) {
    return `0.00 ${unit}`;
  }
  const val = Number(weight);
  return `${val.toFixed(2)} ${unit.toUpperCase()}`;
}

export const formatWeightKg = (weight: number | string | null | undefined): string =>
  formatWeight(weight, 'KG');

export function formatPercentage(val: number | string | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return '0.00 %';
  }
  return `${Number(val).toFixed(2)} %`;
}
