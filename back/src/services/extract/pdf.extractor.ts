import zlib from 'node:zlib'
import { InputType } from '../../domain/enums.js'
import type { ExtractInTextCite, ExtractJson, ExtractParagraph } from '../../domain/types.js'
import { AppError, ErrorCodes } from '../../utils/errors.js'
import { normalizeNewlines, normalizeWhitespace, splitParagraphs, toSequentialId } from './normalize.js'

const PDF_HEADER_PREFIX = '%PDF-'

const decodePdfLiteral = (value: string): string => {
  let output = ''

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char !== '\\') {
      output += char
      continue
    }

    const next = value[index + 1]
    if (!next) {
      break
    }

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
    if (!arrayBody) {
      continue
    }
    let line = ''
    for (const tokenMatch of arrayBody.matchAll(literalPattern)) {
      const token = tokenMatch[0]
      line += decodePdfLiteral(token.slice(1, token.length - 1))
    }
    if (line.trim()) {
      fragments.push(line)
    }
  }

  return fragments
}

const getStreamContents = (pdfBuffer: Buffer): string[] => {
  const source = pdfBuffer.toString('latin1')
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  const streams: string[] = []

  for (const match of source.matchAll(streamPattern)) {
    const body = match[1]
    if (!body) {
      continue
    }

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

const extractPdfText = (pdfBuffer: Buffer): string => {
  const streams = getStreamContents(pdfBuffer)
  const fragments: string[] = []

  for (const stream of streams) {
    fragments.push(...extractTextOperators(stream))
  }

  const joined = fragments.join('\n')
  return normalizeNewlines(joined).replace(/[ \t]+\n/g, '\n').trim()
}

const buildParagraphs = (plainText: string): ExtractParagraph[] =>
  splitParagraphs(plainText).map((paragraph, index) => ({
    id: toSequentialId('p', index + 1),
    sectionId: null,
    text: normalizeWhitespace(paragraph)
  }))

const extractPdfCitationKeys = (paragraph: string): string[] => {
  const keys = new Set<string>()
  const numericPattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g
  const authorYearPattern = /\(([A-Z][A-Za-z-]+(?: et al\.)?,\s*\d{4}[a-z]?)\)/g

  for (const match of paragraph.matchAll(numericPattern)) {
    const raw = match[1]
    if (!raw) {
      continue
    }
    raw.split(',').forEach((value) => {
      const trimmed = value.trim()
      if (trimmed) {
        keys.add(`num:${trimmed}`)
      }
    })
  }

  for (const match of paragraph.matchAll(authorYearPattern)) {
    const raw = match[1]?.trim()
    if (!raw) {
      continue
    }
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

    try {
      plainText = extractPdfText(pdfBuffer)
    } catch (error) {
      warnings.push(
        `Failed to extract PDF text: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }

    const paragraphs = plainText ? buildParagraphs(plainText) : []
    if (paragraphs.length === 0) {
      warnings.push('PDF text extraction returned no paragraphs.')
    }

    const meta: NonNullable<ExtractJson['meta']> = {
      extractor: 'pdf-beta',
      createdAt: new Date().toISOString()
    }
    if (warnings.length > 0) {
      meta.warnings = warnings
    }

    return {
      schemaVersion: 'v1',
      analysisId,
      inputType: InputType.PDF,
      sections: [],
      paragraphs,
      figures: [],
      citations: {
        bibEntries: [],
        inTextCites: buildInTextCites(paragraphs)
      },
      meta
    }
  }
}
