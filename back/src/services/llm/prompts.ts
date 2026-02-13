export { buildClaimPrompt, buildEvidencePrompt, buildOralPrompt }
export type { ClaimPromptInput, EvidencePromptInput, OralPromptInput }

type ClaimPromptInput = {
  extractedText: string
  maxClaims?: number
}

type EvidencePromptInput = {
  extractedText: string
  claims: Array<{
    claimId: string
    claimText: string
  }>
}

type OralPromptInput = {
  extractedText: string
  focusClaimId: string
  focusClaimText: string
}

const COMMON_RULES = [
  'Return JSON only. Do not output markdown.',
  'All references are mandatory for every claim.',
  'Use existing IDs from the input text. Do not invent IDs.',
  'If evidence is missing, set confidence to low and explain why.'
] as const

const buildClaimPrompt = (input: ClaimPromptInput): string => {
  const maxClaims = input.maxClaims ?? 12
  return [
    'Task: extract core claims from the document.',
    ...COMMON_RULES,
    'Output schema:',
    '{ "claims": [{ "claimId": "...", "text": "...", "paragraphIds": ["..."], "confidence": "low|medium|high" }] }',
    `Max claims: ${maxClaims}`,
    'Document:',
    input.extractedText
  ].join('\n')
}

const buildEvidencePrompt = (input: EvidencePromptInput): string => {
  const claimsSection = input.claims
    .map((claim) => `- ${claim.claimId}: ${claim.claimText}`)
    .join('\n')

  return [
    'Task: map each claim to supporting evidence.',
    ...COMMON_RULES,
    'Output schema:',
    '{ "evidence": [{ "claimId": "...", "paragraphIds": ["..."], "figureIds": ["..."], "citationKeys": ["..."], "reason": "..." }] }',
    'Claims:',
    claimsSection || '- (no claims)',
    'Document:',
    input.extractedText
  ].join('\n')
}

const buildOralPrompt = (input: OralPromptInput): string => {
  return [
    'Task: generate one oral-defense question and one model answer.',
    ...COMMON_RULES,
    'Output schema:',
    '{ "question": "...", "expectedAnswer": "...", "claimId": "...", "paragraphIds": ["..."] }',
    `Focus claim ID: ${input.focusClaimId}`,
    `Focus claim: ${input.focusClaimText}`,
    'Document:',
    input.extractedText
  ].join('\n')
}
