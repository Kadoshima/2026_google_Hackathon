import type { ArtifactType, InputType } from '../../domain/enums.js'
import type { ExtractJson } from '../../domain/types.js'

export type ArtifactExtractRequest = {
  analysisId: string
  inputType: InputType
  rawBuffer: Buffer
}

export interface ArtifactAdapter {
  readonly artifactType: ArtifactType
  extract(input: ArtifactExtractRequest): Promise<ExtractJson>
}
