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
  '出力はJSONのみ。Markdownは出力しない。',
  'IDは入力に存在するものだけを使う。新規IDを作らない。',
  '不確実な場合でも推測を作らず、根拠不足として扱う。',
  '説明文は日本語で簡潔に記述する。'
] as const

const buildClaimPrompt = (input: ClaimPromptInput): string => {
  const maxClaims = input.maxClaims ?? 12
  return [
    'タスク: 文書から主要な主張(claim)を抽出する。',
    ...COMMON_RULES,
    '出力スキーマ:',
    '{ "claims": [{ "claimId": "...", "text": "...", "paragraphIds": ["..."], "confidence": "low|medium|high" }] }',
    `最大件数: ${maxClaims}`,
    '注意: claim.text は元文の意味を維持し、冗長にしない。',
    '入力文書:',
    input.extractedText
  ].join('\n')
}

const buildEvidencePrompt = (input: EvidencePromptInput): string => {
  const claimsSection = input.claims
    .map((claim) => `- ${claim.claimId}: ${claim.claimText}`)
    .join('\n')

  return [
    'タスク: 各claimに対応する根拠段落・図・引用を対応づける。',
    ...COMMON_RULES,
    '出力スキーマ:',
    '{ "evidence": [{ "claimId": "...", "paragraphIds": ["..."], "figureIds": ["..."], "citationKeys": ["..."], "reason": "..." }] }',
    'Claims:',
    claimsSection || '- (no claims)',
    '入力文書:',
    input.extractedText
  ].join('\n')
}

const buildOralPrompt = (input: OralPromptInput): string => {
  return [
    'タスク: 口頭試問で使う質問を1つ生成し、期待回答の要点を作る。',
    ...COMMON_RULES,
    '出力スキーマ:',
    '{ "question": "...", "expectedAnswer": "...", "claimId": "...", "paragraphIds": ["..."] }',
    'question と expectedAnswer は日本語で書く。',
    `対象claim ID: ${input.focusClaimId}`,
    `対象claim: ${input.focusClaimText}`,
    '入力文書:',
    input.extractedText
  ].join('\n')
}
