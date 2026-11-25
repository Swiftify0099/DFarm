/**
 * DFarm Authoritative Commercial Round-Half-Up (ROUND_HALF_UP).
 * Eliminates IEEE 754 binary floating-point drift and guarantees exact 2-decimal-place (paise) rounding.
 * Matches backend FinancialPolicyResolutionService and RateService arithmetic exactly.
 * 
 * Rules:
 *   - Midpoint (.5) always rounds away from zero.
 *   - Examples:
 *     roundHalfUp(31.505, 2) === 31.51
 *     roundHalfUp(31.504, 2) === 31.50
 *     roundHalfUp(10.005, 2) === 10.01
 *     roundHalfUp(10.004, 2) === 10.00
 *     roundHalfUp(10.55 * 40.10, 2) === 423.06
 */
export function roundHalfUp(value: number, decimals: number = 2): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Invalid financial value: expected finite number, received ${value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`Invalid decimals parameter: expected non-negative integer, received ${decimals}`);
  }
  const sign = value < 0 ? -1 : 1;
  const absVal = Math.abs(value);
  const rounded = Number(Math.round(Number(absVal + 'e' + decimals)) + 'e-' + decimals);
  return sign * rounded;
}
