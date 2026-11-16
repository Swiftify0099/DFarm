// DFarm Collection App — Dairy-Scoped Face Biometric Matcher
// Strict Tenant Isolation: Only matches templates belonging to the active dairy

import { computeCosineSimilarity } from './preprocessor'
import { FACE_MODEL_MANIFEST } from './manifest'
import type { CustomerIdentity } from '@/types'

export interface EnrolledFaceTemplate {
  templateId: string
  customerId: string
  dairyId: string
  farmerCode: string
  fullName: string
  embedding: number[] // 128-D Float32 vector
  status: 'ACTIVE' | 'PENDING' | 'REVOKED'
}

export interface MatchResult {
  isMatch: boolean
  matchedCustomer: CustomerIdentity | null
  confidenceScore: number // Percentage 0 - 100
  similarity: number // Cosine similarity -1.0 to +1.0
  threshold: number
  rejectionReason?:
    | 'NO_MATCH_BELOW_THRESHOLD'
    | 'CROSS_DAIRY_BLOCKED'
    | 'INACTIVE_TEMPLATE'
    | 'NO_TEMPLATES'
    | 'INVALID_PROBE_EMBEDDING_SHAPE'
}

export class DairyFaceMatcher {
  /**
   * Match a probe embedding against dairy-scoped enrolled face templates.
   * STRICT ENFORCEMENT:
   * 1. Only templates with matching activeDairyId are evaluated.
   * 2. Only ACTIVE templates are evaluated (excludes PENDING, REVOKED).
   * 3. Similarity must be >= 0.363 (calibrated threshold).
   * 4. Returns top matching customer or unknown result.
   */
  public static match(
    probeEmbedding: number[],
    activeDairyId: string,
    enrolledTemplates: EnrolledFaceTemplate[],
    customersMap: Map<string, CustomerIdentity>,
    threshold: number = FACE_MODEL_MANIFEST.recognizer.recommendedThreshold
  ): MatchResult {
    if (!probeEmbedding || probeEmbedding.length !== 128) {
      return {
        isMatch: false,
        matchedCustomer: null,
        confidenceScore: 0,
        similarity: 0,
        threshold,
        rejectionReason: 'INVALID_PROBE_EMBEDDING_SHAPE',
      }
    }

    // 1. Filter templates strictly to the active dairy tenant & active status
    const dairyTemplates = enrolledTemplates.filter(
      (t) => t.dairyId === activeDairyId && t.status === 'ACTIVE'
    )

    if (dairyTemplates.length === 0) {
      return {
        isMatch: false,
        matchedCustomer: null,
        confidenceScore: 0,
        similarity: 0,
        threshold,
        rejectionReason: 'NO_TEMPLATES',
      }
    }

    let bestSimilarity = -1
    let bestTemplate: EnrolledFaceTemplate | null = null

    for (const tmpl of dairyTemplates) {
      // Security check: Never match a template from another dairy
      if (tmpl.dairyId !== activeDairyId) {
        continue
      }

      const sim = computeCosineSimilarity(probeEmbedding, tmpl.embedding)
      if (sim > bestSimilarity) {
        bestSimilarity = sim
        bestTemplate = tmpl
      }
    }

    if (bestTemplate && bestSimilarity >= threshold) {
      // Find customer record
      const customer = customersMap.get(bestTemplate.customerId) || null
      // Convert cosine similarity to 0-100% confidence display
      const confidenceScore = Math.min(
        99.9,
        Number((((bestSimilarity - threshold) / (1.0 - threshold)) * 30 + 70).toFixed(1))
      )

      return {
        isMatch: true,
        matchedCustomer: customer,
        confidenceScore,
        similarity: Number(bestSimilarity.toFixed(4)),
        threshold,
      }
    }

    return {
      isMatch: false,
      matchedCustomer: null,
      confidenceScore: Math.max(0, Number((bestSimilarity * 50).toFixed(1))),
      similarity: Number(bestSimilarity.toFixed(4)),
      threshold,
      rejectionReason: 'NO_MATCH_BELOW_THRESHOLD',
    }
  }
}
