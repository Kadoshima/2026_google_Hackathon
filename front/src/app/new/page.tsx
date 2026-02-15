'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, File, Info, Upload, X } from 'lucide-react'
import type {
  AnalyzeRequest,
  ArtifactCreateRequest,
  ArtifactType,
  CapabilitiesResponse,
  UploadMetadata
} from 'shared'
import { analysisApi, artifactApi, capabilitiesApi, uploadApi } from '@/api'
import { Badge, Button, Card, CardHeader, ProgressBar } from '@/components/ui'
import { cn, formatFileSize } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'

type ArtifactTypeOption = ArtifactType
type ArtifactFormat = 'plain' | 'markdown' | 'diff' | 'json'

type UploadOptions = {
  artifactType: ArtifactTypeOption
  language: 'ja' | 'en'
  saveEnabled: boolean
  domainTag: string
  title: string
  content: string
  contentFormat: ArtifactFormat
  sourceRef: string
}

type PrDraft = {
  summary: string
  background: string
  changes: string
  testPlan: string
  risks: string
  rollback: string
  diff: string
}

const MIN_ARTIFACT_CHARS = 40
const ARTIFACT_TYPES: ArtifactTypeOption[] = ['PAPER', 'PR', 'DOC', 'SHEET']

export default function NewSessionPage() {
  const router = useRouter()
  const { ensureClientToken, addSession } = useAppStore()
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<UploadOptions>({
    artifactType: 'PAPER',
    language: 'ja',
    saveEnabled: true,
    domainTag: '',
    title: '',
    content: '',
    contentFormat: 'markdown',
    sourceRef: ''
  })
  const [useStructuredPr, setUseStructuredPr] = useState(true)
  const [prDraft, setPrDraft] = useState<PrDraft>(() => makeInitialPrDraft('ja'))

  const isPaper = options.artifactType === 'PAPER'
  const allowedFormats = getAllowedFormats(options.artifactType)
  const effectiveContent = useMemo(() => {
    if (options.artifactType === 'PR' && useStructuredPr) {
      return composePrArtifactBody(prDraft)
    }
    return options.content
  }, [options.artifactType, options.content, prDraft, useStructuredPr])
  const textChars = effectiveContent.trim().length

  const capabilitiesQuery = useQuery({
    queryKey: ['capabilities'],
    queryFn: () => capabilitiesApi.get(),
    staleTime: 60_000
  })

  const selectedCapability = useMemo(() => {
    return capabilitiesQuery.data?.artifact_adapters.find(
      (adapter) => adapter.artifact_type === options.artifactType
    )
  }, [capabilitiesQuery.data, options.artifactType])

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      ensureClientToken()

      const retentionPolicy = options.saveEnabled
        ? { mode: 'SAVE' as const, ttlHours: 24 * 30 }
        : { mode: 'NO_SAVE' as const }

      const upload = isPaper
        ? await createPaperSubmission({ file, options, retentionPolicy })
        : await createTextArtifactSubmission({
            options,
            retentionPolicy,
            content: effectiveContent
          })

      const analyzeRequest: AnalyzeRequest = {
        session_id: upload.session_id,
        submission_id: upload.submission_id
      }
      const analyze = await analysisApi.start(analyzeRequest)

      return { upload, analyze }
    },
    onSuccess: ({ upload, analyze }) => {
      const now = new Date().toISOString()
      const clientToken = localStorage.getItem('client_session_token') || ensureClientToken()
      const title = resolveSessionTitle({ file, options })

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
          filename: resolveSubmissionName({ file, options }),
          file_type: isPaper ? (file?.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'zip') : 'artifact',
          artifact_type: options.artifactType
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
    disabled: !isPaper,
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

  const submitDisabled =
    createSessionMutation.isPending || (isPaper ? !file : textChars < MIN_ARTIFACT_CHARS)

  const applyTemplate = () => {
    if (options.artifactType === 'PR') {
      const template = makeInitialPrDraft(options.language)
      setUseStructuredPr(true)
      setPrDraft(template)
      setOptions((prev) => ({
        ...prev,
        title: prev.title || (options.language === 'ja' ? 'PRレビュー対象' : 'PR review target'),
        contentFormat: 'diff',
        content: ''
      }))
      return
    }

    setOptions((prev) => ({
      ...prev,
      content: buildArtifactTemplate(options.artifactType, options.language),
      contentFormat:
        options.artifactType === 'DOC'
          ? 'markdown'
          : options.artifactType === 'SHEET'
          ? 'json'
          : prev.contentFormat
    }))
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader
          title="新規査読セッション"
          subtitle={
            isPaper
              ? 'PAPER成果物（LaTeX ZIP / PDF）を解析します'
              : `${options.artifactType}成果物をテキスト入力で解析します`
          }
        />

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">成果物タイプ</label>
            <div className="flex flex-wrap gap-2">
              {ARTIFACT_TYPES.map((artifactType) => (
                <button
                  key={artifactType}
                  type="button"
                  onClick={() => {
                    const defaultFormat = getAllowedFormats(artifactType)[0] ?? 'plain'
                    setOptions((prev) => ({
                      ...prev,
                      artifactType,
                      contentFormat: defaultFormat,
                      ...(artifactType !== 'PR' ? { sourceRef: prev.sourceRef.trim() } : {})
                    }))
                    if (artifactType === 'PR' && options.content.trim().length === 0) {
                      setUseStructuredPr(true)
                    }
                  }}
                  className={cn(
                    'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    options.artifactType === artifactType
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {artifactType}
                </button>
              ))}
            </div>
          </div>

          <AdapterHint capability={selectedCapability} loading={capabilitiesQuery.isLoading} />

          {isPaper ? (
            <>
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
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
                <div className="p-4 bg-gray-50 rounded-lg">
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
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">タイトル（任意）</label>
                  <input
                    type="text"
                    value={options.title}
                    onChange={(e) => setOptions((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder={
                      options.artifactType === 'PR'
                        ? '例: PR #123 login flow update'
                        : options.artifactType === 'DOC'
                        ? '例: 提案書 v2'
                        : '例: KPI dashboard review'
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ソース参照（任意）</label>
                  <input
                    type="text"
                    value={options.sourceRef}
                    onChange={(e) => setOptions((prev) => ({ ...prev, sourceRef: e.target.value }))}
                    placeholder={
                      options.artifactType === 'PR'
                        ? '例: https://github.com/org/repo/pull/123'
                        : '例: docs/spec-v2.md'
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">内容フォーマット</label>
                  <select
                    value={options.contentFormat}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, contentFormat: e.target.value as ArtifactFormat }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {allowedFormats.map((format) => (
                      <option key={format} value={format}>
                        {format}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={applyTemplate}>
                    テンプレート挿入
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOptions((prev) => ({ ...prev, content: '' }))}
                  >
                    本文クリア
                  </Button>
                </div>
              </div>

              {options.artifactType === 'PR' && (
                <div className="border border-indigo-100 bg-indigo-50 rounded-lg p-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm text-indigo-900 font-medium">
                    <input
                      type="checkbox"
                      checked={useStructuredPr}
                      onChange={(e) => setUseStructuredPr(e.target.checked)}
                      className="w-4 h-4"
                    />
                    構造化PR入力を使う（レビューしやすい本文を自動組み立て）
                  </label>

                  {useStructuredPr && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-indigo-900 mb-1">変更概要</label>
                        <input
                          type="text"
                          value={prDraft.summary}
                          onChange={(e) => setPrDraft((prev) => ({ ...prev, summary: e.target.value }))}
                          className="w-full px-3 py-2 border border-indigo-200 rounded-md"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <LabeledTextArea
                          label="背景/目的"
                          value={prDraft.background}
                          onChange={(value) => setPrDraft((prev) => ({ ...prev, background: value }))}
                        />
                        <LabeledTextArea
                          label="主な変更点"
                          value={prDraft.changes}
                          onChange={(value) => setPrDraft((prev) => ({ ...prev, changes: value }))}
                        />
                        <LabeledTextArea
                          label="テスト計画"
                          value={prDraft.testPlan}
                          onChange={(value) => setPrDraft((prev) => ({ ...prev, testPlan: value }))}
                        />
                        <LabeledTextArea
                          label="リスク/制約"
                          value={prDraft.risks}
                          onChange={(value) => setPrDraft((prev) => ({ ...prev, risks: value }))}
                        />
                      </div>

                      <LabeledTextArea
                        label="ロールバック手順"
                        value={prDraft.rollback}
                        rows={2}
                        onChange={(value) => setPrDraft((prev) => ({ ...prev, rollback: value }))}
                      />

                      <LabeledTextArea
                        label="差分（unified diff）"
                        value={prDraft.diff}
                        rows={7}
                        onChange={(value) => setPrDraft((prev) => ({ ...prev, diff: value }))}
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">成果物本文</label>
                  <span
                    className={cn(
                      'text-xs',
                      textChars < MIN_ARTIFACT_CHARS ? 'text-amber-700' : 'text-gray-500'
                    )}
                  >
                    {textChars} chars（最小 {MIN_ARTIFACT_CHARS} chars）
                  </span>
                </div>
                <textarea
                  value={options.artifactType === 'PR' && useStructuredPr ? effectiveContent : options.content}
                  onChange={(e) => setOptions((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder={getContentPlaceholder(options.artifactType)}
                  rows={14}
                  readOnly={options.artifactType === 'PR' && useStructuredPr}
                  className={cn(
                    'w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm',
                    options.artifactType === 'PR' && useStructuredPr ? 'bg-gray-50 text-gray-700' : ''
                  )}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">成果物の言語</label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setOptions((prev) => ({ ...prev, language: 'ja' }))
                  if (options.artifactType === 'PR' && useStructuredPr) {
                    setPrDraft((prev) => ({
                      ...makeInitialPrDraft('ja'),
                      diff: prev.diff
                    }))
                  }
                }}
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
                onClick={() => {
                  setOptions((prev) => ({ ...prev, language: 'en' }))
                  if (options.artifactType === 'PR' && useStructuredPr) {
                    setPrDraft((prev) => ({
                      ...makeInitialPrDraft('en'),
                      diff: prev.diff
                    }))
                  }
                }}
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
              onChange={(e) => setOptions((prev) => ({ ...prev, domainTag: e.target.value }))}
              placeholder="例: ai, systems, ml"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.saveEnabled}
              onChange={(e) => setOptions((prev) => ({ ...prev, saveEnabled: e.target.checked }))}
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
              <p className="text-sm text-gray-600 text-center mt-2">成果物登録と解析ジョブ作成を実行中...</p>
            </div>
          )}

          {createSessionMutation.isError && (
            <div className="mb-4 p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <p className="text-sm">処理に失敗しました: {createSessionMutation.error.message}</p>
              </div>
            </div>
          )}

          <Button
            onClick={() => createSessionMutation.mutate()}
            disabled={submitDisabled}
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

function AdapterHint(input: {
  capability: CapabilitiesResponse['artifact_adapters'][number] | undefined
  loading: boolean
}) {
  if (input.loading) {
    return (
      <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
        adapter capability を取得中...
      </div>
    )
  }

  if (!input.capability) return null

  return (
    <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Info className="w-4 h-4" />
          <span>{getArtifactTypeDescription(input.capability.artifact_type)}</span>
        </div>
        <Badge variant={toStatusVariant(input.capability.status)}>
          {toStatusLabel(input.capability.status)}
        </Badge>
      </div>
      <p className="text-xs text-gray-600 mt-2">主なチェック: {input.capability.key_checks.join(' / ')}</p>
    </div>
  )
}

function LabeledTextArea(input: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-indigo-900 mb-1">{input.label}</label>
      <textarea
        value={input.value}
        rows={input.rows ?? 3}
        onChange={(e) => input.onChange(e.target.value)}
        className="w-full px-3 py-2 border border-indigo-200 rounded-md font-mono text-sm"
      />
    </div>
  )
}

async function createPaperSubmission(input: {
  file: File | null
  options: UploadOptions
  retentionPolicy: { mode: 'SAVE' | 'NO_SAVE'; ttlHours?: number }
}) {
  if (!input.file) {
    throw new Error('PAPERモードではファイルが必須です')
  }

  const metadata: UploadMetadata = {
    artifactType: 'PAPER',
    language: input.options.language,
    ...(input.options.domainTag ? { domainTag: input.options.domainTag } : {}),
    retentionPolicy: input.retentionPolicy
  }

  return uploadApi.upload({ file: input.file, metadata })
}

async function createTextArtifactSubmission(input: {
  options: UploadOptions
  retentionPolicy: { mode: 'SAVE' | 'NO_SAVE'; ttlHours?: number }
  content: string
}) {
  if (input.content.trim().length < MIN_ARTIFACT_CHARS) {
    throw new Error(
      `${input.options.artifactType} モードでは本文を${MIN_ARTIFACT_CHARS}文字以上入力してください`
    )
  }

  const request: ArtifactCreateRequest = {
    artifact_type: input.options.artifactType,
    content: input.content,
    content_format: input.options.contentFormat,
    ...(input.options.title.trim() ? { title: input.options.title.trim() } : {}),
    ...(input.options.sourceRef.trim() ? { source_ref: input.options.sourceRef.trim() } : {}),
    ...(input.options.language ? { language: input.options.language } : {}),
    ...(input.options.domainTag ? { domainTag: input.options.domainTag } : {}),
    retentionPolicy: input.retentionPolicy
  }

  return artifactApi.create(request)
}

function resolveSessionTitle(input: { file: File | null; options: UploadOptions }): string {
  if (input.options.artifactType === 'PAPER') {
    return input.file?.name.replace(/\.[^/.]+$/, '') || 'Untitled'
  }

  return input.options.title.trim() || `${input.options.artifactType} Artifact`
}

function resolveSubmissionName(input: { file: File | null; options: UploadOptions }): string {
  if (input.options.artifactType === 'PAPER') {
    return input.file?.name || 'paper_submission'
  }

  const suffix =
    input.options.contentFormat === 'markdown'
      ? '.md'
      : input.options.contentFormat === 'diff'
      ? '.diff'
      : input.options.contentFormat === 'json'
      ? '.json'
      : '.txt'

  return `${input.options.title.trim() || input.options.artifactType.toLowerCase()}${suffix}`
}

function getAllowedFormats(artifactType: ArtifactTypeOption): ArtifactFormat[] {
  if (artifactType === 'PR') return ['diff', 'markdown', 'plain']
  if (artifactType === 'DOC') return ['markdown', 'plain']
  if (artifactType === 'SHEET') return ['json', 'plain']
  return ['plain']
}

function buildArtifactTemplate(artifactType: ArtifactTypeOption, language: 'ja' | 'en'): string {
  if (artifactType === 'DOC') {
    return language === 'ja'
      ? [
          '# 目的',
          '- この文書で達成したいこと',
          '',
          '# 前提',
          '- 想定読者',
          '- 制約条件',
          '',
          '# 主張',
          '- 何を採用し、なぜそうしたか',
          '',
          '# 根拠',
          '- データ/比較/一次情報',
          '',
          '# リスクと未解決事項',
          '- 懸念点・回避策'
        ].join('\n')
      : [
          '# Goal',
          '- What this document tries to achieve',
          '',
          '# Assumptions',
          '- Audience',
          '- Constraints',
          '',
          '# Decision',
          '- What was selected and why',
          '',
          '# Evidence',
          '- Data / comparisons / sources',
          '',
          '# Risks & Open Issues',
          '- Remaining concerns and mitigations'
        ].join('\n')
  }

  if (artifactType === 'SHEET') {
    return JSON.stringify(
      {
        sheet_name: language === 'ja' ? 'KPIダッシュボード' : 'KPI Dashboard',
        columns: ['metric', 'value', 'period', 'source'],
        rows: [
          {
            metric: 'conversion_rate',
            value: 0.12,
            period: '2026-02',
            source: 'analytics_export_v3'
          }
        ],
        assumptions: [language === 'ja' ? '欠損は0補完' : 'missing values are filled with 0'],
        constraints: [language === 'ja' ? '週次更新' : 'weekly refresh']
      },
      null,
      2
    )
  }

  return ''
}

function makeInitialPrDraft(language: 'ja' | 'en'): PrDraft {
  if (language === 'ja') {
    return {
      summary: 'ログイン処理の例外ハンドリングを改善',
      background: '- 特定条件で500エラーが発生\n- エラーハンドリングが呼び出し元依存だった',
      changes: '- service層で例外を統一変換\n- タイムアウト時の再試行条件を追加',
      testPlan: '- 単体テスト: 失敗系3ケース追加\n- 手動確認: timeout/network error',
      risks: '- 再試行回数増加によるレイテンシ増\n- 古いクライアント互換性に注意',
      rollback: '- feature flagをOFF\n- 直前タグへロールバック',
      diff: [
        'diff --git a/src/auth/login.ts b/src/auth/login.ts',
        'index 12ab34c..34bc56d 100644',
        '--- a/src/auth/login.ts',
        '+++ b/src/auth/login.ts',
        '@@ -32,6 +32,18 @@ export async function login(input: LoginInput) {',
        '-  return authClient.login(input)',
        '+  try {',
        '+    return await authClient.login(input)',
        '+  } catch (error) {',
        '+    throw mapAuthError(error)',
        '+  }',
        ' }'
      ].join('\n')
    }
  }

  return {
    summary: 'Improve login error handling and retry safety',
    background: '- 500 errors occurred in specific timeout scenarios\n- Error mapping depended on callers',
    changes: '- Unified error mapping in service layer\n- Added retry guard for timeout',
    testPlan: '- Unit tests: add 3 failure-path cases\n- Manual check: timeout/network interruption',
    risks: '- Potential latency increase due to retries\n- Verify compatibility with old clients',
    rollback: '- Disable feature flag\n- Roll back to previous release tag',
    diff: [
      'diff --git a/src/auth/login.ts b/src/auth/login.ts',
      'index 12ab34c..34bc56d 100644',
      '--- a/src/auth/login.ts',
      '+++ b/src/auth/login.ts',
      '@@ -32,6 +32,18 @@ export async function login(input: LoginInput) {',
      '-  return authClient.login(input)',
      '+  try {',
      '+    return await authClient.login(input)',
      '+  } catch (error) {',
      '+    throw mapAuthError(error)',
      '+  }',
      ' }'
    ].join('\n')
  }
}

function composePrArtifactBody(draft: PrDraft): string {
  return [
    '# Summary',
    draft.summary.trim(),
    '',
    '## Background',
    draft.background.trim(),
    '',
    '## Changes',
    draft.changes.trim(),
    '',
    '## Test Plan',
    draft.testPlan.trim(),
    '',
    '## Risks',
    draft.risks.trim(),
    '',
    '## Rollback',
    draft.rollback.trim(),
    '',
    '## Diff',
    draft.diff.trim()
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}

function getContentPlaceholder(artifactType: ArtifactTypeOption): string {
  if (artifactType === 'PR') {
    return 'PR本文、変更概要、diff、テスト計画などを貼り付け'
  }
  if (artifactType === 'SHEET') {
    return 'JSON または CSV相当の内容を貼り付け'
  }
  return 'ドキュメント本文を貼り付け'
}

function getArtifactTypeDescription(artifactType: ArtifactTypeOption): string {
  if (artifactType === 'PAPER') return '論文向け: Claim-Evidenceと引用整合を重点検査'
  if (artifactType === 'PR') return 'PR向け: diff、テスト根拠、リスク説明の整合を重点検査'
  if (artifactType === 'DOC') return '文書向け: 主張・根拠・前提の抜け漏れを重点検査'
  return '表計算向け: 集計前提・式トレース・意思決定根拠を重点検査'
}

function toStatusLabel(status: CapabilitiesResponse['artifact_adapters'][number]['status']): string {
  if (status === 'ready') return 'Ready'
  if (status === 'beta') return 'Beta'
  return 'Planned'
}

function toStatusVariant(
  status: CapabilitiesResponse['artifact_adapters'][number]['status']
): 'success' | 'warning' | 'default' {
  if (status === 'ready') return 'success'
  if (status === 'beta') return 'warning'
  return 'default'
}
