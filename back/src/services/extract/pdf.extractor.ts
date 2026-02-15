import zlib from 'node:zlib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { GoogleAuth } from 'google-auth-library'
import { InputType } from '../../domain/enums.js'
import type {
  ExtractBibEntry,
  ExtractInTextCite,
  ExtractJson,
  ExtractParagraph,
  ExtractSection
} from '../../domain/types.js'
import { runPromptWithParts } from '../llm/vertex.client.js'
import { AppError, ErrorCodes } from '../../utils/errors.js'
import { normalizeNewlines, normalizeWhitespace, splitParagraphs, toSequentialId } from './normalize.js'

const PDF_HEADER_PREFIX = '%PDF-'
const LINE_MERGE_Y_TOLERANCE = 2.5
const PDF_VERTEX_FALLBACK_ENABLED = (process.env.PDF_VERTEX_FALLBACK_ENABLED ?? '1') !== '0'
const PDF_VERTEX_FALLBACK_MIN_PARAGRAPHS = Number(
  process.env.PDF_VERTEX_FALLBACK_MIN_PARAGRAPHS ?? 4
)
const PDF_VERTEX_FALLBACK_MIN_TEXT_ITEMS = Number(
  process.env.PDF_VERTEX_FALLBACK_MIN_TEXT_ITEMS ?? 40
)
const PDF_VERTEX_MAX_BYTES = Number(process.env.PDF_VERTEX_MAX_BYTES ?? 12 * 1024 * 1024)
const PDF_VERTEX_MAX_PARAGRAPHS = Number(process.env.PDF_VERTEX_MAX_PARAGRAPHS ?? 240)
const PDF_VERTEX_TIMEOUT_MS = Number(process.env.PDF_VERTEX_TIMEOUT_MS ?? 120000)
const PDF_VERTEX_MAX_RETRIES = Number(process.env.PDF_VERTEX_MAX_RETRIES ?? 1)
const PDF_VERTEX_RETRY_DELAY_MS = Number(process.env.PDF_VERTEX_RETRY_DELAY_MS ?? 600)
const PDF_VERTEX_MODEL = process.env.PDF_VERTEX_MODEL ?? process.env.VERTEX_MODEL
const PDF_MULTI_SOURCE_ENABLED = (process.env.PDF_MULTI_SOURCE_ENABLED ?? '1') !== '0'
const GCP_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const DOC_AI_ENABLED = (process.env.DOC_AI_ENABLED ?? '1') !== '0'
const DOC_AI_PROCESSOR_NAME = process.env.DOC_AI_PROCESSOR_NAME ?? ''
const DOC_AI_TIMEOUT_MS = Number(process.env.DOC_AI_TIMEOUT_MS ?? 120000)
const DOC_AI_MAX_BYTES = Number(process.env.DOC_AI_MAX_BYTES ?? 10 * 1024 * 1024)
const GROBID_ENABLED = (process.env.GROBID_ENABLED ?? '1') !== '0'
const GROBID_URL = (process.env.GROBID_URL ?? 'http://127.0.0.1:8070').replace(/\/+$/, '')
const GROBID_TIMEOUT_MS = Number(process.env.GROBID_TIMEOUT_MS ?? 120000)
const GROBID_MAX_BYTES = Number(process.env.GROBID_MAX_BYTES ?? 25 * 1024 * 1024)
const DOCLING_ENABLED = (process.env.DOCLING_ENABLED ?? '0') !== '0'
const DOCLING_EXTRACT_URL = process.env.DOCLING_EXTRACT_URL ?? ''
const DOCLING_TIMEOUT_MS = Number(process.env.DOCLING_TIMEOUT_MS ?? 180000)
const DOCLING_MAX_BYTES = Number(process.env.DOCLING_MAX_BYTES ?? 25 * 1024 * 1024)
const auth = new GoogleAuth({
  scopes: [GCP_SCOPE]
})

type ExtractPdfTextResult = {
  plainText: string
  stats: {
    pages: number
    textItems: number
  }
}

type PositionedText = {
  text: string
  x: number
  y: number
  height: number
  hasEOL: boolean
}

type TextLine = {
  y: number
  avgHeight: number
  parts: PositionedText[]
}

type RawTextItem = {
  str: string
  transform?: number[]
  height?: number
  hasEOL?: boolean
}

type VertexPdfParagraphOutput = {
  paragraphs: string[]
}

type SourceSection = {
  title: string
  level: number
}

type ExtractSourceCandidate = {
  source: string
  paragraphs: string[]
  sections: SourceSection[]
  bibEntries: ExtractBibEntry[]
  warnings: string[]
}

const decodePdfLiteral = (value: string): string => {
  let output = ''

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char !== '\\') {
      output += char
      continue
    }

    const next = value[index + 1]
    if (!next) break

    const escapeMap: Record<string, string> = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      '(': '(',
      ')': ')',
      '\\': '\\'
    }
    if (escapeMap[next]) {
      output += escapeMap[next]
      index += 1
      continue
    }

    if (/[0-7]/.test(next)) {
      let octal = next
      let offset = 2
      while (offset <= 3 && /[0-7]/.test(value[index + offset] ?? '')) {
        octal += value[index + offset]
        offset += 1
      }
      output += String.fromCharCode(Number.parseInt(octal, 8))
      index += octal.length
      continue
    }

    output += next
    index += 1
  }

  return output
}

const extractTextOperators = (source: string): string[] => {
  const fragments: string[] = []
  const simplePattern = /\((?:\\.|[^\\()])*\)\s*Tj/g
  const arrayPattern = /\[(.*?)\]\s*TJ/gs
  const literalPattern = /\((?:\\.|[^\\()])*\)/g

  for (const match of source.matchAll(simplePattern)) {
    const token = match[0]
    const literal = token.slice(1, token.lastIndexOf(')'))
    fragments.push(decodePdfLiteral(literal))
  }

  for (const match of source.matchAll(arrayPattern)) {
    const arrayBody = match[1]
    if (!arrayBody) continue

    let line = ''
    for (const tokenMatch of arrayBody.matchAll(literalPattern)) {
      const token = tokenMatch[0]
      line += decodePdfLiteral(token.slice(1, token.length - 1))
    }
    if (line.trim()) fragments.push(line)
  }

  return fragments
}

const getStreamContents = (pdfBuffer: Buffer): string[] => {
  const source = pdfBuffer.toString('latin1')
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  const streams: string[] = []

  for (const match of source.matchAll(streamPattern)) {
    const body = match[1]
    if (!body) continue

    const raw = Buffer.from(body, 'latin1')
    streams.push(raw.toString('latin1'))

    try {
      streams.push(zlib.inflateSync(raw).toString('latin1'))
    } catch {
      // Not a compressed stream.
    }
  }

  return streams
}

const extractPdfTextLegacy = (pdfBuffer: Buffer): string => {
  const streams = getStreamContents(pdfBuffer)
  const fragments: string[] = []

  for (const stream of streams) {
    fragments.push(...extractTextOperators(stream))
  }

  const joined = fragments.join('\n')
  return normalizeNewlines(joined).replace(/[ \t]+\n/g, '\n').trim()
}

const toRawTextItem = (value: unknown): RawTextItem | null => {
  if (!value || typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.str !== 'string') return null
  const transform = Array.isArray(record.transform)
    ? record.transform.filter((entry): entry is number => typeof entry === 'number')
    : null

  return {
    str: record.str,
    ...(transform ? { transform } : {}),
    ...(typeof record.height === 'number' ? { height: record.height } : {}),
    ...(typeof record.hasEOL === 'boolean' ? { hasEOL: record.hasEOL } : {})
  }
}

const toPositionedText = (value: unknown): PositionedText | null => {
  const item = toRawTextItem(value)
  if (!item) return null
  const text = normalizeWhitespace(item.str ?? '')
  const transform = Array.isArray(item.transform) ? item.transform : []
  const x = Number(transform[4] ?? 0)
  const y = Number(transform[5] ?? 0)
  const height = Math.max(1, Number(item.height ?? 0))
  return {
    text,
    x,
    y,
    height,
    hasEOL: Boolean(item.hasEOL)
  }
}

const appendLinePart = (line: TextLine, part: PositionedText): TextLine => {
  const nextParts = [...line.parts, part]
  const avgHeight =
    nextParts.reduce((sum, current) => sum + current.height, 0) / nextParts.length
  return {
    ...line,
    avgHeight,
    parts: nextParts
  }
}

const buildLinesFromItems = (items: unknown[]): TextLine[] => {
  const positioned = items
    .map(toPositionedText)
    .filter((item): item is PositionedText => Boolean(item))
    .filter((item) => item.text.length > 0)
    .sort((left, right) => {
      if (Math.abs(left.y - right.y) > LINE_MERGE_Y_TOLERANCE) return right.y - left.y
      return left.x - right.x
    })

  const lines: TextLine[] = []
  for (const part of positioned) {
    const last = lines[lines.length - 1]
    const canMerge = Boolean(last) && Math.abs((last?.y ?? 0) - part.y) <= LINE_MERGE_Y_TOLERANCE

    if (!canMerge) {
      lines.push({
        y: part.y,
        avgHeight: part.height,
        parts: [part]
      })
      continue
    }

    lines[lines.length - 1] = appendLinePart(last as TextLine, part)
    if (part.hasEOL) {
      // Hint that a new line starts next even when Y is close.
      lines.push({
        y: part.y - (last?.avgHeight ?? part.height),
        avgHeight: part.height,
        parts: []
      })
    }
  }

  return lines.filter((line) => line.parts.length > 0)
}

const isCjk = (value: string): boolean => /[\u3040-\u30ff\u3400-\u9fff]/.test(value)

const shouldInsertSpace = (prevText: string, nextText: string): boolean => {
  if (prevText.length === 0 || nextText.length === 0) return false
  const prevChar = prevText[prevText.length - 1] ?? ''
  const nextChar = nextText[0] ?? ''
  if (isCjk(prevChar) || isCjk(nextChar)) return false
  if (/[([{/"'\-]$/.test(prevText)) return false
  if (/^[)\]}:;,.!?]/.test(nextText)) return false
  return true
}

const composeLineText = (line: TextLine): string => {
  const sortedParts = [...line.parts].sort((left, right) => left.x - right.x)
  let output = ''
  for (const part of sortedParts) {
    if (output.length === 0) {
      output = part.text
      continue
    }
    output += shouldInsertSpace(output, part.text) ? ` ${part.text}` : part.text
  }
  return normalizeWhitespace(output)
}

const renderPageText = (items: unknown[]): string => {
  const lines = buildLinesFromItems(items)
  if (lines.length === 0) return ''

  const rendered: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    const previous = index > 0 ? lines[index - 1] : undefined
    if (previous) {
      const yGap = previous.y - line.y
      const threshold = Math.max(6, Math.max(previous.avgHeight, line.avgHeight) * 1.25)
      if (yGap > threshold) {
        rendered.push('')
      }
    }
    rendered.push(composeLineText(line))
  }

  return rendered.join('\n').trim()
}

const extractPdfTextWithPdfJs = async (pdfBuffer: Buffer): Promise<ExtractPdfTextResult> => {
  const task = getDocument({
    data: new Uint8Array(pdfBuffer)
  })

  let pages = 0
  let textItems = 0
  const pageTexts: string[] = []

  try {
    const document = await task.promise
    pages = document.numPages

    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
      const page = await document.getPage(pageIndex)
      const textContent = await page.getTextContent({
        includeMarkedContent: false
      })
      const items = textContent.items as unknown[]
      textItems += items.reduce<number>(
        (count: number, item: unknown) => (toRawTextItem(item) ? count + 1 : count),
        0
      )

      const pageText = renderPageText(items)
      if (pageText.length > 0) {
        pageTexts.push(pageText)
      }
    }
  } finally {
    await task.destroy()
  }

  return {
    plainText: pageTexts.join('\n\n').trim(),
    stats: {
      pages,
      textItems
    }
  }
}

const buildParagraphs = (plainText: string): ExtractParagraph[] =>
  splitParagraphs(plainText).map((paragraph, index) => ({
    id: toSequentialId('p', index + 1),
    sectionId: null,
    text: normalizeWhitespace(paragraph)
  }))

const buildParagraphsFromList = (paragraphs: string[]): ExtractParagraph[] =>
  paragraphs.map((paragraph, index) => ({
    id: toSequentialId('p', index + 1),
    sectionId: null,
    text: normalizeWhitespace(paragraph)
  }))

const normalizeExtractedText = (value: string): string =>
  normalizeNewlines(value).replace(/[ \t]+\n/g, '\n').trim()

const dedupeParagraphs = (paragraphs: string[]): string[] => {
  const seen = new Set<string>()
  const output: string[] = []

  for (const paragraph of paragraphs) {
    const normalized = normalizeWhitespace(paragraph)
    if (normalized.length < 3) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }

  return output
}

const sanitizePositiveNumber = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  if (normalized <= 0) return fallback
  return normalized
}

const parseVertexPdfParagraphOutput = (value: unknown): VertexPdfParagraphOutput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('vertex pdf extraction output must be an object')
  }

  const record = value as Record<string, unknown>
  const directParagraphs = record.paragraphs
  if (Array.isArray(directParagraphs)) {
    const paragraphs = dedupeParagraphs(directParagraphs.filter((item) => typeof item === 'string'))
    return { paragraphs }
  }

  const fullText = record.text
  if (typeof fullText === 'string') {
    return { paragraphs: splitParagraphs(normalizeExtractedText(fullText)) }
  }

  const pages = record.pages
  if (Array.isArray(pages)) {
    const lines = pages
      .map((page) => {
        if (!page || typeof page !== 'object' || Array.isArray(page)) return ''
        const text = (page as Record<string, unknown>).text
        return typeof text === 'string' ? text : ''
      })
      .filter((text) => text.trim().length > 0)

    return { paragraphs: splitParagraphs(normalizeExtractedText(lines.join('\n\n'))) }
  }

  throw new Error('vertex pdf extraction output has no paragraphs/text/pages')
}

const buildVertexPdfPrompt = (maxParagraphs: number): string =>
  [
    'Task: Read the attached PDF and extract textual paragraphs in reading order.',
    'Return strict JSON only. Do not use markdown.',
    'Output schema:',
    '{ "paragraphs": ["paragraph 1", "paragraph 2"] }',
    `Return at most ${maxParagraphs} paragraphs.`,
    'Keep original language and wording as much as possible.',
    'If the PDF is image-based, perform OCR and still return paragraphs.',
    'Do not summarize. Do not skip figure/table captions if readable.'
  ].join('\n')

const shouldTryVertexFallback = (input: {
  paragraphCount: number
  textItems: number
}): boolean => {
  if (!PDF_VERTEX_FALLBACK_ENABLED) return false
  if (input.textItems === 0 && input.paragraphCount === 0) return true
  return (
    input.paragraphCount < sanitizePositiveNumber(PDF_VERTEX_FALLBACK_MIN_PARAGRAPHS, 4) ||
    input.textItems < sanitizePositiveNumber(PDF_VERTEX_FALLBACK_MIN_TEXT_ITEMS, 40)
  )
}

const extractPdfParagraphsWithVertex = async (pdfBuffer: Buffer): Promise<string[]> => {
  const maxBytes = sanitizePositiveNumber(PDF_VERTEX_MAX_BYTES, 12 * 1024 * 1024)
  if (pdfBuffer.length > maxBytes) {
    throw new Error(`pdf buffer exceeds vertex fallback limit: ${pdfBuffer.length} > ${maxBytes}`)
  }

  const maxParagraphs = sanitizePositiveNumber(PDF_VERTEX_MAX_PARAGRAPHS, 240)
  const output = await runPromptWithParts<VertexPdfParagraphOutput>(
    [
      { text: buildVertexPdfPrompt(maxParagraphs) },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBuffer.toString('base64')
        }
      }
    ],
    { parse: parseVertexPdfParagraphOutput },
    {
      timeoutMs: sanitizePositiveNumber(PDF_VERTEX_TIMEOUT_MS, 120000),
      maxRetries: Math.max(0, Math.floor(PDF_VERTEX_MAX_RETRIES)),
      retryDelayMs: sanitizePositiveNumber(PDF_VERTEX_RETRY_DELAY_MS, 600),
      temperature: 0,
      ...(PDF_VERTEX_MODEL ? { model: PDF_VERTEX_MODEL } : {})
    }
  )

  return dedupeParagraphs(output.paragraphs)
}

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`request timeout after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const parseJsonSafe = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { raw }
  }
}

const toBlobBuffer = (value: Buffer): ArrayBuffer => Uint8Array.from(value).buffer

const getAccessToken = async (): Promise<string> => {
  const token = await auth.getAccessToken()
  if (!token) {
    throw new Error('failed to get access token for external PDF extraction')
  }
  return token
}

const flattenToParagraphs = (texts: string[]): string[] => {
  const chunks = texts.flatMap((text) => splitParagraphs(normalizeExtractedText(text)))
  return dedupeParagraphs(chunks)
}

const sanitizeSectionTitle = (title: string): string => {
  const normalized = normalizeWhitespace(title)
  return normalized.replace(/^[\d.\-)\s]+/, '').trim()
}

const dedupeSections = (sections: SourceSection[]): SourceSection[] => {
  const seen = new Set<string>()
  const output: SourceSection[] = []
  for (const section of sections) {
    const title = sanitizeSectionTitle(section.title)
    if (title.length < 2) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push({
      title,
      level: Math.max(1, Math.min(6, Math.floor(section.level)))
    })
  }
  return output
}

const dedupeBibEntries = (entries: ExtractBibEntry[]): ExtractBibEntry[] => {
  const seen = new Set<string>()
  const output: ExtractBibEntry[] = []
  for (const entry of entries) {
    const key = normalizeWhitespace(entry.key)
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    output.push({
      key,
      ...(entry.raw ? { raw: normalizeWhitespace(entry.raw) } : {})
    })
  }
  return output
}

const normalizeCandidate = (candidate: ExtractSourceCandidate): ExtractSourceCandidate => ({
  source: candidate.source,
  paragraphs: flattenToParagraphs(candidate.paragraphs),
  sections: dedupeSections(candidate.sections),
  bibEntries: dedupeBibEntries(candidate.bibEntries),
  warnings: candidate.warnings.map((warning) => normalizeWhitespace(warning))
})

const countCitationHints = (paragraphs: string[]): number => {
  const numericPattern = /\[\d+(?:\s*,\s*\d+)*\]/
  const authorYearPattern = /\([A-Z][A-Za-z-]+(?: et al\.)?,\s*\d{4}[a-z]?\)/
  return paragraphs.reduce((count, paragraph) => {
    if (numericPattern.test(paragraph) || authorYearPattern.test(paragraph)) {
      return count + 1
    }
    return count
  }, 0)
}

const scoreCandidate = (candidate: ExtractSourceCandidate): number => {
  const paragraphCount = candidate.paragraphs.length
  const totalChars = candidate.paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0)
  const avgLength = paragraphCount > 0 ? totalChars / paragraphCount : 0
  const citationParagraphs = countCitationHints(candidate.paragraphs)
  const citationDensity = paragraphCount > 0 ? citationParagraphs / paragraphCount : 0
  const sectionCount = candidate.sections.length
  const bibCount = candidate.bibEntries.length
  const warningPenalty = candidate.warnings.length * 1.2

  let score = 0
  score += Math.min(60, paragraphCount * 1.6)
  score += Math.min(45, totalChars / 240)
  score += avgLength >= 60 && avgLength <= 1000 ? 12 : avgLength >= 30 ? 5 : -8
  score += Math.min(18, sectionCount * 3)
  score += Math.min(14, bibCount * 0.8)
  score += Math.min(16, citationDensity * 32)
  score -= warningPenalty

  return Number(score.toFixed(2))
}

const rankCandidates = (candidates: ExtractSourceCandidate[]): Array<{
  candidate: ExtractSourceCandidate
  score: number
}> =>
  candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate)
    }))
    .sort((left, right) => right.score - left.score)

const pickByMost = <T>(
  candidates: ExtractSourceCandidate[],
  selector: (candidate: ExtractSourceCandidate) => T[]
): ExtractSourceCandidate | null => {
  let selected: ExtractSourceCandidate | null = null
  let max = 0

  for (const candidate of candidates) {
    const count = selector(candidate).length
    if (count > max) {
      selected = candidate
      max = count
    }
  }

  return selected
}

const toExtractSections = (sections: SourceSection[]): ExtractSection[] =>
  sections.map((section, index) => ({
    id: toSequentialId('sec', index + 1),
    title: section.title,
    level: section.level
  }))

const toDocAiText = (fullText: string, anchor: unknown): string => {
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) return ''
  const record = anchor as Record<string, unknown>
  const segments = record.textSegments
  if (!Array.isArray(segments) || segments.length === 0) return ''

  const texts = segments
    .map((segment) => {
      if (!segment || typeof segment !== 'object' || Array.isArray(segment)) return ''
      const segmentRecord = segment as Record<string, unknown>
      const start = Number(segmentRecord.startIndex ?? 0)
      const end = Number(segmentRecord.endIndex ?? 0)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ''
      return fullText.slice(start, end)
    })
    .filter((text) => text.trim().length > 0)

  return texts.join('\n')
}

const extractDocAiCandidate = async (pdfBuffer: Buffer): Promise<ExtractSourceCandidate | null> => {
  if (!DOC_AI_ENABLED) return null
  if (!DOC_AI_PROCESSOR_NAME) {
    throw new Error('DOC_AI_PROCESSOR_NAME is not configured')
  }

  const maxBytes = sanitizePositiveNumber(DOC_AI_MAX_BYTES, 10 * 1024 * 1024)
  if (pdfBuffer.length > maxBytes) {
    throw new Error(`docai input exceeds limit: ${pdfBuffer.length} > ${maxBytes}`)
  }

  const token = await getAccessToken()
  const endpoint = `https://documentai.googleapis.com/v1/${DOC_AI_PROCESSOR_NAME}:process`
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        skipHumanReview: true,
        rawDocument: {
          mimeType: 'application/pdf',
          content: pdfBuffer.toString('base64')
        }
      })
    },
    sanitizePositiveNumber(DOC_AI_TIMEOUT_MS, 120000)
  )

  const raw = await response.text()
  const payload = parseJsonSafe(raw)
  if (!response.ok) {
    throw new Error(`docai process failed: ${response.status}`)
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('docai response must be object')
  }

  const payloadRecord = payload as Record<string, unknown>
  const doc = payloadRecord.document
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('docai document is missing')
  }

  const docRecord = doc as Record<string, unknown>
  const fullText =
    typeof docRecord.text === 'string'
      ? docRecord.text
      : ''

  const paragraphTexts: string[] = []
  const pages = docRecord.pages
  if (Array.isArray(pages)) {
    for (const page of pages) {
      if (!page || typeof page !== 'object' || Array.isArray(page)) continue
      const pageRecord = page as Record<string, unknown>
      const paragraphs = pageRecord.paragraphs
      if (!Array.isArray(paragraphs)) continue

      for (const paragraph of paragraphs) {
        if (!paragraph || typeof paragraph !== 'object' || Array.isArray(paragraph)) continue
        const paragraphRecord = paragraph as Record<string, unknown>
        const layout = paragraphRecord.layout
        if (!layout || typeof layout !== 'object' || Array.isArray(layout)) continue
        const anchor = (layout as Record<string, unknown>).textAnchor
        const text = toDocAiText(fullText, anchor)
        if (text.trim().length > 0) {
          paragraphTexts.push(text)
        }
      }
    }
  }

  if (paragraphTexts.length === 0 && fullText.trim().length > 0) {
    paragraphTexts.push(fullText)
  }

  return normalizeCandidate({
    source: 'docai',
    paragraphs: paragraphTexts,
    sections: [],
    bibEntries: [],
    warnings: []
  })
}

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const stripXmlTags = (value: string): string =>
  normalizeWhitespace(decodeXmlEntities(value.replace(/<[^>]+>/g, ' ')))

const extractXmlContents = (xml: string, tagName: string): string[] => {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi')
  const values: string[] = []
  for (const match of xml.matchAll(pattern)) {
    const content = match[1]
    if (!content) continue
    const text = stripXmlTags(content)
    if (text.length > 0) values.push(text)
  }
  return values
}

const extractGrobidBibEntries = (xml: string): ExtractBibEntry[] => {
  const pattern = /<biblStruct\b([^>]*)>([\s\S]*?)<\/biblStruct>/gi
  const entries: ExtractBibEntry[] = []
  let index = 1

  for (const match of xml.matchAll(pattern)) {
    const attrs = match[1] ?? ''
    const content = match[2] ?? ''
    const idMatch = attrs.match(/\bxml:id="([^"]+)"/i)
    const raw = stripXmlTags(content)
    const key = idMatch?.[1]?.trim() || `bib_${index}`
    entries.push({
      key,
      ...(raw ? { raw } : {})
    })
    index += 1
  }

  return entries
}

const extractGrobidCandidate = async (pdfBuffer: Buffer): Promise<ExtractSourceCandidate | null> => {
  if (!GROBID_ENABLED) return null

  const maxBytes = sanitizePositiveNumber(GROBID_MAX_BYTES, 25 * 1024 * 1024)
  if (pdfBuffer.length > maxBytes) {
    throw new Error(`grobid input exceeds limit: ${pdfBuffer.length} > ${maxBytes}`)
  }

  const form = new FormData()
  form.append('input', new Blob([toBlobBuffer(pdfBuffer)], { type: 'application/pdf' }), 'paper.pdf')
  form.append('consolidateHeader', '1')
  form.append('consolidateCitations', '1')

  const response = await fetchWithTimeout(
    `${GROBID_URL}/api/processFulltextDocument`,
    {
      method: 'POST',
      body: form
    },
    sanitizePositiveNumber(GROBID_TIMEOUT_MS, 120000)
  )
  const teiXml = await response.text()
  if (!response.ok) {
    throw new Error(`grobid failed: ${response.status}`)
  }

  const sections = extractXmlContents(teiXml, 'head').map((title) => ({
    title,
    level: 1
  }))
  const paragraphs = extractXmlContents(teiXml, 'p')
  const bibEntries = extractGrobidBibEntries(teiXml)

  return normalizeCandidate({
    source: 'grobid',
    paragraphs,
    sections,
    bibEntries,
    warnings: []
  })
}

const parseDoclingPayloadToParagraphs = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const record = payload as Record<string, unknown>

  const directParagraphs = record.paragraphs
  if (Array.isArray(directParagraphs)) {
    return directParagraphs
      .filter((item): item is string => typeof item === 'string')
      .flatMap((text) => splitParagraphs(normalizeExtractedText(text)))
  }

  const text = record.text
  if (typeof text === 'string') {
    return splitParagraphs(normalizeExtractedText(text))
  }

  const markdown = record.markdown
  if (typeof markdown === 'string') {
    return splitParagraphs(normalizeExtractedText(markdown))
  }

  const chunks = record.chunks
  if (Array.isArray(chunks)) {
    return chunks
      .map((chunk) => {
        if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) return ''
        const chunkRecord = chunk as Record<string, unknown>
        if (typeof chunkRecord.text === 'string') return chunkRecord.text
        if (typeof chunkRecord.content === 'string') return chunkRecord.content
        return ''
      })
      .filter((value) => value.trim().length > 0)
      .flatMap((value) => splitParagraphs(normalizeExtractedText(value)))
  }

  return []
}

const extractDoclingCandidate = async (pdfBuffer: Buffer): Promise<ExtractSourceCandidate | null> => {
  if (!DOCLING_ENABLED) return null
  if (!DOCLING_EXTRACT_URL) {
    throw new Error('DOCLING_EXTRACT_URL is not configured')
  }

  const maxBytes = sanitizePositiveNumber(DOCLING_MAX_BYTES, 25 * 1024 * 1024)
  if (pdfBuffer.length > maxBytes) {
    throw new Error(`docling input exceeds limit: ${pdfBuffer.length} > ${maxBytes}`)
  }

  const form = new FormData()
  form.append('file', new Blob([toBlobBuffer(pdfBuffer)], { type: 'application/pdf' }), 'paper.pdf')
  const response = await fetchWithTimeout(
    DOCLING_EXTRACT_URL,
    {
      method: 'POST',
      body: form
    },
    sanitizePositiveNumber(DOCLING_TIMEOUT_MS, 180000)
  )
  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`docling failed: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const paragraphs = contentType.includes('application/json')
    ? parseDoclingPayloadToParagraphs(parseJsonSafe(raw))
    : splitParagraphs(normalizeExtractedText(raw))

  return normalizeCandidate({
    source: 'docling',
    paragraphs,
    sections: [],
    bibEntries: [],
    warnings: []
  })
}

const extractPdfCitationKeys = (paragraph: string): string[] => {
  const keys = new Set<string>()
  const numericPattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g
  const authorYearPattern = /\(([A-Z][A-Za-z-]+(?: et al\.)?,\s*\d{4}[a-z]?)\)/g

  for (const match of paragraph.matchAll(numericPattern)) {
    const raw = match[1]
    if (!raw) continue

    raw.split(',').forEach((value) => {
      const trimmed = value.trim()
      if (trimmed) keys.add(`num:${trimmed}`)
    })
  }

  for (const match of paragraph.matchAll(authorYearPattern)) {
    const raw = match[1]?.trim()
    if (!raw) continue
    keys.add(`ay:${raw.replace(/\s+/g, '_')}`)
  }

  return [...keys]
}

const buildInTextCites = (paragraphs: ExtractParagraph[]): ExtractInTextCite[] => {
  const cites: ExtractInTextCite[] = []
  for (const paragraph of paragraphs) {
    const keys = extractPdfCitationKeys(paragraph.text)
    if (keys.length > 0) {
      cites.push({
        paragraphId: paragraph.id,
        keys
      })
    }
  }
  return cites
}

export class PdfExtractor {
  async extract(pdfBuffer: Buffer, analysisId: string): Promise<ExtractJson> {
    if (!pdfBuffer.subarray(0, PDF_HEADER_PREFIX.length).toString('latin1').startsWith(PDF_HEADER_PREFIX)) {
      throw new AppError(ErrorCodes.INVALID_PDF, 'invalid pdf header', 400)
    }

    const warnings: string[] = []
    let plainText = ''
    let localExtractor = 'pdf-pdfjs-v1'
    let stats: ExtractPdfTextResult['stats'] = {
      pages: 0,
      textItems: 0
    }

    try {
      const extracted = await extractPdfTextWithPdfJs(pdfBuffer)
      plainText = extracted.plainText
      stats = extracted.stats
    } catch (error) {
      warnings.push(
        `pdfjs extraction failed, fallback to legacy extractor: ${error instanceof Error ? error.message : 'unknown error'}`
      )
      localExtractor = 'pdf-legacy-fallback'
      try {
        plainText = extractPdfTextLegacy(pdfBuffer)
      } catch (fallbackError) {
        warnings.push(
          `legacy extraction failed: ${fallbackError instanceof Error ? fallbackError.message : 'unknown error'}`
        )
      }
    }

    const normalizedText = normalizeExtractedText(plainText)
    let localParagraphs = normalizedText ? splitParagraphs(normalizedText) : []

    if (
      shouldTryVertexFallback({
        paragraphCount: localParagraphs.length,
        textItems: stats.textItems
      })
    ) {
      warnings.push(
        `pdfjs extraction looks sparse. trying vertex fallback (paragraphs=${localParagraphs.length}, textItems=${stats.textItems})`
      )
      try {
        const vertexParagraphs = await extractPdfParagraphsWithVertex(pdfBuffer)
        if (vertexParagraphs.length > localParagraphs.length) {
          localParagraphs = vertexParagraphs
          localExtractor = `${localExtractor}+vertex-fallback`
          warnings.push(`vertex fallback adopted (paragraphs=${vertexParagraphs.length})`)
        } else {
          warnings.push(
            `vertex fallback returned fewer/equal paragraphs (pdfjs=${localParagraphs.length}, vertex=${vertexParagraphs.length})`
          )
        }
      } catch (error) {
        warnings.push(
          `vertex fallback failed: ${error instanceof Error ? error.message : 'unknown error'}`
        )
      }
    }

    if (localParagraphs.length === 0) {
      warnings.push('PDF text extraction returned no paragraphs. The PDF may be image-based or font-embedded.')
    }

    const localCandidate = normalizeCandidate({
      source: localExtractor,
      paragraphs: localParagraphs,
      sections: [],
      bibEntries: [],
      warnings: [...warnings]
    })

    const candidates: ExtractSourceCandidate[] = [localCandidate]
    if (PDF_MULTI_SOURCE_ENABLED) {
      const results = await Promise.allSettled([
        extractDocAiCandidate(pdfBuffer),
        extractGrobidCandidate(pdfBuffer),
        extractDoclingCandidate(pdfBuffer)
      ])

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value && result.value.paragraphs.length > 0) {
            candidates.push(result.value)
          } else if (result.value && result.value.paragraphs.length === 0) {
            warnings.push(`${result.value.source} returned empty paragraphs`)
          }
          continue
        }
        warnings.push(
          `external extractor failed: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`
        )
      }
    }

    const ranked = rankCandidates(candidates)
    const primary = ranked[0]?.candidate ?? localCandidate
    const sectionDonor = pickByMost(candidates, (candidate) => candidate.sections) ?? primary
    const bibDonor = pickByMost(candidates, (candidate) => candidate.bibEntries) ?? primary
    const paragraphs = buildParagraphsFromList(primary.paragraphs)
    const sections = toExtractSections(sectionDonor.sections)
    const bibEntries = dedupeBibEntries(bibDonor.bibEntries)

    const rankingSummary = ranked
      .map(
        ({ candidate, score }) =>
          `${candidate.source}:score=${score},p=${candidate.paragraphs.length},sec=${candidate.sections.length},bib=${candidate.bibEntries.length}`
      )
      .join(' | ')
    warnings.push(
      `extractor_selection primary=${primary.source} section_donor=${sectionDonor.source} bib_donor=${bibDonor.source}`
    )
    warnings.push(`extractor_ranking ${rankingSummary}`)

    const meta: NonNullable<ExtractJson['meta']> = {
      extractor: `ensemble:${primary.source}`,
      createdAt: new Date().toISOString(),
      warnings: [
        ...warnings,
        `pdf_stats pages=${stats.pages} textItems=${stats.textItems} paragraphs=${paragraphs.length} sections=${sections.length} bib=${bibEntries.length}`
      ]
    }

    return {
      schemaVersion: 'v1',
      analysisId,
      inputType: InputType.PDF,
      sections,
      paragraphs,
      figures: [],
      citations: {
        bibEntries,
        inTextCites: buildInTextCites(paragraphs)
      },
      meta
    }
  }
}
