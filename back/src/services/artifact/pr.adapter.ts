import { ArtifactType, InputType } from '../../domain/enums.js'
import type { ExtractJson } from '../../domain/types.js'
import { AppError, ErrorCodes } from '../../utils/errors.js'
import { normalizeNewlines, normalizeWhitespace, splitParagraphs, toSequentialId } from '../extract/normalize.js'
import type { ArtifactAdapter, ArtifactExtractRequest } from './types.js'

type SectionSeed = {
  title: string
  level: number
}

type ParagraphSeed = {
  text: string
  sectionTitle?: string
}

type ParsedDiffHunk = {
  filePath: string
  hunkHeader: string
  added: string[]
  removed: string[]
  context: string[]
}

type DiffSignal = {
  text: string
  warning?: string
}

const CODE_FILE_PATTERN =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|rb|php|rs|swift|c|cc|cpp|h|hpp|cs)$/i
const TEST_FILE_PATTERN =
  /(?:^|\/)(?:test|tests|__tests__|spec|specs)(?:\/|$)|\.(?:test|spec)\.[jt]sx?$/i
const MIGRATION_FILE_PATTERN = /(?:migration|migrations|schema|ddl|sql|prisma)/i
const SECURITY_FILE_PATTERN = /(?:auth|permission|policy|acl|oauth|token|secret|credential|key|iam|security)/i

const RISK_PATTERNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'todo', label: 'TODO/FIXME/HACKが追加されています', pattern: /\b(?:TODO|FIXME|HACK)\b/i },
  {
    id: 'debug',
    label: 'デバッグ出力と思われる行が追加されています',
    pattern: /\b(?:console\.log|print\(|fmt\.Print|logger\.debug|System\.out\.println)\b/
  },
  {
    id: 'suppress',
    label: '型/静的解析の抑制が追加されています',
    pattern: /\b(?:@ts-ignore|eslint-disable|any\b|type:\s*ignore|noinspection)\b/i
  },
  {
    id: 'skip_test',
    label: 'テストスキップ記法が追加されています',
    pattern: /\b(?:it|test|describe)\.skip\b|\bskip\(/i
  },
  {
    id: 'secret',
    label: 'シークレットのハードコード疑いがある文字列があります',
    pattern:
      /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z-_]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----)\b/
  }
]

export class PrArtifactAdapter implements ArtifactAdapter {
  readonly artifactType = ArtifactType.PR

  async extract(input: ArtifactExtractRequest): Promise<ExtractJson> {
    if (input.inputType !== InputType.PR_TEXT) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'PR adapter requires PR_TEXT input', 400, {
        inputType: input.inputType
      })
    }

    const raw = decodeBufferToText(input.rawBuffer)
    const normalized = normalizeNewlines(raw).trim()
    if (!normalized) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'PR artifact text is empty', 400)
    }

    const sections: SectionSeed[] = []
    const paragraphs: ParagraphSeed[] = []
    const warnings: string[] = []

    const parsedTextSections = parseMarkdownSections(normalized)
    for (const section of parsedTextSections) {
      sections.push({
        title: section.title,
        level: section.level
      })
      for (const paragraph of section.paragraphs) {
        paragraphs.push({
          text: paragraph,
          sectionTitle: section.title
        })
      }
    }

    const hunks = parseUnifiedDiffHunks(normalized)
    if (hunks.length === 0) {
      warnings.push('unified diffが見つからないため、コード変更の根拠検査は限定されます')
    } else {
      sections.push({ title: 'Diff Changes', level: 2 })
      for (const [index, hunk] of hunks.entries()) {
        const summary = buildHunkSummary(hunk, index + 1)
        paragraphs.push({
          text: summary,
          sectionTitle: 'Diff Changes'
        })
      }
    }

    const diffSignals = analyzeDiffSignals(hunks, normalized)
    if (diffSignals.length > 0) {
      sections.push({ title: 'PR Review Signals', level: 2 })
      for (const signal of diffSignals) {
        paragraphs.push({
          text: signal.text,
          sectionTitle: 'PR Review Signals'
        })
        if (signal.warning) warnings.push(signal.warning)
      }
    }

    const normalizedSections = dedupeSections(sections)
    const normalizedParagraphs = dedupeParagraphs(paragraphs)

    if (normalizedParagraphs.length === 0) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'no analyzable PR paragraphs found', 400)
    }

    const outputSections = normalizedSections.map((section, index) => ({
      id: toSequentialId('sec', index + 1),
      title: section.title,
      level: section.level
    }))
    const sectionIdByTitle = new Map(outputSections.map((section) => [section.title, section.id]))

    const outputParagraphs = normalizedParagraphs.map((paragraph, index) => ({
      id: toSequentialId('par', index + 1),
      sectionId: paragraph.sectionTitle
        ? sectionIdByTitle.get(paragraph.sectionTitle) ?? null
        : null,
      text: paragraph.text
    }))

    return {
      schemaVersion: 'v1',
      analysisId: input.analysisId,
      inputType: input.inputType,
      sections: outputSections,
      paragraphs: outputParagraphs,
      figures: [],
      citations: {
        bibEntries: [],
        inTextCites: []
      },
      meta: {
        extractor: 'artifact-pr-v3',
        createdAt: new Date().toISOString(),
        warnings
      }
    }
  }
}

const decodeBufferToText = (raw: Buffer): string => {
  const utf8 = raw.toString('utf8')
  if (!utf8.includes('\u0000')) return utf8
  return raw.toString('latin1')
}

const parseMarkdownSections = (text: string): Array<{ title: string; level: number; paragraphs: string[] }> => {
  const lines = text.split('\n')
  const sections: Array<{ title: string; level: number; paragraphs: string[] }> = []

  let currentTitle = 'PR Overview'
  let currentLevel = 1
  let block: string[] = []

  const flush = () => {
    if (block.length === 0) return
    const joined = block.join('\n').trim()
    block = []
    if (!joined) return

    const paragraphs = splitParagraphs(joined)
    sections.push({
      title: currentTitle,
      level: currentLevel,
      paragraphs: paragraphs.length > 0 ? paragraphs : [joined]
    })
  }

  for (const line of lines) {
    const heading = detectHeading(line)
    if (heading) {
      flush()
      currentTitle = heading.title
      currentLevel = heading.level
      continue
    }

    // Raw diff lines are handled in dedicated diff parser.
    if (line.startsWith('diff --git ') || line.startsWith('@@ ')) {
      flush()
      continue
    }

    block.push(line)
  }

  flush()
  return sections
}

const detectHeading = (line: string): { title: string; level: number } | null => {
  const markdownHeading = line.match(/^(#{1,6})\s+(.+)$/)
  if (markdownHeading) {
    const title = markdownHeading[2]?.trim()
    if (title) {
      return {
        title,
        level: markdownHeading[1]?.length ?? 1
      }
    }
  }

  const labeledHeading = line.match(/^([A-Za-z][A-Za-z0-9 _\-/]{2,40}):\s*$/)
  if (labeledHeading && labeledHeading[1]) {
    return {
      title: labeledHeading[1].trim(),
      level: 2
    }
  }

  return null
}

const parseUnifiedDiffHunks = (text: string): ParsedDiffHunk[] => {
  const lines = text.split('\n')
  const hunks: ParsedDiffHunk[] = []

  let currentFilePath = 'unknown'
  let currentHunk: ParsedDiffHunk | null = null

  const flushHunk = () => {
    if (!currentHunk) return
    hunks.push(currentHunk)
    currentHunk = null
  }

  for (const line of lines) {
    const diffHeader = line.match(/^diff --git\s+a\/.+\s+b\/(.+)$/)
    if (diffHeader && diffHeader[1]) {
      flushHunk()
      currentFilePath = diffHeader[1]
      continue
    }

    if (line.startsWith('@@')) {
      flushHunk()
      currentHunk = {
        filePath: currentFilePath,
        hunkHeader: line,
        added: [],
        removed: [],
        context: []
      }
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.added.push(line.slice(1))
      continue
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.removed.push(line.slice(1))
      continue
    }

    if (line.startsWith(' ') || line.trim().length > 0) {
      currentHunk.context.push(line.replace(/^ /, ''))
    }
  }

  flushHunk()
  return hunks
}

const buildHunkSummary = (hunk: ParsedDiffHunk, index: number): string => {
  const addedPreview = joinPreview(hunk.added)
  const removedPreview = joinPreview(hunk.removed)
  const contextPreview = joinPreview(hunk.context)

  return [
    `Diff Hunk ${index}: file=${hunk.filePath}`,
    `header=${hunk.hunkHeader}`,
    `added(${hunk.added.length})=${addedPreview}`,
    `removed(${hunk.removed.length})=${removedPreview}`,
    `context=${contextPreview}`
  ].join(' | ')
}

const analyzeDiffSignals = (hunks: ParsedDiffHunk[], rawText: string): DiffSignal[] => {
  if (hunks.length === 0) return []

  const files = [...new Set(hunks.map((hunk) => hunk.filePath))]
  const addedLines = hunks.flatMap((hunk) => hunk.added)
  const removedLines = hunks.flatMap((hunk) => hunk.removed)
  const totalAdded = addedLines.length
  const totalRemoved = removedLines.length

  const codeFiles = files.filter((filePath) => CODE_FILE_PATTERN.test(filePath))
  const testFiles = files.filter((filePath) => TEST_FILE_PATTERN.test(filePath))
  const migrationFiles = files.filter((filePath) => MIGRATION_FILE_PATTERN.test(filePath))
  const securityFiles = files.filter((filePath) => SECURITY_FILE_PATTERN.test(filePath))

  const signals: DiffSignal[] = []

  signals.push({
    text: `PR統計: files=${files.length}, hunks=${hunks.length}, added=${totalAdded}, removed=${totalRemoved}`
  })

  signals.push({
    text: `テスト信号: code_files=${codeFiles.length}, test_files=${testFiles.length}`,
    ...(codeFiles.length > 0 && testFiles.length === 0
      ? {
          warning: 'コード変更がある一方でテスト変更が見つかりません。回帰検証の根拠が不足する可能性があります。'
        }
      : {})
  })

  if (securityFiles.length > 0) {
    signals.push({
      text: `セキュリティ関連ファイル変更: ${securityFiles.slice(0, 5).join(', ')}`,
      warning: '認証/権限/秘密情報に関わる変更です。境界条件と権限モデルの説明が必要です。'
    })
  }

  if (migrationFiles.length > 0) {
    const hasMigrationExplanation = /\b(?:migration|migrate|schema|ddl|roll ?back|ロールバック|移行)\b/i.test(
      rawText
    )
    signals.push({
      text: `スキーマ変更ファイル: ${migrationFiles.slice(0, 5).join(', ')}`,
      ...(!hasMigrationExplanation
        ? { warning: 'スキーマ変更の説明が見当たりません。移行手順とロールバック条件を追記してください。' }
        : {})
    })
  }

  if (totalAdded + totalRemoved >= 1200) {
    signals.push({
      text: `大規模差分: total_lines=${totalAdded + totalRemoved}`,
      warning: '差分が大きいため、段階的リリース計画・監視項目・失敗時対応の明記を推奨します。'
    })
  }

  for (const rule of RISK_PATTERNS) {
    const hits = addedLines.filter((line) => rule.pattern.test(line))
    if (hits.length === 0) continue
    signals.push({
      text: `リスク信号(${rule.id}): ${rule.label} (count=${hits.length})`,
      warning: `${rule.label}。意図と安全策を本文に明示してください。`
    })
  }

  const removedAssertions = removedLines.filter((line) =>
    /\b(?:expect\(|assert\(|toEqual\(|toBe\(|pytest\.raises|should\b)\b/.test(line)
  )
  if (removedAssertions.length > 0) {
    signals.push({
      text: `検証削除信号: assertion-like lines removed count=${removedAssertions.length}`,
      warning: '検証ロジックの削除が含まれます。削除理由と代替検証の説明が必要です。'
    })
  }

  const changedFunctions = collectChangedFunctionNames(addedLines)
  if (changedFunctions.length > 0) {
    signals.push({
      text: `変更関数候補: ${changedFunctions.slice(0, 8).join(', ')}`
    })
  }

  return signals
}

const collectChangedFunctionNames = (lines: string[]): string[] => {
  const names = new Set<string>()

  const patterns = [
    /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    /\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\([^)]*\)\s*=>/,
    /\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*function\s*\(/,
    /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/
  ]

  for (const line of lines) {
    const normalized = normalizeWhitespace(line)
    for (const pattern of patterns) {
      const match = normalized.match(pattern)
      const name = match?.[1]?.trim()
      if (name) names.add(name)
    }
  }

  return [...names]
}

const joinPreview = (lines: string[]): string => {
  const normalized = lines
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0)
  if (normalized.length === 0) return '(none)'
  return normalized.slice(0, 3).join(' ; ').slice(0, 260)
}

const dedupeSections = (sections: SectionSeed[]): SectionSeed[] => {
  const seen = new Set<string>()
  const result: SectionSeed[] = []
  for (const section of sections) {
    const title = section.title.trim()
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      title,
      level: Math.max(1, Math.min(6, Math.floor(section.level)))
    })
  }
  return result
}

const dedupeParagraphs = (paragraphs: ParagraphSeed[]): ParagraphSeed[] => {
  const seen = new Set<string>()
  const result: ParagraphSeed[] = []
  for (const paragraph of paragraphs) {
    const text = paragraph.text.trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      text,
      ...(paragraph.sectionTitle ? { sectionTitle: paragraph.sectionTitle } : {})
    })
  }
  return result
}
