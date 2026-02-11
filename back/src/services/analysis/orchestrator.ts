import { AnalysisStatus, AnalysisStep } from '../../domain/enums.js'
import { updateAnalysisStatus } from '../firestore.repo.js'

export { run }

const run = async (analysisId: string): Promise<void> => {
  try {
    await markExtracting(analysisId)
    // TODO(BE-043, BE-044, BE-045): run extract pipeline and persist extract json.

    await markAnalyzingLogic(analysisId)
    // TODO(BE-055): run logic sentinel.

    await markAnalyzingEvidence(analysisId)
    // TODO(BE-054): run evidence auditor.

    await markAnalyzingPriorArt(analysisId)
    // TODO(BE-056): run prior art coach.

    await markFinalizing(analysisId)
    // TODO(BE-057): compute metrics and write summary/pointers.

    await updateAnalysisStatus({
      analysisId,
      status: AnalysisStatus.READY,
      progress: 100,
      step: AnalysisStep.FINALIZE
    })
  } catch (error) {
    await updateAnalysisStatus({
      analysisId,
      status: AnalysisStatus.FAILED,
      error: {
        code: 'ORCHESTRATOR_FAILED',
        messagePublic: 'analysis failed',
        messageInternal: error instanceof Error ? error.message : String(error)
      }
    })
    throw error
  }
}

const markExtracting = async (analysisId: string): Promise<void> => {
  await updateAnalysisStatus({
    analysisId,
    status: AnalysisStatus.EXTRACTING,
    progress: 10,
    step: AnalysisStep.EXTRACT
  })
}

const markAnalyzingLogic = async (analysisId: string): Promise<void> => {
  await updateAnalysisStatus({
    analysisId,
    status: AnalysisStatus.ANALYZING,
    progress: 35,
    step: AnalysisStep.LOGIC
  })
}

const markAnalyzingEvidence = async (analysisId: string): Promise<void> => {
  await updateAnalysisStatus({
    analysisId,
    status: AnalysisStatus.ANALYZING,
    progress: 55,
    step: AnalysisStep.EVIDENCE
  })
}

const markAnalyzingPriorArt = async (analysisId: string): Promise<void> => {
  await updateAnalysisStatus({
    analysisId,
    status: AnalysisStatus.ANALYZING,
    progress: 75,
    step: AnalysisStep.PRIOR_ART
  })
}

const markFinalizing = async (analysisId: string): Promise<void> => {
  await updateAnalysisStatus({
    analysisId,
    status: AnalysisStatus.ANALYZING,
    progress: 90,
    step: AnalysisStep.FINALIZE
  })
}
