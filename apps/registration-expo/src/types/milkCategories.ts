/**
 * DFarm Registration App - Milk Category Options
 * Parity with Kotlin MilkCategoryOption enum
 */

export type MilkCategoryOptionKey = 'COW' | 'BUFFALO' | 'BOTH';

export interface MilkCategoryConfig {
  key: MilkCategoryOptionKey;
  label: string;
  marathiLabel: string;
  hindiLabel: string;
  categories: string[];
  description: string;
}

export const MILK_CATEGORY_OPTIONS: Record<MilkCategoryOptionKey, MilkCategoryConfig> = {
  COW: {
    key: 'COW',
    label: 'Cow Only',
    marathiLabel: 'गाय',
    hindiLabel: 'गाय',
    categories: ['COW'],
    description: 'Farmer supplies cow milk exclusively.',
  },
  BUFFALO: {
    key: 'BUFFALO',
    label: 'Buffalo Only',
    marathiLabel: 'म्हैस',
    hindiLabel: 'भैंस',
    categories: ['BUFFALO'],
    description: 'Farmer supplies buffalo milk exclusively.',
  },
  BOTH: {
    key: 'BOTH',
    label: 'Both Cow & Buffalo',
    marathiLabel: 'दोन्ही (गाय व म्हैस)',
    hindiLabel: 'दोनों (गाय और भैंस)',
    categories: ['COW', 'BUFFALO'],
    description: 'Farmer is authorized to supply both cow and buffalo milk.',
  },
};
