import type { OutputSchema } from './vertex.client.js'

export {
  claimOutputSchema,
  evidenceOutputSchema,
  oralOutputSchema
}
export type {
  ClaimOutput,
  ClaimItem,
  EvidenceOutput,
  EvidenceItem,
  OralOutput
}

type ClaimItem = {
  claimId: string
  text: string
  paragraphIds: string[]
  confidence?: 'low' | 'medium' | 'high'
}

type ClaimOutput = {
  claims: ClaimItem[]
}

type EvidenceItem = {
  claimId: string
  paragraphIds: string[]
  figureIds?: string[]
  citationKeys?: string[]
  reason?: string
}

type EvidenceOutput = {
  evidence: EvidenceItem[]
}

type OralOutput = {
  question: string
  expectedAnswer: string
  claimId: string
  paragraphIds: string[]
}

const claimOutputSchema: OutputSchema<ClaimOutput> = {
  parse: (value: unknown): ClaimOutput => {
    const record = asRecord(value, 'claim output')
    const claimsRaw = asArray(record.claims, 'claims')

    const claims = claimsRaw.map((item, index) => {
      const claim = asRecord(item, `claims[${index}]`)
      const confidence = parseConfidence(
        claim.confidence,
        `claims[${index}].confidence`
      )

      return {
        claimId: asString(claim.claimId, `claims[${index}].claimId`),
        text: asString(claim.text, `claims[${index}].text`),
        paragraphIds: asStringArray(
          claim.paragraphIds,
          `claims[${index}].paragraphIds`
        ),
        ...(confidence !== undefined ? { confidence } : {})
      }
    })

    return { claims }
  }
}

const evidenceOutputSchema: OutputSchema<EvidenceOutput> = {
  parse: (value: unknown): EvidenceOutput => {
    const record = asRecord(value, 'evidence output')
    const evidenceRaw = asArray(record.evidence, 'evidence')

    const evidence = evidenceRaw.map((item, index) => {
      const entry = asRecord(item, `evidence[${index}]`)
      const figureIds = entry.figureIds
      const citationKeys = entry.citationKeys
      const reason = entry.reason

      if (reason !== undefined && typeof reason !== 'string') {
        throw new Error(`evidence[${index}].reason must be string`)
      }

      return {
        claimId: asString(entry.claimId, `evidence[${index}].claimId`),
        paragraphIds: asStringArray(
          entry.paragraphIds,
          `evidence[${index}].paragraphIds`
        ),
        ...(figureIds !== undefined
          ? { figureIds: asStringArray(figureIds, `evidence[${index}].figureIds`) }
          : {}),
        ...(citationKeys !== undefined
          ? {
              citationKeys: asStringArray(
                citationKeys,
                `evidence[${index}].citationKeys`
              )
            }
          : {}),
        ...(reason ? { reason } : {})
      }
    })

    return { evidence }
  }
}

const oralOutputSchema: OutputSchema<OralOutput> = {
  parse: (value: unknown): OralOutput => {
    const record = asRecord(value, 'oral output')
    return {
      question: asString(record.question, 'question'),
      expectedAnswer: asString(record.expectedAnswer, 'expectedAnswer'),
      claimId: asString(record.claimId, 'claimId'),
      paragraphIds: asStringArray(record.paragraphIds, 'paragraphIds')
    }
  }
}

const asRecord = (
  value: unknown,
  fieldName: string
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`)
  }
  return value as Record<string, unknown>
}

const asArray = (value: unknown, fieldName: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`)
  }
  return value
}

const asString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }
  return value
}

const asStringArray = (value: unknown, fieldName: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`)
  }
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error(`${fieldName} must be string[]`)
    }
  }
  return value
}

const parseConfidence = (
  value: unknown,
  fieldName: string
): 'low' | 'medium' | 'high' | undefined => {
  if (value === undefined) return undefined
  if (value === 'low' || value === 'medium' || value === 'high') return value
  throw new Error(`${fieldName} is invalid`)
}
