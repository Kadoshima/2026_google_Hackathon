import axios, { AxiosInstance, AxiosError } from 'axios';
import type { ApiError } from '@/types';

// API base URL. NEXT_PUBLIC_API_URL is inlined at build time, so we must
// bake in a defensible fallback — but only for local dev. In a production
// build we refuse to default to localhost because that would silently
// break every API call from the deployed frontend.
const resolveApiBaseUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) return envUrl;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_URL must be set at build time for production builds. ' +
        'Refusing to fall back to http://localhost:8080/v1.'
    );
  }
  return 'http://localhost:8080/v1';
};

const API_BASE_URL = resolveApiBaseUrl();

const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Generate a short, browser-safe request id. We send this with every API
 * call so that backend logs and frontend errors can be correlated. The
 * backend echoes the same header back if present.
 */
const generateRequestId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * A normalized error surface for the UI. Pages and hooks should catch this
 * (or use the helpers below) instead of the raw AxiosError.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.details = params.details;
  }
}

const isApiErrorBody = (value: unknown): value is ApiError => {
  if (!value || typeof value !== 'object') return false;
  const v = value as { error?: { code?: unknown; message?: unknown } };
  return Boolean(v.error && typeof v.error.code === 'string' && typeof v.error.message === 'string');
};

const toApiClientError = (error: AxiosError<ApiError>): ApiClientError => {
  const status = error.response?.status ?? 0;
  const requestId = (error.response?.headers?.[REQUEST_ID_HEADER.toLowerCase()] as string | undefined)
    ?? (error.config?.headers?.[REQUEST_ID_HEADER] as string | undefined);

  if (error.response && isApiErrorBody(error.response.data)) {
    const body = error.response.data;
    return new ApiClientError({
      status,
      code: body.error.code,
      message: body.error.message,
      requestId,
      details: body.error.details as Record<string, unknown> | undefined,
    });
  }

  if (error.code === 'ECONNABORTED') {
    return new ApiClientError({
      status: 0,
      code: 'TIMEOUT',
      message: 'リクエストがタイムアウトしました。もう一度お試しください。',
      requestId,
    });
  }

  if (!error.response) {
    return new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'ネットワークに接続できません。接続状況をご確認ください。',
      requestId,
    });
  }

  return new ApiClientError({
    status,
    code: 'UNKNOWN_ERROR',
    message: error.message || '不明なエラーが発生しました。',
    requestId,
  });
};

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000, // 30秒
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // client_session_tokenをlocalStorageから取得
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('client_session_token')
          : null;

        if (token) {
          config.headers['X-Client-Token'] = token;
        }

        // Always attach a request id; the backend echoes it for log correlation.
        if (!config.headers[REQUEST_ID_HEADER]) {
          config.headers[REQUEST_ID_HEADER] = generateRequestId();
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        const normalized = toApiClientError(error);

        // 認証エラーの場合、トークンをクリア
        if (normalized.status === 401 && typeof window !== 'undefined') {
          localStorage.removeItem('client_session_token');
        }

        // Surface a useful log line in the browser console for debugging.
        console.error('[api]', normalized.code, normalized.message, {
          status: normalized.status,
          requestId: normalized.requestId,
          details: normalized.details,
        });

        return Promise.reject(normalized);
      }
    );
  }

  // GET request
  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }

  // POST request (JSON). Attaches an Idempotency-Key so retries are safe.
  async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.post<T>(url, data, {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': generateRequestId(),
      },
    });
    return response.data;
  }

  // POST request (FormData). Attaches an Idempotency-Key so retries are safe.
  async postForm<T>(url: string, formData: FormData): Promise<T> {
    // Let the browser set multipart boundary automatically.
    const response = await this.client.post<T>(url, formData, {
      headers: {
        'Idempotency-Key': generateRequestId(),
      },
    });
    return response.data;
  }

  // PUT request. Attaches an Idempotency-Key so retries are safe.
  async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.put<T>(url, data, {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': generateRequestId(),
      },
    });
    return response.data;
  }

  // DELETE request
  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }
}

export const apiClient = new ApiClient();
