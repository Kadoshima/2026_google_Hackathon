'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, File, Upload, X } from 'lucide-react'
import type { AnalyzeRequest, UploadMetadata } from 'shared'
import { analysisApi, uploadApi } from '@/api'
import { Button, Card, CardHeader, ProgressBar } from '@/components/ui'
import { cn, formatFileSize } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'

type UploadOptions = {
  language: 'ja' | 'en'
  saveEnabled: boolean
  domainTag: string
}

export default function NewSessionPage() {
  const router = useRouter()
  const { ensureClientToken, addSession } = useAppStore()
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<UploadOptions>({
    language: 'ja',
    saveEnabled: true,
    domainTag: ''
  })

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('file is required')

      ensureClientToken()

      const metadata: UploadMetadata = {
        language: options.language,
        ...(options.domainTag ? { domainTag: options.domainTag } : {}),
        retentionPolicy: options.saveEnabled
          ? { mode: 'SAVE', ttlHours: 24 * 30 }
          : { mode: 'NO_SAVE' }
      }

      const upload = await uploadApi.upload({ file, metadata })
      const analyzeRequest: AnalyzeRequest = {
        session_id: upload.session_id,
        submission_id: upload.submission_id
      }
      const analyze = await analysisApi.start(analyzeRequest)

      return { upload, analyze }
    },
    onSuccess: ({ upload, analyze }) => {
      const title = file?.name.replace(/\.[^/.]+$/, '') || 'Untitled'
      const now = new Date().toISOString()
      const clientToken =
        localStorage.getItem('client_session_token') || ensureClientToken()

      addSession({
        session_id: upload.session_id,
        client_token: clientToken,
        title,
        analysis_id: analyze.analysis_id,
        status: 'analyzing',
        created_at: now,
        updated_at: now,
        submission: {
          submission_id: upload.submission_id,
          upload_id: upload.upload_id,
          filename: file?.name || '',
          file_type: file?.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'zip'
        },
        settings: {
          save_enabled: options.saveEnabled,
          retention_days: options.saveEnabled ? 30 : 1,
          language: options.language
        }
      })

      router.push(`/session/${upload.session_id}`)
    }
  })

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024
  })

  const submitProgress = useMemo(() => {
    if (!createSessionMutation.isPending) return 0
    return 65
  }, [createSessionMutation.isPending])

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader
          title="新規査読セッション"
          subtitle="LaTeX ZIP または PDF をアップロードして解析を開始します"
        />

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
          <p className="text-sm text-gray-500">またはクリックしてファイルを選択</p>
          <p className="text-xs text-gray-400 mt-2">対応形式: .zip, .pdf（最大50MB）</p>
        </div>

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
                aria-label="clear file"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              論文の言語
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setOptions((prev) => ({ ...prev, language: 'ja' }))}
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
                onClick={() => setOptions((prev) => ({ ...prev, language: 'en' }))}
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
            <label className="block text-sm font-medium text-gray-700 mb-2">分野タグ（任意）</label>
            <input
              type="text"
              value={options.domainTag}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, domainTag: e.target.value }))
              }
              placeholder="例: ai, systems, ml"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.saveEnabled}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, saveEnabled: e.target.checked }))
              }
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">解析結果を保存する（設定画面で変更可）</span>
          </label>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              保存OFFの場合は `NO_SAVE` ポリシーで送信され、保持期間を最小化します。
            </p>
          </div>
        </div>

        <div className="mt-6">
          {createSessionMutation.isPending && (
            <div className="mb-4">
              <ProgressBar progress={submitProgress} />
              <p className="text-sm text-gray-600 text-center mt-2">
                アップロードと解析ジョブ作成を実行中...
              </p>
            </div>
          )}

          {createSessionMutation.isError && (
            <div className="mb-4 p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <p className="text-sm">
                  処理に失敗しました: {createSessionMutation.error.message}
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={() => createSessionMutation.mutate()}
            disabled={!file || createSessionMutation.isPending}
            isLoading={createSessionMutation.isPending}
            className="w-full"
            size="lg"
          >
            {!createSessionMutation.isPending && <CheckCircle className="w-5 h-5 mr-2" />}
            解析を開始する
          </Button>
        </div>
      </Card>
    </div>
  )
}
