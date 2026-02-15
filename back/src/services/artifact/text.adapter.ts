import { ArtifactType, InputType } from '../../domain/enums.js'
import type { ArtifactType as ArtifactTypeValue } from '../../domain/enums.js'
import type { ExtractJson } from '../../domain/types.js'
import { AppError, ErrorCodes } from '../../utils/errors.js'
import { normalizeNewlines, splitParagraphs, toSequentialId } from '../extract/normalize.js'
import type { ArtifactAdapter, ArtifactExtractRequest } from './types.js'

type TextArtifactType = Extract<ArtifactTypeValue, 'PR' | 'DOC' | 'SHEET'>

type TextArtifactAdapterOptions = {
  artifactType: TextArtifactType
}

type SectionSeed = {
  title: string
  level: number
  startLine: number
}

type ParagraphSeed = {
  text: string
  sectionTitle?: string
}

export class TextArtifactAdapter implements ArtifactAdapter {
  readonly artifactType: TextArtifactType

  constructor(options: TextArtifactAdapterOptions) {
    this.artifactType = options.artifactType
  }

  async extract(input: ArtifactExtractRequest): Promise<ExtractJson> {
    assertInputTypeCompatibility(this.artifactType, input.inputType)

    const decoded = decodeBufferToText(input.rawBuffer)
    if (!decoded.trim()) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'artifact text is empty', 400, {
        artifactType: this.artifactType
      })
    }

    const warnings: string[] = []
    const parsed =
      this.artifactType === ArtifactType.SHEET
        ? parseSheetText(decoded)
        : parseStructuredText(decoded, this.artifactType)

    if (parsed.paragraphs.length === 0) {
      warnings.push('no structured paragraph blocks found; fallback paragraph split applied')
      const fallback = splitParagraphs(normalizeNewlines(decoded))
      parsed.paragraphs = fallback.map((text) => ({ text }))
    }

    const artifactSignals = buildArtifactSignals(this.artifactType, decoded, parsed)
    if (artifactSignals.paragraphs.length > 0) {
      parsed.sections.push({
        title: 'Artifact Signals',
        level: 2,
        startLine: 1
      })
      parsed.paragraphs.push(
        ...artifactSignals.paragraphs.map((text) => ({ text, sectionTitle: 'Artifact Signals' }))
      )
    }
    warnings.push(...artifactSignals.warnings)

    const sections = parsed.sections.map((section, index) => ({
      id: toSequentialId('sec', index + 1),
      title: section.title,
      level: section.level
    }))
    const sectionIdByTitle = new Map(sections.map((section) => [section.title, section.id]))

    const paragraphs = parsed.paragraphs.map((paragraph, index) => ({
      id: toSequentialId('par', index + 1),
      sectionId: paragraph.sectionTitle
        ? sectionIdByTitle.get(paragraph.sectionTitle) ?? null
        : null,
      text: paragraph.text
    }))

    if (sections.length === 0) {
      warnings.push('no section headings detected')
    }

    return {
      schemaVersion: 'v1',
      analysisId: input.analysisId,
      inputType: input.inputType,
      sections,
      paragraphs,
      figures: [],
      citations: {
        bibEntries: [],
        inTextCites: []
      },
      meta: {
        extractor: `artifact-${this.artifactType.toLowerCase()}-v2`,
        createdAt: new Date().toISOString(),
        warnings
      }
    }
  }
}

const assertInputTypeCompatibility = (artifactType: ArtifactType, inputType: InputType): void => {
  if (artifactType === ArtifactType.PR && inputType === InputType.PR_TEXT) return
  if (artifactType === ArtifactType.DOC && inputType === InputType.DOC_TEXT) return
  if (artifactType === ArtifactType.SHEET && inputType === InputType.SHEET_TEXT) return

  throw new AppError(ErrorCodes.INVALID_INPUT, 'inputType does not match artifactType', 400, {
    artifactType,
    inputType
  })
}

const decodeBufferToText = (raw: Buffer): string => {
  const utf8 = raw.toString('utf8')
  if (!utf8.includes('\u0000')) return utf8
  return raw.toString('latin1')
}

const parseStructuredText = (
  rawText: string,
  artifactType: Extract<TextArtifactType, 'PR' | 'DOC'>
): { sections: SectionSeed[]; paragraphs: ParagraphSeed[] } => {
  const lines = normalizeNewlines(rawText).split('\n')
  const sections: SectionSeed[] = []
  const paragraphs: ParagraphSeed[] = []

  let currentHeading: string | undefined
  const block: string[] = []

  const flush = () => {
    if (block.length === 0) return
    const text = block.join('\n').trim()
    block.length = 0
    if (!text) return

    const chunks = splitParagraphs(text)
    if (chunks.length > 0) {
      for (const chunk of chunks) {
        paragraphs.push({
          text: chunk,
          ...(currentHeading ? { sectionTitle: currentHeading } : {})
        })
      }
      return
    }

    paragraphs.push({
      text,
      ...(currentHeading ? { sectionTitle: currentHeading } : {})
    })
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const heading = detectHeading(line, artifactType)
    if (heading) {
      flush()
      currentHeading = heading.title
      sections.push({
        title: heading.title,
        level: heading.level,
        startLine: index + 1
      })
      continue
    }

    if (!line.trim()) {
      flush()
      continue
    }

    block.push(line)
  }

  flush()

  return {
    sections: dedupeSections(sections),
    paragraphs: paragraphs.filter((paragraph) => paragraph.text.trim().length > 0)
  }
}

const parseSheetText = (rawText: string): { sections: SectionSeed[]; paragraphs: ParagraphSeed[] } => {
  const normalized = normalizeNewlines(rawText).trim()

  const maybeJson = safeParseJson(normalized)
  if (maybeJson) {
    const pretty = JSON.stringify(maybeJson, null, 2)
    const paragraphs = splitParagraphs(pretty)
    return {
      sections: [{ title: 'Sheet JSON', level: 1, startLine: 1 }],
      paragraphs: paragraphs.map((text) => ({ text, sectionTitle: 'Sheet JSON' }))
    }
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const rows = lines.slice(0, 500)
  return {
    sections: [{ title: 'Sheet Rows', level: 1, startLine: 1 }],
    paragraphs: rows.map((row) => ({ text: row, sectionTitle: 'Sheet Rows' }))
  }
}

const safeParseJson = (raw: string): unknown | null => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

const detectHeading = (
  line: string,
  artifactType: Extract<TextArtifactType, 'PR' | 'DOC'>
): { title: string; level: number } | null => {
  const markdown = line.match(/^(#{1,6})\s+(.+)$/)
  if (markdown) {
    const title = markdown[2]?.trim()
    if (title) {
      return {
        title,
        level: markdown[1]?.length ?? 1
      }
    }
  }

  if (artifactType === ArtifactType.PR) {
    const diffHeader = line.match(/^diff --git\s+a\/.+\s+b\/(.+)$/)
    if (diffHeader && diffHeader[1]) {
      return {
        title: `Diff: ${diffHeader[1]}`,
        level: 2
      }
    }

    const prHeader = line.match(/^([A-Za-z][A-Za-z0-9 _\-]{2,40}):\s*$/)
    if (prHeader && prHeader[1]) {
      return {
        title: prHeader[1].trim(),
        level: 2
      }
    }
  }

  if (artifactType === ArtifactType.DOC) {
    const numbered = line.match(/^(\d{1,2}(?:\.\d{1,2})*)\s+(.+)$/)
    if (numbered && numbered[2]) {
      const depth = (numbered[1]?.match(/\./g)?.length ?? 0) + 1
      return {
        title: numbered[2].trim(),
        level: Math.min(6, depth)
      }
    }
  }

  return null
}

const dedupeSections = (sections: SectionSeed[]): SectionSeed[] => {
  const seen = new Set<string>()
  const result: SectionSeed[] = []
  for (const section of sections) {
    const key = section.title.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(section)
  }
  return result
}

const buildArtifactSignals = (
  artifactType: TextArtifactType,
  rawText: string,
  parsed: { sections: SectionSeed[]; paragraphs: ParagraphSeed[] }
): { paragraphs: string[]; warnings: string[] } => {
  if (artifactType === ArtifactType.DOC) {
    return buildDocSignals(rawText, parsed)
  }
  if (artifactType === ArtifactType.SHEET) {
    return buildSheetSignals(rawText, parsed)
  }
  return { paragraphs: [], warnings: [] }
}

const buildDocSignals = (
  rawText: string,
  parsed: { sections: SectionSeed[]; paragraphs: ParagraphSeed[] }
): { paragraphs: string[]; warnings: string[] } => {
  const lower = rawText.toLowerCase()
  const hasEvidence = /\b(evidence|data|result|metric|根拠|データ|結果|実験)\b/i.test(lower)
  const hasDecision = /\b(decision|trade[- ]?off|理由|判断|選定)\b/i.test(lower)
  const hasRisk = /\b(risk|constraint|limitation|課題|制約|リスク)\b/i.test(lower)
  const hasAssumption = /\b(assumption|premise|前提|想定)\b/i.test(lower)

  const paragraphs: string[] = [
    `DOC統計: sections=${parsed.sections.length}, paragraphs=${parsed.paragraphs.length}`
  ]
  const warnings: string[] = []

  if (!hasEvidence) {
    paragraphs.push('信号: 根拠（Evidence/Data）を示す記述が少ない可能性があります。')
    warnings.push('根拠を示す語が少ないため、主張と根拠の対応が弱くなる可能性があります。')
  }
  if (!hasDecision) {
    paragraphs.push('信号: 意思決定理由（Decision/Trade-off）の記述が不足しています。')
  }
  if (!hasRisk) {
    paragraphs.push('信号: リスク/制約（Risk/Constraint）の記述が不足しています。')
  }
  if (!hasAssumption) {
    paragraphs.push('信号: 前提条件（Assumption/Premise）の明示が不足しています。')
  }

  return { paragraphs, warnings }
}

const buildSheetSignals = (
  rawText: string,
  parsed: { sections: SectionSeed[]; paragraphs: ParagraphSeed[] }
): { paragraphs: string[]; warnings: string[] } => {
  const lines = normalizeNewlines(rawText)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const numericLikeRows = lines.filter((line) => /(?:^|,|\s)\d+(?:\.\d+)?(?:,|\s|$)/.test(line)).length
  const formulaLikeRows = lines.filter((line) => /(?:^|\W)=\s*[A-Z]/.test(line)).length

  const paragraphs: string[] = [
    `SHEET統計: rows=${lines.length}, paragraphs=${parsed.paragraphs.length}, numeric_rows=${numericLikeRows}`
  ]
  const warnings: string[] = []

  if (formulaLikeRows === 0) {
    paragraphs.push('信号: 数式/計算ロジックの明示が少ないため、算出根拠の追跡が難しい可能性があります。')
  }
  if (numericLikeRows === 0) {
    warnings.push('数値セルらしき行が検出できません。集計結果の妥当性を評価しにくい状態です。')
    paragraphs.push('信号: 数値データが少ないため、意思決定根拠の定量性が不足している可能性があります。')
  }
  if (!/\b(source|origin|reference|根拠|出典)\b/i.test(rawText)) {
    paragraphs.push('信号: 出典（source/reference）の明示が不足しています。')
  }

  return { paragraphs, warnings }
}
