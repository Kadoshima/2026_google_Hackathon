export type ParagraphChunk = {
  text: string
  start: number
  end: number
}

export const normalizeNewlines = (text: string): string =>
  text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

export const toSequentialId = (prefix: string, index: number): string =>
  `${prefix}_${String(index).padStart(4, '0')}`

const trimChunk = (raw: string, cursor: number): ParagraphChunk | null => {
  const text = raw.trim()
  if (!text) {
    return null
  }

  const trimmedStartInRaw = raw.indexOf(text)
  const start = cursor + trimmedStartInRaw
  return {
    text,
    start,
    end: start + text.length
  }
}

export const splitParagraphsWithOffsets = (text: string): ParagraphChunk[] => {
  const normalized = normalizeNewlines(text)
  const chunks: ParagraphChunk[] = []
  const separator = /\n{2,}/g
  let cursor = 0

  for (const match of normalized.matchAll(separator)) {
    const index = match.index
    if (index === undefined) {
      continue
    }

    const chunk = trimChunk(normalized.slice(cursor, index), cursor)
    if (chunk) {
      chunks.push(chunk)
    }
    cursor = index + match[0].length
  }

  const lastChunk = trimChunk(normalized.slice(cursor), cursor)
  if (lastChunk) {
    chunks.push(lastChunk)
  }

  return chunks
}

export const splitParagraphs = (text: string): string[] =>
  splitParagraphsWithOffsets(text)
    .map((chunk) => chunk.text)
    .filter((paragraph) => paragraph.length > 2)

const removeLineComment = (line: string): string => {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '%') {
      continue
    }

    const escaped = index > 0 && line[index - 1] === '\\'
    if (!escaped) {
      return line.slice(0, index)
    }
  }

  return line
}

export const removeLatexComments = (source: string): string =>
  normalizeNewlines(source)
    .split('\n')
    .map((line) => removeLineComment(line))
    .join('\n')

export const normalizeWhitespace = (text: string): string => text.replace(/[ \t]+/g, ' ').trim()
