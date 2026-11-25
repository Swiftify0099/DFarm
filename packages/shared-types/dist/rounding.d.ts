/**
 * DFarm Authoritative Commercial Round-Half-Up (ROUND_HALF_UP).
 * Eliminates IEEE 754 binary floating-point drift and guarantees exact 2-decimal-place (paise) rounding.
 *
 * Rules:
 *   - Midpoint (.5) always rounds away from zero (standard commercial dairy banking standard).
 *   - Examples:
 *     roundHalfUp(31.505, 2) === 31.51
 *     roundHalfUp(31.504, 2) === 31.50
 *     roundHalfUp(10.005, 2) === 10.01
 *     roundHalfUp(10.004, 2) === 10.00
 *     roundHalfUp(10.55 * 40.10, 2) === 423.06
 */
export declare function roundHalfUp(value: number, decimals?: number): number;
//# sourceMappingURL=rounding.d.ts.map