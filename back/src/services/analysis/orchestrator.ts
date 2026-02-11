import { AnalysisStatus, AnalysisStep, InputType } from '../../domain/enums.js'
import type { AnalysisResultJson, ExtractJson, PreflightResult } from '../../domain/types.js'
import { FirestoreRepo } from '../firestore.repo.js'
import { StorageService } from '../storage.service.js'
import { LatexExtractor } from '../extract/latex.extractor.js'
import { PdfExtractor } from '../extract/pdf.extractor.js'
import { runPreflight } from './preflight.js'
import { AppError, ErrorCodes } from '../../utils/errors.js'

type OrchestratorDependencies = {
  repo?: FirestoreRepo
  storage?: StorageService
  latexExtractor?: LatexExtractor
  pdfExtractor?: PdfExtractor
}

type RunOptions = {
  lockOwner?: string
}

export class AnalysisOrchestrator {
  private readonly repo: FirestoreRepo
  private readonly storage: StorageService
  private readonly latexExtractor: LatexExtractor
  private readonly pdfExtractor: PdfExtractor

  constructor(dependencies: OrchestratorDependencies = {}) {
    this.repo = dependencies.repo ?? new FirestoreRepo()
    this.storage = dependencies.storage ?? new StorageService()
    this.latexExtractor = dependencies.latexExtractor ?? new LatexExtractor()
    this.pdfExtractor = dependencies.pdfExtractor ?? new PdfExtractor()
  }

  async run(analysisId: string, _options: RunOptions = {}): Promise<AnalysisResultJson> {
    const analysis = await this.repo.getAnalysis(analysisId)
    if (!analysis) {
      throw new AppError(ErrorCodes.ANALYSIS_NOT_FOUND, 'analysis not found', 404, { analysisId })
    }

    const submission = await this.repo.getSubmission(analysis.submissionId)
    if (!submission) {
      throw new AppError(ErrorCodes.SUBMISSION_NOT_FOUND, 'submission not found', 404, {
        analysisId,
        submissionId: analysis.submissionId
      })
    }

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.EXTRACTING,
      0.1,
      AnalysisStep.EXTRACT
    )

    const rawBuffer = await this.storage.readAsBuffer(submission.gcsPathRaw)
    const extract = await this.runExtractor(submission.inputType, rawBuffer, analysisId)

    const extractObjectPath = `extract/${analysisId}/extract.json`
    const extractGsPath = await this.storage.putJson(extractObjectPath, extract)
    await this.repo.setPointers(analysisId, { gcsExtractJson: extractGsPath })

    await this.repo.updateAnalysisStatus(
      analysisId,
      AnalysisStatus.ANALYZING,
      0.6,
      AnalysisStep.LOGIC
    )

    const { preflight, warnings } = this.runPreflightSafely(extract)
    const result: AnalysisResultJson = {
      schemaVersion: 'v1',
      analysisId,
      preflight,
      generatedAt: new Date().toISOString(),
      extractPath: extractGsPath
    }
    if (warnings.length > 0) {
      result.warnings = warnings
    }

    const resultObjectPath = `analysis/${analysisId}/result.json`
    const resultGsPath = await this.storage.putJson(resultObjectPath, result)
    await this.repo.setPointers(analysisId, { gcsAnalysisJson: resultGsPath })

    await this.repo.updateAnalysisStatus(analysisId, AnalysisStatus.READY, 1, AnalysisStep.FINALIZE)
    return result
  }

  private async runExtractor(
    inputType: InputType,
    rawBuffer: Buffer,
    analysisId: string
  ): Promise<ExtractJson> {
    if (inputType === InputType.LATEX_ZIP) {
      return this.latexExtractor.extract(rawBuffer, analysisId)
    }

    if (inputType === InputType.PDF) {
      return this.pdfExtractor.extract(rawBuffer, analysisId)
    }

    throw new AppError(ErrorCodes.INVALID_INPUT, 'unsupported input type', 400, { inputType })
  }

  private runPreflightSafely(extract: ExtractJson): { preflight: PreflightResult; warnings: string[] } {
    try {
      return {
        preflight: runPreflight(extract),
        warnings: []
      }
    } catch (error) {
      const warning = `preflight failed: ${error instanceof Error ? error.message : 'unknown'}`
      return {
        preflight: {
          findings: [],
          summary: {
            errorCount: 0,
            warningCount: 0
          }
        },
        warnings: [warning]
      }
    }
  }
}
