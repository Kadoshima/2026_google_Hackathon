import axios, { AxiosInstance, AxiosError } from 'axios';
import type { ApiError } from '@/types';

// API base URL (環境変数から取得)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/v1';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
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
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        // エラーハンドリング
        if (error.response) {
          const apiError = error.response.data;
          console.error('API Error:', apiError);
          
          // 認証エラーの場合、トークンをクリア
          if (error.response.status === 401) {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('client_session_token');
            }
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  // GET request
  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }

  // POST request (JSON)
  async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  // POST request (FormData)
  async postForm<T>(url: string, formData: FormData): Promise<T> {
    // Let the browser set multipart boundary automatically.
    const response = await this.client.post<T>(url, formData);
    return response.data;
  }

  // PUT request
  async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.put<T>(url, data);
    return response.data;
  }

  // DELETE request
  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }
}

export const apiClient = new ApiClient();
