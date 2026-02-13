import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { InputType } from '../../domain/enums.js'
import type {
  ExtractBibEntry,
  ExtractFigure,
  ExtractInTextCite,
  ExtractJson,
  ExtractParagraph,
  ExtractSection
} from '../../domain/types.js'
import { AppError, ErrorCodes, isAppError } from '../../utils/errors.js'
import {
  normalizeNewlines,
  normalizeWhitespace,
  removeLatexComments,
  splitParagraphsWithOffsets,
  toSequentialId
} from './normalize.js'

const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_LOCAL_SIGNATURE = 0x04034b50

const DEFAULT_MAX_FILES = 2000
const DEFAULT_MAX_TOTAL_BYTES = 200 * 1024 * 1024
const DEFAULT_MAX_SINGLE_FILE_BYTES = 20 * 1024 * 1024

const TMP_ANALYSIS_ROOT = '/tmp/analysis'

const ALLOWED_EXTENSIONS = new Set<string>([
  '.tex',
  '.bib',
  '.bst',
  '.cls',
  '.sty',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.eps',
  '.csv'
])

type ZipCentralEntry = {
  fileName: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  externalAttributes: number
  localHeaderOffset: number
  isDirectory: boolean
}

export type ExpandedLatexProject = {
  rootDir: string
  entryTexCandidates: string[]
  extractedFiles: string[]
}

type ExtractedLatexSource = {
  source: string
  warnings: string[]
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toSafeEntryPath = (entryPath: string): string => {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('\0')) {
    throw new AppError(ErrorCodes.INVALID_ZIP_PATH, 'invalid zip entry path', 400, { entryPath })
  }
  if (path.isAbsolute(normalized) || normalized.split('/').some((part) => part === '..')) {
    throw new AppError(ErrorCodes.INVALID_ZIP_PATH, 'zip entry escapes base dir', 400, { entryPath })
  }
  return normalized
}

const ensureInsideBaseDir = (baseDir: string, safeEntryPath: string): string => {
  const fullPath = path.resolve(baseDir, safeEntryPath)
  const resolvedBaseDir = path.resolve(baseDir)
  if (!fullPath.startsWith(`${resolvedBaseDir}${path.sep}`) && fullPath !== resolvedBaseDir) {
    throw new AppError(ErrorCodes.INVALID_ZIP_PATH, 'zip entry escapes base dir', 400, {
      safeEntryPath
    })
  }
  return fullPath
}

const isSymlinkEntry = (entry: ZipCentralEntry): boolean => {
  const unixMode = (entry.externalAttributes >>> 16) & 0o170000
  return unixMode === 0o120000
}

const findEndOfCentralDirectoryOffset = (zipBuffer: Buffer): number => {
  const minimumLength = 22
  if (zipBuffer.length < minimumLength) {
    return -1
  }

  const maxCommentLength = 0xffff
  const searchStart = Math.max(0, zipBuffer.length - (minimumLength + maxCommentLength))

  for (let offset = zipBuffer.length - minimumLength; offset >= searchStart; offset -= 1) {
    if (zipBuffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) {
      return offset
    }
  }

  return -1
}

const parseCentralEntries = (zipBuffer: Buffer): ZipCentralEntry[] => {
  const eocdOffset = findEndOfCentralDirectoryOffset(zipBuffer)
  if (eocdOffset < 0) {
    throw new AppError(ErrorCodes.ZIP_CORRUPTED, 'end of central directory not found', 400)
  }

  const centralDirectorySize = zipBuffer.readUInt32LE(eocdOffset + 12)
  const centralDirectoryOffset = zipBuffer.readUInt32LE(eocdOffset + 16)
  const expectedEntries = zipBuffer.readUInt16LE(eocdOffset + 10)

  const entries: ZipCentralEntry[] = []
  let cursor = centralDirectoryOffset
  const endOffset = centralDirectoryOffset + centralDirectorySize

  while (cursor < endOffset && entries.length < expectedEntries) {
    if (zipBuffer.readUInt32LE(cursor) !== ZIP_CENTRAL_SIGNATURE) {
      throw new AppError(ErrorCodes.ZIP_CORRUPTED, 'invalid central directory entry', 400, {
        cursor
      })
    }

    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10)
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20)
    const uncompressedSize = zipBuffer.readUInt32LE(cursor + 24)
    const fileNameLength = zipBuffer.readUInt16LE(cursor + 28)
    const extraLength = zipBuffer.readUInt16LE(cursor + 30)
    const fileCommentLength = zipBuffer.readUInt16LE(cursor + 32)
    const externalAttributes = zipBuffer.readUInt32LE(cursor + 38)
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42)
    const fileNameStart = cursor + 46
    const fileNameEnd = fileNameStart + fileNameLength
    const fileName = zipBuffer.toString('utf8', fileNameStart, fileNameEnd)

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new AppError(ErrorCodes.ZIP_CORRUPTED, 'zip64 is not supported in mvp extractor', 400)
    }

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      externalAttributes,
      localHeaderOffset,
      isDirectory: fileName.endsWith('/')
    })

    cursor = fileNameEnd + extraLength + fileCommentLength
  }

  return entries
}

const decodeZipEntry = (zipBuffer: Buffer, entry: ZipCentralEntry): Buffer => {
  const localOffset = entry.localHeaderOffset
  if (zipBuffer.readUInt32LE(localOffset) !== ZIP_LOCAL_SIGNATURE) {
    throw new AppError(ErrorCodes.ZIP_CORRUPTED, 'invalid local file header', 400, {
      fileName: entry.fileName
    })
  }

  const fileNameLength = zipBuffer.readUInt16LE(localOffset + 26)
  const extraLength = zipBuffer.readUInt16LE(localOffset + 28)
  const dataStart = localOffset + 30 + fileNameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  const compressed = zipBuffer.subarray(dataStart, dataEnd)

  if (entry.compressionMethod === 0) {
    return compressed
  }
  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressed)
  }

  throw new AppError(ErrorCodes.ZIP_CORRUPTED, 'unsupported zip compression method', 400, {
    fileName: entry.fileName,
    compressionMethod: entry.compressionMethod
  })
}

const resolveIncludedTexPath = (rootDir: string, currentTexPath: string, includeTarget: string): string => {
  const hasExtension = path.extname(includeTarget).length > 0
  const maybeTex = hasExtension ? includeTarget : `${includeTarget}.tex`
  const safe = toSafeEntryPath(path.join(path.dirname(currentTexPath), maybeTex))
  return ensureInsideBaseDir(rootDir, safe)
}

const selectMainTexPath = (candidates: string[]): string | null => {
  if (candidates.length === 0) {
    return null
  }

  const mainCandidate = candidates.find((candidate) => candidate.endsWith('/main.tex'))
  if (mainCandidate) {
    return mainCandidate
  }

  const exactMain = candidates.find((candidate) => candidate === 'main.tex')
  return exactMain ?? candidates[0]!
}

const loadLatexSource = async (project: ExpandedLatexProject): Promise<ExtractedLatexSource> => {
  const entryTexPath = selectMainTexPath(project.entryTexCandidates)
  if (!entryTexPath) {
    return {
      source: '',
      warnings: ['No .tex file found in archive.']
    }
  }

  const rootDir = project.rootDir
  const entryFullPath = ensureInsideBaseDir(rootDir, toSafeEntryPath(entryTexPath))
  const baseSource = await readFile(entryFullPath, 'utf8')
  const includePattern = /\\(?:input|include)\{([^}]+)\}/g
  const warnings: string[] = []

  let expanded = ''
  let cursor = 0
  const source = normalizeNewlines(baseSource)

  for (const match of source.matchAll(includePattern)) {
    const index = match.index
    if (index === undefined) {
      continue
    }

    expanded += source.slice(cursor, index)
    const includeTarget = match[1]?.trim()
    if (!includeTarget) {
      expanded += '\n'
      cursor = index + match[0].length
      continue
    }

    try {
      const includePath = resolveIncludedTexPath(rootDir, entryTexPath, includeTarget)
      const includeSource = await readFile(includePath, 'utf8')
      expanded += `\n${includeSource}\n`
    } catch {
      warnings.push(`Included file not found: ${includeTarget}`)
      expanded += '\n'
    }

    cursor = index + match[0].length
  }

  expanded += source.slice(cursor)
  return { source: removeLatexComments(expanded), warnings }
}

const buildSections = (latexSource: string): Array<ExtractSection & { start: number }> => {
  const pattern = /\\(subsubsection|subsection|section)\{([^}]*)\}/g
  const sections: Array<ExtractSection & { start: number }> = []
  const levelMap: Record<string, number> = {
    section: 1,
    subsection: 2,
    subsubsection: 3
  }

  for (const match of latexSource.matchAll(pattern)) {
    const start = match.index ?? 0
    const levelKey = match[1]
    const titleRaw = match[2]
    if (!levelKey || !titleRaw) {
      continue
    }

    sections.push({
      id: toSequentialId('sec', sections.length + 1),
      title: normalizeWhitespace(titleRaw),
      level: levelMap[levelKey] ?? 1,
      start
    })
  }

  return sections
}

const buildFigures = (latexSource: string): Array<ExtractFigure & { block: string }> => {
  const figurePattern = /\\begin\{figure\}[\s\S]*?\\end\{figure\}/g
  const labelPattern = /\\label\{([^}]*)\}/
  const captionPattern = /\\caption\{([^}]*)\}/
  const figures: Array<ExtractFigure & { block: string }> = []

  for (const match of latexSource.matchAll(figurePattern)) {
    const block = match[0]
    if (!block) {
      continue
    }

    const labelMatch = block.match(labelPattern)
    const captionMatch = block.match(captionPattern)

    const figure: ExtractFigure & { block: string } = {
      id: toSequentialId('fig', figures.length + 1),
      mentionedInParagraphIds: [],
      block
    }

    const label = labelMatch?.[1]?.trim()
    if (label) {
      figure.label = label
    }
    const caption = captionMatch?.[1]?.trim()
    if (caption) {
      figure.caption = normalizeWhitespace(caption)
    }

    figures.push(figure)
  }

  return figures
}

const findSectionIdByOffset = (
  sections: Array<ExtractSection & { start: number }>,
  offset: number
): string | null => {
  let selected: string | null = null
  for (const section of sections) {
    if (section.start <= offset) {
      selected = section.id
      continue
    }
    break
  }
  return selected
}

const buildParagraphs = (
  latexSource: string,
  sections: Array<ExtractSection & { start: number }>
): ExtractParagraph[] => {
  const sectionPattern = /\\(subsubsection|subsection|section)\{([^}]*)\}/g
  const figurePattern = /\\begin\{figure\}[\s\S]*?\\end\{figure\}/g
  const maskedFigures = latexSource.replace(figurePattern, (block) => '\n'.repeat(Math.max(2, block.split('\n').length)))
  const maskedSections = maskedFigures.replace(sectionPattern, (sectionCommand) =>
    ' '.repeat(sectionCommand.length)
  )

  const chunks = splitParagraphsWithOffsets(maskedSections)
  const paragraphs: ExtractParagraph[] = []

  for (const chunk of chunks) {
    const cleaned = normalizeWhitespace(chunk.text.replace(/\s*\n\s*/g, ' '))
    if (!cleaned) {
      continue
    }

    paragraphs.push({
      id: toSequentialId('p', paragraphs.length + 1),
      sectionId: findSectionIdByOffset(sections, chunk.start),
      text: cleaned
    })
  }

  return paragraphs
}

const buildCitations = async (
  project: ExpandedLatexProject,
  paragraphs: ExtractParagraph[]
): Promise<{ citations: { bibEntries: ExtractBibEntry[]; inTextCites: ExtractInTextCite[] } }> => {
  const inTextCites: ExtractInTextCite[] = []
  const citePattern = /\\cite[a-zA-Z*]*\{([^}]*)\}/g

  for (const paragraph of paragraphs) {
    const paragraphKeys = new Set<string>()
    for (const match of paragraph.text.matchAll(citePattern)) {
      const raw = match[1]
      if (!raw) {
        continue
      }

      raw.split(',').forEach((value) => {
        const key = value.trim()
        if (!key) {
          return
        }
        paragraphKeys.add(key)
      })
    }

    if (paragraphKeys.size > 0) {
      inTextCites.push({
        paragraphId: paragraph.id,
        keys: [...paragraphKeys]
      })
    }
  }

  const bibPattern = /@\w+\s*\{\s*([^,\s]+)\s*,/g
  const bibEntries: ExtractBibEntry[] = []
  const bibEntryKeys = new Set<string>()
  const bibFiles = project.extractedFiles.filter((fileName) => path.extname(fileName).toLowerCase() === '.bib')

  for (const bibFile of bibFiles) {
    const bibPath = ensureInsideBaseDir(project.rootDir, toSafeEntryPath(bibFile))
    let content = ''
    try {
      content = await readFile(bibPath, 'utf8')
    } catch {
      continue
    }

    for (const match of content.matchAll(bibPattern)) {
      const key = match[1]?.trim()
      if (!key || bibEntryKeys.has(key)) {
        continue
      }

      bibEntryKeys.add(key)
      bibEntries.push({ key })
    }
  }

  return {
    citations: {
      bibEntries,
      inTextCites
    }
  }
}

const attachFigureMentions = (figures: ExtractFigure[], paragraphs: ExtractParagraph[]): ExtractFigure[] =>
  figures.map((figure) => {
    if (!figure.label) {
      return figure
    }

    const labelRefPattern = new RegExp(
      `\\\\(?:ref|autoref|eqref)\\{\\s*${escapeRegExp(figure.label)}\\s*\\}`,
      'i'
    )
    const mentionedInParagraphIds = paragraphs
      .filter((paragraph) => labelRefPattern.test(paragraph.text))
      .map((paragraph) => paragraph.id)

    return {
      ...figure,
      mentionedInParagraphIds
    }
  })

export const safeUnzipLatex = async (
  zipBuffer: Buffer,
  analysisId: string
): Promise<ExpandedLatexProject> => {
  const rootDir = path.join(TMP_ANALYSIS_ROOT, analysisId)
  const extractedFiles: string[] = []
  const entryTexCandidates: string[] = []

  await rm(rootDir, { recursive: true, force: true })
  await mkdir(rootDir, { recursive: true })

  try {
    const entries = parseCentralEntries(zipBuffer)
    let fileCount = 0
    let totalBytes = 0

    for (const entry of entries) {
      if (isSymlinkEntry(entry)) {
        throw new AppError(ErrorCodes.INVALID_ZIP_PATH, 'symbolic link entries are not allowed', 400, {
          fileName: entry.fileName
        })
      }

      const safeEntryPath = toSafeEntryPath(entry.fileName)
      const targetPath = ensureInsideBaseDir(rootDir, safeEntryPath)

      if (entry.isDirectory) {
        await mkdir(targetPath, { recursive: true })
        continue
      }

      const extension = path.extname(safeEntryPath).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new AppError(ErrorCodes.DISALLOWED_FILE_TYPE, 'zip contains disallowed file type', 400, {
          fileName: entry.fileName,
          extension
        })
      }

      fileCount += 1
      if (fileCount > DEFAULT_MAX_FILES) {
        throw new AppError(ErrorCodes.ZIP_TOO_MANY_FILES, 'zip has too many files', 400, {
          maxFiles: DEFAULT_MAX_FILES
        })
      }

      const decoded = decodeZipEntry(zipBuffer, entry)
      if (decoded.length > DEFAULT_MAX_SINGLE_FILE_BYTES) {
        throw new AppError(ErrorCodes.ZIP_TOO_LARGE, 'zip entry exceeds max file size', 400, {
          fileName: entry.fileName,
          maxBytes: DEFAULT_MAX_SINGLE_FILE_BYTES
        })
      }

      totalBytes += decoded.length
      if (totalBytes > DEFAULT_MAX_TOTAL_BYTES) {
        throw new AppError(ErrorCodes.ZIP_TOO_LARGE, 'zip exceeds max extracted size', 400, {
          maxBytes: DEFAULT_MAX_TOTAL_BYTES
        })
      }

      await mkdir(path.dirname(targetPath), { recursive: true })
      await writeFile(targetPath, decoded)

      extractedFiles.push(safeEntryPath)
      if (extension === '.tex') {
        entryTexCandidates.push(safeEntryPath)
      }
    }

    return {
      rootDir,
      entryTexCandidates,
      extractedFiles
    }
  } catch (error) {
    await rm(rootDir, { recursive: true, force: true })
    if (isAppError(error)) {
      throw error
    }

    throw new AppError(ErrorCodes.ZIP_CORRUPTED, 'failed to unzip latex archive', 400, {
      reason: error instanceof Error ? error.message : 'unknown'
    })
  }
}

export class LatexExtractor {
  async extract(zipBuffer: Buffer, analysisId: string): Promise<ExtractJson> {
    const project = await safeUnzipLatex(zipBuffer, analysisId)

    try {
      const extracted = await loadLatexSource(project)
      const latexSource = extracted.source

      const sectionsWithOffsets = buildSections(latexSource)
      const paragraphs = buildParagraphs(latexSource, sectionsWithOffsets)
      const figuresWithBlock = buildFigures(latexSource)
      const figures = attachFigureMentions(
        figuresWithBlock.map(({ block, ...figure }) => figure),
        paragraphs
      )
      const citationBundle = await buildCitations(project, paragraphs)

      const now = new Date().toISOString()
      const meta: NonNullable<ExtractJson['meta']> = {
        extractor: 'latex-mvp',
        createdAt: now
      }
      if (extracted.warnings.length > 0) {
        meta.warnings = extracted.warnings
      }

      return {
        schemaVersion: 'v1',
        analysisId,
        inputType: InputType.LATEX_ZIP,
        sections: sectionsWithOffsets.map(({ start, ...section }) => section),
        paragraphs,
        figures,
        citations: citationBundle.citations,
        meta
      }
    } finally {
      await rm(project.rootDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
