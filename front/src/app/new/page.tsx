'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { uploadApi, sessionApi } from '@/api';
import { useAppStore } from '@/store/useAppStore';
import { Button, Card, CardHeader, ProgressBar, Badge } from '@/components/ui';
import { Upload, File, X, AlertCircle, CheckCircle } from 'lucide-react';
import { cn, formatFileSize } from '@/lib/utils';

export default function NewSessionPage() {
  const router = useRouter();
  const { ensureClientToken, addSession } = useAppStore();
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState({
    language: 'ja' as 'ja' | 'en',
    saveEnabled: true,
    field: '',
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('ファイルが選択されていません');
      
      ensureClientToken();
      
      const response = await uploadApi.upload({
        file,
        metadata: {
          language: options.language,
          save_enabled: options.saveEnabled,
          field: options.field || undefined,
        },
      });
      
      return response;
    },
    onSuccess: (data) => {
      // Create session entry
      const session = {
        session_id: data.session_id,
        client_token: localStorage.getItem('client_session_token') || '',
        title: file?.name.replace(/\.[^/.]+$/, ''),
        status: 'analyzing' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        submission: {
          submission_id: data.submission_id,
          upload_id: data.upload_id,
          filename: file?.name || '',
          file_type: (file?.name.endsWith('.pdf') ? 'pdf' : 'zip') as 'pdf' | 'zip',
        },
        settings: {
          save_enabled: options.saveEnabled,
          retention_days: 30,
          language: options.language,
        },
      };
      
      addSession(session);
      router.push(`/session/${data.session_id}`);
    },
  });

  // Dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const handleSubmit = () => {
    uploadMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader
          title="新規査読セッション"
          subtitle="LaTeXプロジェクト（ZIP）またはPDFファイルをアップロードしてください"
        />

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-300 hover:border-gray-400'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">
            {isDragActive ? 'ファイルをドロップしてください' : 'ファイルをドラッグ＆ドロップ'}
          </p>
          <p className="text-sm text-gray-500">
            または クリックしてファイルを選択
          </p>
          <p className="text-xs text-gray-400 mt-2">
            対応形式: .zip, .pdf (最大 50MB)
          </p>
        </div>

        {/* File preview */}
        {file && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <File className="w-8 h-8 text-indigo-600" />
                <div>
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="p-2 hover:bg-gray-200 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        )}

        {/* Options */}
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              論文の言語
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setOptions({ ...options, language: 'ja' })}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  options.language === 'ja'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                日本語
              </button>
              <button
                onClick={() => setOptions({ ...options, language: 'en' })}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  options.language === 'en'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                English
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              分野（任意）
            </label>
            <input
              type="text"
              value={options.field}
              onChange={(e) => setOptions({ ...options, field: e.target.value })}
              placeholder="例: 情報工学、物理学、生物学..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="saveEnabled"
              checked={options.saveEnabled}
              onChange={(e) => setOptions({ ...options, saveEnabled: e.target.checked })}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="saveEnabled" className="text-sm text-gray-700">
              解析結果を保存する（プライバシー設定で変更可能）
            </label>
          </div>
        </div>

        {/* Privacy notice */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">プライバシーについて</p>
              <p>
                アップロードされたファイルは解析のためにサーバーに送信されます。
                保存設定がOFFの場合、解析完了後に自動的に削除されます。
              </p>
            </div>
          </div>
        </div>

        {/* Submit button */}
        <div className="mt-6">
          {uploadMutation.isPending && (
            <div className="mb-4">
              <ProgressBar progress={uploadMutation.isPending ? 50 : 0} />
              <p className="text-sm text-gray-600 text-center mt-2">
                アップロード中...
              </p>
            </div>
          )}

          {uploadMutation.isError && (
            <div className="mb-4 p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <p className="text-sm">
                  アップロードに失敗しました。もう一度お試しください。
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!file || uploadMutation.isPending}
            isLoading={uploadMutation.isPending}
            className="w-full"
            size="lg"
          >
            {!uploadMutation.isPending && <CheckCircle className="w-5 h-5 mr-2" />}
            解析を開始する
          </Button>
        </div>
      </Card>
    </div>
  );
}
