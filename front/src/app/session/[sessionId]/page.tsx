'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  FileText,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles
} from 'lucide-react'
import type { AnalysisResponse, OralAskResponse } from 'shared'
import { analysisApi, oralApi, patchApi, reportApi } from '@/api'
import { Badge, Button, Card, CardHeader } from '@/components/ui'
import {
  AnalysisProgress,
  ChatThread,
  EvidenceMapTable,
  TextHeatmapViewer,
  TodoList
} from '@/features'
import { useAppStore } from '@/store/useAppStore'
import type { ChatMessage, ClaimEvidence, TodoItem, VaguePoint } from '@/types'

type SessionTab =
  | 'summary'
  | 'evidence'
  | 'oral'
  | 'todo'
  | 'report'
  | 'preflight'
  | 'heatmap'

const TABS: Array<{ id: SessionTab; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'evidence', label: 'Evidence Map' },
  { id: 'oral', label: 'Oral Defense' },
  { id: 'todo', label: 'ToDo / Patch' },
  { id: 'report', label: 'Report' },
  { id: 'preflight', label: 'Preflight' },
  { id: 'heatmap', label: 'Heatmap' }
]

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = params.sessionId as string

  const sessions = useAppStore((state) => state.sessions)
  const setSessions = useAppStore((state) => state.setSessions)
  const setCurrentSessionId = useAppStore((state) => state.setCurrentSessionId)

  const session = useMemo(
    () => sessions.find((item) => item.session_id === sessionId),
    [sessions, sessionId]
  )

  const analysisId = session?.analysis_id

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [todos, setTodos] = useState<TodoItem[]>(() => buildInitialTodos())
  const [selectedClaim, setSelectedClaim] = useState<ClaimEvidence | null>(null)
  const [reportState, setReportState] = useState<{
    reportId?: string
    reportUrl?: string
    error?: string
  }>({})

  const activeTab = normalizeTab(searchParams.get('tab'))

  useEffect(() => {
    setCurrentSessionId(sessionId)
    return () => setCurrentSessionId(null)
  }, [sessionId, setCurrentSessionId])

  const analysisQuery = useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => analysisApi.getStatus(analysisId || ''),
    enabled: Boolean(analysisId),
    refetchInterval: (query) => {
      const current = query.state.data
      if (!current) return 3000
      if (current.status === 'READY' || current.status === 'FAILED') return false
      return 3000
    }
  })

  useEffect(() => {
    if (!analysisQuery.data || !session) return
    const next = mapAnalysisStatusToSessionStatus(analysisQuery.data.status)
    if (session.status === next) return

    setSessions(
      sessions.map((item) =>
        item.session_id === session.session_id
          ? { ...item, status: next, updated_at: new Date().toISOString() }
          : item
      )
    )
  }, [analysisQuery.data, session, setSessions, sessions])

  const oralMutation = useMutation({
    mutationFn: async (answer: string): Promise<OralAskResponse> => {
      if (!analysisId) throw new Error('analysis_id is missing')
      const turnId = `turn_${Date.now()}`
      try {
        return await oralApi.ask({
          analysis_id: analysisId,
          turn_id: turnId,
          user_answer: answer
        })
      } catch {
        return {
          question: '具体的な再現条件と比較対象を説明してください。',
          follow_up: true,
          draft_sentences: [
            '本手法は条件A/Bで従来法より平均22%の改善を示した。',
            '適用範囲外の条件では改善が限定的である。'
          ],
          todo_candidate: { title: '実験条件を追記', impact: 4, effort: 2 }
        }
      }
    },
    onSuccess: (result) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `aiq_${Date.now()}`,
          type: 'ai_question',
          content: result.question,
          timestamp: new Date().toISOString()
        },
        ...(result.draft_sentences?.length
          ? [
              {
                id: `draft_${Date.now()}`,
                type: 'draft',
                content: '追記候補',
                timestamp: new Date().toISOString(),
                metadata: {
                  draft_sentences: result.draft_sentences
                }
              } as ChatMessage
            ]
          : [])
      ])
    }
  })

  const patchMutation = useMutation({
    mutationFn: async () => {
      if (!analysisId) throw new Error('analysis_id is missing')
      const accepted = todos.filter((todo) => todo.status === 'accepted').map((todo) => todo.id)
      if (accepted.length === 0) {
        throw new Error('採用済みToDoがありません')
      }
      return patchApi.generate({
        analysis_id: analysisId,
        accepted_todos: accepted
      })
    }
  })

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!analysisId) throw new Error('analysis_id is missing')
      const generated = await reportApi.generate(analysisId)
      const report = await reportApi.get(generated.report_id)
      return { reportId: generated.report_id, reportUrl: report.report_html_signed_url }
    },
    onSuccess: (result) => {
      setReportState({ reportId: result.reportId, reportUrl: result.reportUrl })
    },
    onError: (error) => {
      setReportState({ error: error instanceof Error ? error.message : 'report error' })
    }
  })

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <p className="text-gray-600">セッションが見つかりません。`/new` から作成してください。</p>
        </Card>
      </div>
    )
  }

  const claims = buildClaims(analysisQuery.data)
  const vaguePoints = buildVaguePoints()
  const activeAnalysisStatus = analysisQuery.data?.status ?? 'QUEUED'
  const activeProgress = analysisQuery.data?.progress ?? 0
  const activeMessage = analysisQuery.data?.message

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {session.title || '無題の論文'}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={session.status} />
            <span className="text-sm text-gray-500">{session.submission?.filename}</span>
            {analysisId && (
              <span className="text-xs text-gray-400">analysis_id: {analysisId}</span>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => analysisQuery.refetch()}
          disabled={!analysisId || analysisQuery.isFetching}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          再取得
        </Button>
      </div>

      <AnalysisProgress
        status={activeAnalysisStatus}
        progress={activeProgress}
        message={activeMessage}
        error={analysisQuery.data?.status === 'FAILED' ? analysisQuery.data.message : undefined}
      />

      <TabBar activeTab={activeTab} onSelect={(tab) => router.replace(`/session/${sessionId}?tab=${tab}`)} />

      {activeTab === 'summary' && <SummaryTab analysis={analysisQuery.data} />}
      {activeTab === 'evidence' && (
        <EvidenceTab claims={claims} selectedClaim={selectedClaim} onSelectClaim={setSelectedClaim} />
      )}
      {activeTab === 'oral' && (
        <OralTab
          messages={messages}
          isLoading={oralMutation.isPending}
          onSend={(answer) => {
            setMessages((prev) => [
              ...prev,
              {
                id: `user_${Date.now()}`,
                type: 'user_answer',
                content: answer,
                timestamp: new Date().toISOString()
              }
            ])
            oralMutation.mutate(answer)
          }}
        />
      )}
      {activeTab === 'todo' && (
        <TodoTab
          todos={todos}
          onAccept={(todoId) =>
            setTodos((prev) =>
              prev.map((todo) =>
                todo.id === todoId ? { ...todo, status: 'accepted' } : todo
              )
            )
          }
          onReject={(todoId) =>
            setTodos((prev) =>
              prev.map((todo) =>
                todo.id === todoId ? { ...todo, status: 'rejected' } : todo
              )
            )
          }
          onGeneratePatch={() => patchMutation.mutate()}
          patchMessage={
            patchMutation.isError
              ? patchMutation.error.message
              : patchMutation.isSuccess
              ? `diff generated: ${patchMutation.data.diff_signed_url}`
              : undefined
          }
        />
      )}
      {activeTab === 'report' && (
        <ReportTab
          reportState={reportState}
          isGenerating={reportMutation.isPending}
          onGenerate={() => reportMutation.mutate()}
        />
      )}
      {activeTab === 'preflight' && <PreflightTab />}
      {activeTab === 'heatmap' && (
        <TextHeatmapViewer
          text={buildDemoText()}
          vaguePoints={vaguePoints}
        />
      )}
    </div>
  )
}

function TabBar({
  activeTab,
  onSelect
}: {
  activeTab: SessionTab
  onSelect: (tab: SessionTab) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-indigo-100 text-indigo-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function SummaryTab({ analysis }: { analysis: AnalysisResponse | undefined }) {
  const summary = analysis && 'summary' in analysis ? analysis.summary : undefined
  const risks = summary?.top3_risks ?? []
  const metrics = summary?.metrics

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="致命傷 Top3" subtitle="Rejectリスクの高い順に表示" icon={<AlertCircle className="w-5 h-5 text-red-600" />} />
        <div className="space-y-3">
          {risks.length === 0 && (
            <p className="text-sm text-gray-500">
              解析が進むと、ここに優先度の高いリスクが表示されます。
            </p>
          )}
          {risks.map((risk, index) => (
            <div key={`${risk.title}_${index}`} className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium text-gray-900">
                {index + 1}. {risk.title}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                refs: claim={risk.refs?.claim_ids?.length ?? 0}, paragraph={risk.refs?.paragraph_ids?.length ?? 0}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Metrics (Before)" subtitle="修正前の基準値（枠）" icon={<FileText className="w-5 h-5 text-gray-500" />} />
          <MetricRow label="No evidence claims" value="-" />
          <MetricRow label="Weak evidence claims" value="-" />
          <MetricRow label="Specificity lack" value="-" />
        </Card>
        <Card>
          <CardHeader title="Metrics (After)" subtitle="現在解析結果" icon={<Sparkles className="w-5 h-5 text-indigo-600" />} />
          <MetricRow label="No evidence claims" value={String(metrics?.no_evidence_claims ?? '-')} />
          <MetricRow label="Weak evidence claims" value={String(metrics?.weak_evidence_claims ?? '-')} />
          <MetricRow label="Specificity lack" value={String(metrics?.specificity_lack ?? '-')} />
        </Card>
      </div>
    </div>
  )
}

function EvidenceTab({
  claims,
  selectedClaim,
  onSelectClaim
}: {
  claims: ClaimEvidence[]
  selectedClaim: ClaimEvidence | null
  onSelectClaim: (claim: ClaimEvidence) => void
}) {
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
      <EvidenceMapTable
        claims={claims}
        onSelectClaim={onSelectClaim}
        selectedClaimId={selectedClaim?.claim_id}
      />
      <Card>
        <CardHeader title="Claim Detail Drawer" subtitle="選択したClaimの詳細" icon={<Shield className="w-5 h-5 text-indigo-600" />} />
        {!selectedClaim && (
          <p className="text-sm text-gray-500">テーブルから claim を選択してください。</p>
        )}
        {selectedClaim && (
          <div className="space-y-3">
            <p className="font-medium text-gray-900">{selectedClaim.claim_text}</p>
            <Badge variant={selectedClaim.strength === 'none' ? 'error' : 'warning'}>
              strength: {selectedClaim.strength}
            </Badge>
            <div className="text-sm text-gray-700">
              evidence count: {selectedClaim.evidence.length}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function OralTab({
  messages,
  onSend,
  isLoading
}: {
  messages: ChatMessage[]
  onSend: (value: string) => void
  isLoading: boolean
}) {
  return (
    <ChatThread messages={messages} onSendMessage={onSend} isLoading={isLoading} />
  )
}

function TodoTab({
  todos,
  onAccept,
  onReject,
  onGeneratePatch,
  patchMessage
}: {
  todos: TodoItem[]
  onAccept: (todoId: string) => void
  onReject: (todoId: string) => void
  onGeneratePatch: () => void
  patchMessage?: string
}) {
  return (
    <div className="space-y-3">
      <TodoList
        todos={todos}
        onAccept={onAccept}
        onReject={onReject}
        onGeneratePatch={onGeneratePatch}
      />
      {patchMessage && (
        <Card>
          <p className="text-sm text-gray-700">{patchMessage}</p>
        </Card>
      )}
    </div>
  )
}

function ReportTab({
  reportState,
  isGenerating,
  onGenerate
}: {
  reportState: { reportId?: string; reportUrl?: string; error?: string }
  isGenerating: boolean
  onGenerate: () => void
}) {
  return (
    <Card>
      <CardHeader title="Report" subtitle="生成 -> 閲覧 -> ダウンロード" icon={<FileText className="w-5 h-5 text-indigo-600" />} />
      <div className="space-y-3">
        <Button onClick={onGenerate} isLoading={isGenerating}>
          レポート生成
        </Button>
        {reportState.error && <p className="text-sm text-red-700">{reportState.error}</p>}
        {reportState.reportId && (
          <p className="text-sm text-gray-700">report_id: {reportState.reportId}</p>
        )}
        {reportState.reportUrl && (
          <a
            href={reportState.reportUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-indigo-700 underline"
          >
            レポートを開く / ダウンロード
          </a>
        )}
      </div>
    </Card>
  )
}

function PreflightTab() {
  return (
    <Card>
      <CardHeader title="Preflight" subtitle="参照漏れや構成崩れのチェック" icon={<AlertCircle className="w-5 h-5 text-orange-600" />} />
      <div className="space-y-2 text-sm text-gray-700">
        <p>- missing citation: 2</p>
        <p>- unreferenced figure: 1</p>
        <p>- structure warnings: 1</p>
      </div>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: { label: '進行中', variant: 'default' as const },
    analyzing: { label: '解析中', variant: 'warning' as const },
    completed: { label: '完了', variant: 'success' as const },
    error: { label: 'エラー', variant: 'error' as const }
  }

  const item = config[status as keyof typeof config] ?? config.active
  return <Badge variant={item.variant}>{item.label}</Badge>
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}

function normalizeTab(raw: string | null): SessionTab {
  if (!raw) return 'summary'
  return TABS.some((item) => item.id === raw) ? (raw as SessionTab) : 'summary'
}

function mapAnalysisStatusToSessionStatus(
  status: AnalysisResponse['status']
): 'active' | 'analyzing' | 'completed' | 'error' {
  if (status === 'READY') return 'completed'
  if (status === 'FAILED') return 'error'
  return 'analyzing'
}

function buildClaims(analysis: AnalysisResponse | undefined): ClaimEvidence[] {
  const summary = analysis && 'summary' in analysis ? analysis.summary : undefined
  const risks = summary?.top3_risks ?? []

  if (risks.length === 0) {
    return [
      {
        claim_id: 'claim_1',
        claim_text: '提案手法は従来法より高速である',
        location: { page: 3, snippet: '提案手法は従来法より高速である' },
        evidence: [{ type: 'experiment', ref_id: 'fig_3', snippet: '実験結果の比較表' }],
        strength: 'moderate'
      },
      {
        claim_id: 'claim_2',
        claim_text: '提案法は全データセットで一貫して優位である',
        location: { page: 4, snippet: '全データセットで優位' },
        evidence: [],
        strength: 'none'
      }
    ]
  }

  return risks.map((risk, index) => ({
    claim_id: risk.refs?.claim_ids?.[0] ?? `claim_${index + 1}`,
    claim_text: risk.title,
    location: { snippet: risk.title },
    evidence: (risk.refs?.paragraph_ids ?? []).map((id) => ({
      type: 'citation',
      ref_id: id
    })),
    strength: (risk.refs?.paragraph_ids?.length ?? 0) > 0 ? 'moderate' : 'none'
  }))
}

function buildVaguePoints(): VaguePoint[] {
  return [
    {
      id: 'v1',
      type: 'no_number',
      text: '大幅に高速化',
      location: { page: 3, line: 11 },
      suggestion: '具体的な倍率を追記'
    },
    {
      id: 'v2',
      type: 'no_condition',
      text: 'どの環境でも有効',
      location: { page: 5, line: 7 },
      suggestion: '適用条件を明記'
    }
  ]
}

function buildDemoText(): string {
  return [
    '提案手法は従来法に比べて大幅に高速化を実現した。',
    'また、どの環境でも有効であることを確認した。',
    '実験結果は図3に示す。'
  ].join('\n')
}

function buildInitialTodos(): TodoItem[] {
  return [
    {
      id: 'todo_1',
      title: '図3に統計情報を追加',
      description: 'p値、n数、信頼区間を明記する',
      impact: 5,
      effort: 2,
      status: 'pending',
      source: 'evidence',
      suggested_diff: '- 実験結果を示す。\n+ 実験結果を示す（p<0.01, n=30）。'
    },
    {
      id: 'todo_2',
      title: '高速化主張を定量化',
      description: '「大幅に」を具体的な値に置換',
      impact: 4,
      effort: 1,
      status: 'pending',
      source: 'logic'
    }
  ]
}
