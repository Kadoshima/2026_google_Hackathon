import type { ExtractJson, PreflightFinding, PreflightResult } from '../../domain/types.js'
import { toSequentialId } from '../extract/normalize.js'

type BuildFindingInput = Omit<PreflightFinding, 'id'>

const buildFindings = (items: BuildFindingInput[]): PreflightFinding[] =>
  items.map((item, index) => ({
    id: toSequentialId('pf', index + 1),
    ...item
  }))

const collectFigureLabelRefs = (paragraphText: string): string[] => {
  const refs = new Set<string>()
  const pattern = /\\(?:ref|autoref|eqref)\{([^}]*)\}/g
  for (const match of paragraphText.matchAll(pattern)) {
    const label = match[1]?.trim()
    if (label) {
      refs.add(label)
    }
  }
  return [...refs]
}

const collectNumberedFigureRefs = (paragraphText: string): string[] => {
  const refs = new Set<string>()
  const pattern = /\b(?:Fig\.?|Figure)\s*(\d+)\b/gi
  for (const match of paragraphText.matchAll(pattern)) {
    const num = match[1]?.trim()
    if (num) {
      refs.add(num)
    }
  }
  return [...refs]
}

export const runPreflight = (extract: ExtractJson): PreflightResult => {
  const findings: BuildFindingInput[] = []

  const figureLabelToId = new Map<string, string>()
  extract.figures.forEach((figure) => {
    if (figure.label) {
      figureLabelToId.set(figure.label, figure.id)
    }
  })

  for (const figure of extract.figures) {
    if (!figure.label) {
      continue
    }

    if (figure.mentionedInParagraphIds.length === 0) {
      findings.push({
        kind: 'MISSING_FIGURE_REFERENCE',
        severity: 'error',
        message: `Figure ${figure.label} is never referenced in body text.`,
        refs: {
          figureIds: [figure.id]
        }
      })
    }
  }

  const unknownFigureRefs = new Map<string, Set<string>>()
  const unknownNumberedFigureRefs = new Map<string, Set<string>>()

  for (const paragraph of extract.paragraphs) {
    for (const label of collectFigureLabelRefs(paragraph.text)) {
      if (figureLabelToId.has(label)) {
        continue
      }
      const paragraphs = unknownFigureRefs.get(label) ?? new Set<string>()
      paragraphs.add(paragraph.id)
      unknownFigureRefs.set(label, paragraphs)
    }

    for (const refNum of collectNumberedFigureRefs(paragraph.text)) {
      const refIndex = Number.parseInt(refNum, 10)
      const existsByOrder =
        Number.isFinite(refIndex) && refIndex > 0 && refIndex <= extract.figures.length
      if (existsByOrder) {
        continue
      }
      const paragraphs = unknownNumberedFigureRefs.get(refNum) ?? new Set<string>()
      paragraphs.add(paragraph.id)
      unknownNumberedFigureRefs.set(refNum, paragraphs)
    }
  }

  for (const [label, paragraphIds] of unknownFigureRefs.entries()) {
    findings.push({
      kind: 'UNKNOWN_FIGURE_REFERENCE',
      severity: 'error',
      message: `Referenced figure label ${label} does not exist.`,
      refs: {
        paragraphIds: [...paragraphIds]
      }
    })
  }

  for (const [refNum, paragraphIds] of unknownNumberedFigureRefs.entries()) {
    findings.push({
      kind: 'UNKNOWN_FIGURE_REFERENCE',
      severity: 'warning',
      message: `Referenced figure number ${refNum} does not exist.`,
      refs: {
        paragraphIds: [...paragraphIds]
      }
    })
  }

  const bibKeySet = new Set(extract.citations.bibEntries.map((entry) => entry.key))
  const usedCitationKeys = new Set<string>()
  const missingCitationKeyParagraphs = new Map<string, Set<string>>()

  for (const cite of extract.citations.inTextCites) {
    for (const key of cite.keys) {
      usedCitationKeys.add(key)
      if (bibKeySet.has(key)) {
        continue
      }
      const paragraphIds = missingCitationKeyParagraphs.get(key) ?? new Set<string>()
      paragraphIds.add(cite.paragraphId)
      missingCitationKeyParagraphs.set(key, paragraphIds)
    }
  }

  for (const [key, paragraphIds] of missingCitationKeyParagraphs.entries()) {
    findings.push({
      kind: 'MISSING_BIB_ENTRY',
      severity: 'error',
      message: `Citation key ${key} is used in text but missing in bibliography.`,
      refs: {
        paragraphIds: [...paragraphIds],
        citationKeys: [key]
      }
    })
  }

  for (const bibEntry of extract.citations.bibEntries) {
    if (usedCitationKeys.has(bibEntry.key)) {
      continue
    }
    findings.push({
      kind: 'UNCITED_BIB_ENTRY',
      severity: 'warning',
      message: `Bibliography key ${bibEntry.key} is never cited in text.`,
      refs: {
        citationKeys: [bibEntry.key]
      }
    })
  }

  const resultFindings = buildFindings(findings)
  const errorCount = resultFindings.filter((finding) => finding.severity === 'error').length
  const warningCount = resultFindings.length - errorCount

  return {
    findings: resultFindings,
    summary: {
      errorCount,
      warningCount
    }
  }
}
