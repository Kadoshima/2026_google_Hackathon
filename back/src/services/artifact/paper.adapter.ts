import { ArtifactType, InputType } from '../../domain/enums.js'
import { AppError, ErrorCodes } from '../../utils/errors.js'
import { LatexExtractor } from '../extract/latex.extractor.js'
import { PdfExtractor } from '../extract/pdf.extractor.js'
import type { ArtifactAdapter, ArtifactExtractRequest } from './types.js'

type PaperArtifactAdapterDependencies = {
  latexExtractor?: LatexExtractor
  pdfExtractor?: PdfExtractor
}

export class PaperArtifactAdapter implements ArtifactAdapter {
  readonly artifactType = ArtifactType.PAPER
  private readonly latexExtractor: LatexExtractor
  private readonly pdfExtractor: PdfExtractor

  constructor(dependencies: PaperArtifactAdapterDependencies = {}) {
    this.latexExtractor = dependencies.latexExtractor ?? new LatexExtractor()
    this.pdfExtractor = dependencies.pdfExtractor ?? new PdfExtractor()
  }

  async extract(input: ArtifactExtractRequest) {
    if (input.inputType === InputType.LATEX_ZIP) {
      return this.latexExtractor.extract(input.rawBuffer, input.analysisId)
    }

    if (input.inputType === InputType.PDF) {
      return this.pdfExtractor.extract(input.rawBuffer, input.analysisId)
    }

    throw new AppError(ErrorCodes.INVALID_INPUT, 'unsupported paper input type', 400, {
      inputType: input.inputType
    })
  }
}
