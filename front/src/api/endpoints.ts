import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalysisResponse,
  OralAskRequest,
  OralAskResponse,
  PatchGenerateRequest,
  PatchGenerateResponse,
  ReportGenerateResponse,
  ReportGetResponse,
  UploadMetadata,
  UploadResponse
} from 'shared'
import { apiClient } from './client'

export const uploadApi = {
  upload: async (data: { file: File; metadata: UploadMetadata }): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', data.file)
    formData.append('metadata', JSON.stringify(data.metadata))
    return apiClient.postForm<UploadResponse>('/upload', formData)
  }
}

export const analysisApi = {
  start: async (data: AnalyzeRequest): Promise<AnalyzeResponse> => {
    return apiClient.post<AnalyzeResponse>('/analyze', data)
  },

  getStatus: async (analysisId: string): Promise<AnalysisResponse> => {
    return apiClient.get<AnalysisResponse>(`/analysis/${analysisId}`)
  }
}

const notImplemented = async <T>(name: string): Promise<T> => {
  throw new Error(`${name} is not implemented in backend yet`)
}

export const sessionApi = {
  get: async <T>(sessionId: string): Promise<T> => {
    return notImplemented<T>(`GET /sessions/${sessionId}`)
  }
}

export const oralApi = {
  ask: async (data: OralAskRequest): Promise<OralAskResponse> => {
    return apiClient.post<OralAskResponse>('/oral/ask', data)
  }
}

export const patchApi = {
  generate: async (data: PatchGenerateRequest): Promise<PatchGenerateResponse> => {
    return apiClient.post<PatchGenerateResponse>('/patch/generate', data)
  }
}

export const reportApi = {
  generate: async (analysisId: string): Promise<ReportGenerateResponse> => {
    return apiClient.post<ReportGenerateResponse>('/report/generate', {
      analysis_id: analysisId
    })
  },

  get: async (reportId: string): Promise<ReportGetResponse> => {
    return apiClient.get<ReportGetResponse>(`/report/${reportId}`)
  }
}

export const todoApi = {
  list: async <T>(sessionId: string): Promise<T> => {
    return notImplemented<T>(`GET /sessions/${sessionId}/todos`)
  }
}

export const settingsApi = {
  update: async <T>(settings: Partial<T>): Promise<T> => {
    return notImplemented<T>('PUT /settings')
  }
}
