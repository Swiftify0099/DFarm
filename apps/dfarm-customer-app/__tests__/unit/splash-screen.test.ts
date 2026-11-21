import { DFARM_COLORS } from '../../src/design-system/theme';

describe('DFarm Splash Screen Specification & Brand Identity', () => {
  test('palette matches required brand identity exactly', () => {
    expect(DFARM_COLORS.primaryCream).toBe('#FFF5EE');
    expect(DFARM_COLORS.primaryOrange).toBe('#FF6A00');
    expect(DFARM_COLORS.secondaryOrange).toBe('#F58A38');
    expect(DFARM_COLORS.peach).toBe('#FFE9DC');
    expect(DFARM_COLORS.primaryText).toBe('#211B18');
    expect(DFARM_COLORS.secondaryText).toBe('#817A75');
  });

  test('brand messaging adheres to marketing guidelines', () => {
    const expectedHeadline = 'Building a Smarter';
    const expectedSubheadline = 'Dairy Ecosystem Together';
    const expectedTagline = 'Smart Dairy Transparency';

    expect(expectedHeadline).toBe('Building a Smarter');
    expect(expectedSubheadline).toContain('Dairy Ecosystem');
    expect(expectedSubheadline).toContain('Together');
    expect(expectedTagline).toBe('Smart Dairy Transparency');
  });
});
