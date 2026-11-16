import { DFARM_COLORS, DFARM_SHADOWS, DFARM_RADIUS } from '../../src/design-system/theme';

describe('DFarm Claymorphism Theme & Tokens', () => {
  test('strictly conforms to approved color palette', () => {
    expect(DFARM_COLORS.primaryCream).toBe('#FFF5EE');
    expect(DFARM_COLORS.primaryOrange).toBe('#FF6A00');
    expect(DFARM_COLORS.secondaryOrange).toBe('#F58A38');
    expect(DFARM_COLORS.peach).toBe('#FFE9DC');
    expect(DFARM_COLORS.primaryText).toBe('#211B18');
    expect(DFARM_COLORS.secondaryText).toBe('#817A75');
    expect(DFARM_COLORS.border).toBe('#F1E7E0');
  });

  test('defines soft clay shadow properties for Android elevation and iOS drop shadows', () => {
    expect(DFARM_SHADOWS.clayCard.elevation).toBe(5);
    expect(DFARM_SHADOWS.clayCard.shadowColor).toBe('#F58A38');
    expect(DFARM_SHADOWS.clayButton.elevation).toBe(6);
    expect(DFARM_SHADOWS.clayTabBar.elevation).toBe(10);
  });

  test('provides rounded ergonomic radii', () => {
    expect(DFARM_RADIUS.sm).toBe(10);
    expect(DFARM_RADIUS.md).toBe(16);
    expect(DFARM_RADIUS.lg).toBe(22);
    expect(DFARM_RADIUS.pill).toBe(9999);
  });
});
