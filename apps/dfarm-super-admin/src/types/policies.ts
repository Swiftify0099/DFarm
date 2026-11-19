export interface GlobalRatePolicyVersion {
  id: string
  versionNumber: number
  status: 'DRAFT' | 'UNDER_REVIEW' | 'PUBLISHED' | 'RETIRED'
  effectiveFrom: string
  effectiveTo?: string | null
  parameters: {
    cow?: { baseFat: number; baseSnf: number; baseRate: number }
    buffalo?: { baseFat: number; baseSnf: number; baseRate: number }
    [key: string]: any
  }
  checksum: string
  changeSummary?: string
  publishedAt?: string | null
  publishedBy?: string | null
  createdAt?: string
}

export interface GlobalRatePolicy {
  id: string
  policyCode: string
  name: string
  description?: string
  policyType: 'STANDARD_BASE' | 'SEASONAL_INCENTIVE' | 'QUALITY_PREMIUM' | 'INTER_DAIRY_BENCHMARK' | 'STATUTORY_MINIMUM'
  isActive: boolean
  createdAt: string
  versions: GlobalRatePolicyVersion[]
}

export interface FatAdjustmentRule {
  minFat: number
  maxFat: number
  deductionPerPoint: number
  bonusPerPoint?: number
}

export interface SnfAdjustmentRule {
  minSnf: number
  maxSnf: number
  deductionPerPoint: number
  bonusPerPoint?: number
}

export interface GlobalFatSnfPolicyVersion {
  id: string
  versionNumber: number
  status: 'DRAFT' | 'UNDER_REVIEW' | 'PUBLISHED' | 'RETIRED'
  effectiveFrom: string
  effectiveTo?: string | null
  milkCategory: 'COW' | 'BUFFALO' | 'BOTH'
  fatAdjustmentRules: FatAdjustmentRule[]
  snfAdjustmentRules: SnfAdjustmentRule[]
  roundingPolicy: string
  checksum: string
  changeSummary?: string
  publishedAt?: string | null
  publishedBy?: string | null
  createdAt?: string
}

export interface GlobalFatSnfPolicy {
  id: string
  policyCode: string
  name: string
  description?: string
  isActive: boolean
  createdAt: string
  versions: GlobalFatSnfPolicyVersion[]
}
