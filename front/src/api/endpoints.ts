import { apiClient } from './client';
import type {
  UploadRequest,
  UploadResponse,
  AnalyzeRequest,
  AnalysisStatus,
  AnalysisResult,
  OralAskRequest,
  OralAskResponse,
  PatchGenerateRequest,
  PatchGenerateResponse,
  Report,
  Session,
  UserSettings,
  TodoItem,
} from '@/types';

// ====================
// Upload API
// ====================
export const uploadApi = {
  upload: async (data: UploadRequest): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('metadata', JSON.stringify(data.metadata));
    
    return apiClient.postForm<UploadResponse>('/upload', formData);
  },
};

// ====================
// Analysis API
// ====================
export const analysisApi = {
  start: async (data: AnalyzeRequest): Promise<{ analysis_id: string }> => {
    return apiClient.post('/analyze', data);
  },

  getStatus: async (analysisId: string): Promise<AnalysisStatus> => {
    return apiClient.get<AnalysisStatus>(`/analysis/${analysisId}`);
  },

  getResult: async (analysisId: string): Promise<AnalysisResult> => {
    return apiClient.get<AnalysisResult>(`/analysis/${analysisId}/result`);
  },

  retry: async (analysisId: string): Promise<{ analysis_id: string }> => {
    return apiClient.post(`/analysis/${analysisId}/retry`);
  },
};

// ====================
// Session API
// ====================
export const sessionApi = {
  create: async (): Promise<Session> => {
    return apiClient.post<Session>('/sessions');
  },

  get: async (sessionId: string): Promise<Session> => {
    return apiClient.get<Session>(`/sessions/${sessionId}`);
  },

  list: async (): Promise<Session[]> => {
    return apiClient.get<Session[]>('/sessions');
  },

  update: async (sessionId: string, data: Partial<Session>): Promise<Session> => {
    return apiClient.put<Session>(`/sessions/${sessionId}`, data);
  },

  delete: async (sessionId: string): Promise<void> => {
    return apiClient.delete(`/sessions/${sessionId}`);
  },

  deleteAll: async (): Promise<void> => {
    return apiClient.delete('/sessions');
  },
};

// ====================
// Oral Defense API
// ====================
export const oralApi = {
  ask: async (data: OralAskRequest): Promise<OralAskResponse> => {
    return apiClient.post<OralAskResponse>('/oral/ask', data);
  },

  startSession: async (sessionId: string): Promise<{ chat_id: string }> => {
    return apiClient.post(`/oral/start`, { session_id: sessionId });
  },

  getHistory: async (chatId: string): Promise<{ messages: unknown[] }> => {
    return apiClient.get(`/oral/${chatId}/history`);
  },
};

// ====================
// Todo & Patch API
// ====================
export const todoApi = {
  list: async (sessionId: string): Promise<TodoItem[]> => {
    return apiClient.get<TodoItem[]>(`/sessions/${sessionId}/todos`);
  },

  update: async (sessionId: string, todoId: string, status: TodoItem['status']): Promise<TodoItem> => {
    return apiClient.put<TodoItem>(`/sessions/${sessionId}/todos/${todoId}`, { status });
  },

  accept: async (sessionId: string, todoId: string): Promise<TodoItem> => {
    return apiClient.post<TodoItem>(`/sessions/${sessionId}/todos/${todoId}/accept`);
  },

  reject: async (sessionId: string, todoId: string): Promise<TodoItem> => {
    return apiClient.post<TodoItem>(`/sessions/${sessionId}/todos/${todoId}/reject`);
  },
};

export const patchApi = {
  generate: async (data: PatchGenerateRequest): Promise<PatchGenerateResponse> => {
    return apiClient.post<PatchGenerateResponse>('/patch/generate', data);
  },

  preview: async (sessionId: string, todoId: string): Promise<{ diff: string }> => {
    return apiClient.get<{ diff: string }>(`/sessions/${sessionId}/todos/${todoId}/preview`);
  },
};

// ====================
// Report API
// ====================
export const reportApi = {
  generate: async (sessionId: string, format: 'pdf' | 'html' = 'pdf'): Promise<Report> => {
    return apiClient.post<Report>('/report/generate', { session_id: sessionId, format });
  },

  get: async (reportId: string): Promise<Report> => {
    return apiClient.get<Report>(`/report/${reportId}`);
  },

  download: async (reportId: string): Promise<Blob> => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/report/${reportId}/download`, {
      headers: {
        'X-Client-Token': typeof window !== 'undefined' 
          ? localStorage.getItem('client_session_token') || '' 
          : '',
      },
    });
    return response.blob();
  },
};

// ====================
// Settings API
// ====================
export const settingsApi = {
  get: async (): Promise<UserSettings> => {
    return apiClient.get<UserSettings>('/settings');
  },

  update: async (settings: Partial<UserSettings>): Promise<UserSettings> => {
    return apiClient.put<UserSettings>('/settings', settings);
  },
};
