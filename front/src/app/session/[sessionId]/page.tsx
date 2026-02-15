'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  FileText,
  RefreshCw,
  Shield,
  Sparkles
} from 'lucide-react'
import type { AnalysisResponse, OralAskResponse } from 'shared'
import { analysisApi, oralApi, patchApi, reportApi, sessionApi } from '@/api'
import { Badge, Button, Card, CardHeader } from '@/components/ui'
import {
  AnalysisProgress,
  ChatThread,
  EvidenceMapTable,
  TextHeatmapViewer,
  TodoList
} from '@/features'
import { useAppStore } from '@/store/useAppStore'
import type { ChatMessage, ClaimEvidence, Session, TodoItem, VaguePoint } from '@/types'

type SessionTab =
  | 'summary'
  | 'evidence'
  | 'oral'
  | 'todo'
  | 'report'
  | 'preflight'
  | 'heatmap'

const TABS: Array<{ id: SessionTab; label: string }> = [
  { id: 'summary', label: 'サマリー' },
  { id: 'evidence', label: '根拠マップ' },
  { id: 'oral', label: '口頭試問' },
  { id: 'todo', label: 'ToDo / Patch' },
  { id: 'report', label: 'レポート' },
  { id: 'preflight', label: '整合チェック' },
  { id: 'heatmap', label: 'ヒートマップ' }
]

type AgentRuntime = {
  agent_id: string
  role:
    | 'PLANNER'
    | 'EXTRACTOR'
    | 'CLAIM_MINER'
    | 'PREFLIGHT_GUARDIAN'
    | 'EVIDENCE_AUDITOR'
    | 'LOGIC_SENTINEL'
    | 'PRIOR_ART_COACH'
    | 'SYNTHESIZER'
  status: 'DONE' | 'WARN' | 'SKIPPED'
  duration_ms: number
  summary: string
  highlights?: string[]
}

const AGENT_SEQUENCE: Array<{
  role: AgentRuntime['role']
  label: string
}> = [
  { role: 'PLANNER', label: '計画' },
  { role: 'EXTRACTOR', label: '抽出' },
  { role: 'CLAIM_MINER', label: '主張抽出' },
  { role: 'PREFLIGHT_GUARDIAN', label: '整合検査' },
  { role: 'EVIDENCE_AUDITOR', label: '根拠監査' },
  { role: 'LOGIC_SENTINEL', label: '論理検査' },
  { role: 'PRIOR_ART_COACH', label: '比較観点' },
  { role: 'SYNTHESIZER', label: '統合' }
]

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = params.sessionId as string

  const sessions = useAppStore((state) => state.sessions)
  const addSession = useAppStore((state) => state.addSession)
  const setSessions = useAppStore((state) => state.setSessions)
  const setCurrentSessionId = useAppStore((state) => state.setCurrentSessionId)

  const session = useMemo(
    () => sessions.find((item) => item.session_id === sessionId),
    [sessions, sessionId]
  )

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionApi.get<Session>(sessionId),
    enabled: !session,
    retry: false
  })

  useEffect(() => {
    if (session || !sessionQuery.data) return
    addSession(sessionQuery.data)
  }, [addSession, session, sessionQuery.data])

  const activeSession = session ?? sessionQuery.data
  const analysisId = activeSession?.analysis_id

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [extraTodos, setExtraTodos] = useState<TodoItem[]>([])
  const [todoOverrides, setTodoOverrides] = useState<Record<string, TodoItem['status']>>({})
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

  const computedTodos = useMemo(
    () => buildTodosFromAnalysis(analysisQuery.data),
    [analysisQuery.data]
  )

  const todos = useMemo(() => {
    const merged: TodoItem[] = []
    const seen = new Set<string>()

    for (const todo of extraTodos) {
      if (seen.has(todo.id)) continue
      seen.add(todo.id)
      merged.push(todo)
    }

    for (const todo of computedTodos) {
      if (seen.has(todo.id)) continue
      seen.add(todo.id)
      merged.push(todo)
    }

    return merged.map((todo) => ({
      ...todo,
      status: todoOverrides[todo.id] ?? todo.status
    }))
  }, [computedTodos, extraTodos, todoOverrides])

  useEffect(() => {
    if (!analysisQuery.data || !activeSession) return
    const next = mapAnalysisStatusToSessionStatus(analysisQuery.data.status)
    if (activeSession.status === next) return

    setSessions(
      sessions.map((item) =>
        item.session_id === activeSession.session_id
          ? { ...item, status: next, updated_at: new Date().toISOString() }
          : item
      )
    )
  }, [activeSession, analysisQuery.data, setSessions, sessions])

  const setTodoStatus = (todoId: string, status: TodoItem['status']) => {
    setTodoOverrides((prev) => ({
      ...prev,
      [todoId]: status
    }))
  }

  const addOralDraftTodos = (sentences: string[], autoAccept: boolean) => {
    const normalized = sentences
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0)

    if (normalized.length === 0) return

    const nextIds = normalized.map((sentence) => `todo_oral_${hashText(sentence)}`)

    setExtraTodos((prev) => {
      const byId = new Map(prev.map((todo) => [todo.id, todo]))

      normalized.forEach((sentence, index) => {
        const todoId = nextIds[index]
        if (!todoId) return

        const current = byId.get(todoId)
        if (current) {
          byId.set(todoId, {
            ...current,
            title: current.title || sentence.slice(0, 60),
            description: sentence,
            ...(autoAccept ? { status: 'accepted' } : {})
          })
          return
        }

        byId.set(todoId, {
          id: todoId,
          title: sentence.slice(0, 60),
          description: sentence,
          impact: 4,
          effort: 2,
          status: autoAccept ? 'accepted' : 'pending',
          source: 'oral'
        })
      })

      const existingOrder = prev.map((todo) => todo.id)
      const newIds = [...nextIds].reverse()
      const ordered = [
        ...newIds,
        ...existingOrder.filter((id) => !newIds.includes(id))
      ]

      return ordered
        .map((id) => byId.get(id))
        .filter((todo): todo is TodoItem => Boolean(todo))
    })

    if (autoAccept) {
      setTodoOverrides((prev) => {
        const next = { ...prev }
        nextIds.forEach((id) => {
          next[id] = 'accepted'
        })
        return next
      })
    }
  }

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
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error('failed to ask oral defense question')
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
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_error_${Date.now()}`,
          type: 'ai_evaluation',
          content: `Oral API error: ${error instanceof Error ? error.message : 'unknown error'}`,
          timestamp: new Date().toISOString()
        }
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

  if (!activeSession) {
    if (sessionQuery.isLoading) {
      return (
        <div className="max-w-4xl mx-auto">
          <Card>
            <p className="text-gray-600">セッション情報を取得中...</p>
          </Card>
        </div>
      )
    }

    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <p className="text-gray-600">セッションが見つかりません。`/new` から作成してください。</p>
        </Card>
      </div>
    )
  }

  const claims = buildClaims(analysisQuery.data)
  const vaguePoints = buildVaguePoints(analysisQuery.data)
  const heatmapText = buildHeatmapText(claims)
  const activeAnalysisStatus = analysisQuery.data?.status ?? 'QUEUED'
  const activeProgress = analysisQuery.data?.progress ?? 0
  const activeMessage = analysisQuery.data?.message
  const oralReady = activeAnalysisStatus === 'READY'
  const liveAgents = (analysisQuery.data &&
  'summary' in analysisQuery.data &&
  analysisQuery.data.summary?.agents
    ? analysisQuery.data.summary.agents
    : []) as AgentRuntime[]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {activeSession.title || '無題の論文'}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={activeSession.status} />
            <span className="text-sm text-gray-500">{activeSession.submission?.filename}</span>
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

      <LiveAgentsPanel
        agents={liveAgents}
        analysisStatus={activeAnalysisStatus}
      />

      <TabBar activeTab={activeTab} onSelect={(tab) => router.replace(`/session/${sessionId}?tab=${tab}`)} />

      {activeTab === 'summary' && (
        <SummaryTab
          analysis={analysisQuery.data}
        />
      )}
      {activeTab === 'evidence' && (
        <EvidenceTab
          claims={claims}
          analysis={analysisQuery.data}
          selectedClaim={selectedClaim}
          onSelectClaim={setSelectedClaim}
        />
      )}
      {activeTab === 'oral' && (
        <OralTab
          analysisStatus={activeAnalysisStatus}
          messages={messages}
          isLoading={oralMutation.isPending}
          onAddDraftToTodo={(sentences) => addOralDraftTodos(sentences, false)}
          onAcceptDraft={(sentences) => addOralDraftTodos(sentences, true)}
          onStart={() => {
            if (!oralReady) return
            const starterPrompt = '口頭試問を開始してください。最初の重要質問を1つ出してください。'
            setMessages((prev) => [
              ...prev,
              {
                id: `user_start_${Date.now()}`,
                type: 'user_answer',
                content: '口頭試問を開始してください',
                timestamp: new Date().toISOString()
              }
            ])
            oralMutation.mutate(starterPrompt)
          }}
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
            setTodoStatus(todoId, 'accepted')
          }
          onReject={(todoId) =>
            setTodoStatus(todoId, 'rejected')
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
          canGenerate={activeAnalysisStatus === 'READY'}
          onGenerate={() => reportMutation.mutate()}
        />
      )}
      {activeTab === 'preflight' && (
        <PreflightTab analysis={analysisQuery.data} />
      )}
      {activeTab === 'heatmap' && (
        <TextHeatmapViewer
          text={heatmapText}
          vaguePoints={vaguePoints}
        />
      )}
    </div>
  )
}

function LiveAgentsPanel({
  agents,
  analysisStatus
}: {
  agents: AgentRuntime[]
  analysisStatus: AnalysisResponse['status']
}) {
  const byRole = new Map(
    agents.map((agent) => [agent.role, agent] as const)
  )
  const doneCount = AGENT_SEQUENCE.filter((step) => byRole.has(step.role)).length
  const firstPendingIndex = AGENT_SEQUENCE.findIndex((step) => !byRole.has(step.role))
  const progressPercent = Math.round((doneCount / AGENT_SEQUENCE.length) * 100)

  return (
    <Card>
      <CardHeader
        title="AI実行フロー"
        subtitle={
          analysisStatus === 'READY'
            ? '全ステップ完了'
            : `進行中: ${doneCount}/${AGENT_SEQUENCE.length} ステップ`
        }
        icon={<Sparkles className="w-5 h-5 text-indigo-600" />}
      />
      <div className="space-y-3">
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px] flex items-center gap-2">
            {AGENT_SEQUENCE.map((step, index) => {
              const runtime = byRole.get(step.role)
              const stepState = resolveStepState(runtime, analysisStatus, {
                isCurrentPending: firstPendingIndex >= 0 && index === firstPendingIndex
              })
              const circleClass =
                stepState === 'done'
                  ? 'bg-emerald-500 text-white'
                  : stepState === 'warn'
                  ? 'bg-amber-500 text-white'
                  : stepState === 'active'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-200 text-gray-500'

              return (
                <div key={step.role} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1 min-w-[90px]">
                    <div className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center ${circleClass}`}>
                      {index + 1}
                    </div>
                    <span className="text-xs text-gray-700 whitespace-nowrap">{step.label}</span>
                  </div>
                  {index < AGENT_SEQUENCE.length - 1 && (
                    <div
                      className={`w-10 h-[2px] ${
                        byRole.has(step.role) ? 'bg-indigo-400' : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
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

function SummaryTab({
  analysis
}: {
  analysis: AnalysisResponse | undefined
}) {
  const summary = analysis && 'summary' in analysis ? analysis.summary : undefined
  const topRisks =
    summary?.top_risks ??
    (summary?.top3_risks ?? []).map((risk) => ({
      title: risk.title,
      severity: 'MEDIUM' as const,
      reason: '',
      ...(risk.refs ? { refs: risk.refs } : {})
    }))
  const sortedTopRisks = [...topRisks].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  )
  const top3Risks = sortedTopRisks.slice(0, 3)
  const claimEvidence = summary?.claim_evidence ?? []
  const metrics = summary?.metrics
  const preflightErrorCount = summary?.preflight_summary?.error_count ?? 0
  const preflightWarningCount = summary?.preflight_summary?.warning_count ?? 0
  const severityCounts = sortedTopRisks.reduce(
    (acc, risk) => {
      if (risk.severity === 'HIGH') acc.high += 1
      else if (risk.severity === 'MEDIUM') acc.medium += 1
      else acc.low += 1
      return acc
    },
    { high: 0, medium: 0, low: 0 }
  )
  const highRiskCount = severityCounts.high

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <Card>
          <p className="text-xs text-gray-500">主張数</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{claimEvidence.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">重大リスク</p>
          <p className="text-2xl font-semibold text-red-700 mt-1">
            {highRiskCount}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">整合チェック問題</p>
          <p className="text-2xl font-semibold text-amber-700 mt-1">
            {(summary?.preflight_summary?.error_count ?? 0) + (summary?.preflight_summary?.warning_count ?? 0)}
          </p>
        </Card>
      </div>

      <Card>
          <CardHeader
            title="全体所見"
            subtitle="先に直すべきポイント"
            icon={<Sparkles className="w-5 h-5 text-indigo-600" />}
          />
        <div className="space-y-2 text-sm text-gray-700">
          {sortedTopRisks.length === 0 ? (
            <p>重大リスクは検出されませんでした。次に主張ごとの根拠密度を確認してください。</p>
          ) : (
            <>
              <p>
                リスク分布: 高 {severityCounts.high} / 中 {severityCounts.medium} / 低{' '}
                {severityCounts.low}
              </p>
              <p>
                まず「高」を解消し、その後「中」の主張を優先的に補強するのが最短です。
              </p>
            </>
          )}
          <p>
            形式整合: エラー {preflightErrorCount} 件 / 警告 {preflightWarningCount} 件
          </p>
          {(metrics?.weak_evidence_claims ?? 0) > 0 && (
            <p>
              根拠が弱い主張が {metrics?.weak_evidence_claims} 件あります。比較条件と数値根拠の追記を推奨します。
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="重大リスク Top3" subtitle="重要度順" icon={<AlertCircle className="w-5 h-5 text-red-600" />} />
        <div className="space-y-3">
          {top3Risks.length === 0 && (
            <p className="text-sm text-gray-500">
              解析が完了すると、優先度の高いリスクが表示されます。
            </p>
          )}
          {top3Risks.map((risk, index) => (
            <div key={`${risk.title}_${index}`} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2">
                <Badge
                  variant={risk.severity === 'HIGH' ? 'error' : risk.severity === 'MEDIUM' ? 'warning' : 'default'}
                >
                  {severityLabel(risk.severity)}
                </Badge>
                <p className="font-medium text-gray-900">
                  {index + 1}. {risk.title}
                </p>
              </div>
              {risk.reason && (
                <p className="mt-1 text-sm text-gray-700">{risk.reason}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">{formatRiskRefs(risk.refs)}</p>
            </div>
          ))}
          {top3Risks.length === 0 && claimEvidence.length > 0 && (
            <p className="text-sm text-emerald-700">
              重大リスクは検出されませんでした（解析対象 claim: {claimEvidence.length}件）。
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="追加リスク"
          subtitle="上位3件以外"
          icon={<AlertCircle className="w-5 h-5 text-orange-600" />}
        />
        <div className="space-y-2 text-sm text-gray-700">
          {sortedTopRisks.length <= 3 ? (
            <p>追加の主要リスクはありません。</p>
          ) : (
            <>
              <p>上位3件以外に {sortedTopRisks.length - 3} 件のリスクがあります。</p>
              {sortedTopRisks.slice(3, 8).map((risk, index) => (
                <p key={`${risk.title}_${index}`}>
                  - [{severityLabel(risk.severity)}] {risk.title}
                </p>
              ))}
              {sortedTopRisks.length > 8 && (
                <p className="text-xs text-gray-500">他 {sortedTopRisks.length - 8} 件</p>
              )}
            </>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="評価指標（目標）" subtitle="改善後に下げたい指標" icon={<FileText className="w-5 h-5 text-gray-500" />} />
          <MetricRow label="根拠なし主張" value="0 を目標" />
          <MetricRow label="根拠が弱い主張" value="0 を目標" />
          <MetricRow label="具体性不足主張" value="0 を目標" />
        </Card>
        <Card>
          <CardHeader title="評価指標（現在）" subtitle="今回の解析結果" icon={<Sparkles className="w-5 h-5 text-indigo-600" />} />
          <MetricRow label="根拠なし主張" value={String(metrics?.no_evidence_claims ?? '-')} />
          <MetricRow label="根拠が弱い主張" value={String(metrics?.weak_evidence_claims ?? '-')} />
          <MetricRow label="具体性不足主張" value={String(metrics?.specificity_lack ?? '-')} />
        </Card>
      </div>
    </div>
  )
}

function resolveStepState(
  runtime: AgentRuntime | undefined,
  analysisStatus: AnalysisResponse['status'],
  options: {
    isCurrentPending: boolean
  }
): 'done' | 'warn' | 'active' | 'pending' {
  if (runtime?.status === 'DONE' || runtime?.status === 'SKIPPED') return 'done'
  if (runtime?.status === 'WARN') return 'warn'
  if (analysisStatus === 'READY' || analysisStatus === 'FAILED') return 'pending'
  return options.isCurrentPending ? 'active' : 'pending'
}

function EvidenceTab({
  claims,
  analysis,
  selectedClaim,
  onSelectClaim
}: {
  claims: ClaimEvidence[]
  analysis: AnalysisResponse | undefined
  selectedClaim: ClaimEvidence | null
  onSelectClaim: (claim: ClaimEvidence) => void
}) {
  const summary = analysis && 'summary' in analysis ? analysis.summary : undefined
  const logicRiskByClaim = new Map((summary?.logic_risks ?? []).map((risk) => [risk.claim_id, risk]))

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
      <EvidenceMapTable
        claims={claims}
        onSelectClaim={onSelectClaim}
        selectedClaimId={selectedClaim?.claim_id}
      />
      <Card>
        <CardHeader title="主張の詳細" subtitle="選択した主張の根拠状態" icon={<Shield className="w-5 h-5 text-indigo-600" />} />
        {claims.length === 0 && (
          <p className="text-sm text-gray-600">
            解析結果から主張を抽出できませんでした。サマリーの警告を確認し、抽出設定を見直してください。
          </p>
        )}
        {!selectedClaim && (
          <p className="text-sm text-gray-500">テーブルから主張を選択してください。</p>
        )}
        {selectedClaim && (
          <div className="space-y-3">
            <p className="font-medium text-gray-900">{selectedClaim.claim_text}</p>
            <Badge
              variant={
                selectedClaim.strength === 'none'
                  ? 'error'
                  : selectedClaim.strength === 'weak'
                  ? 'warning'
                  : 'success'
              }
            >
              根拠強度: {strengthLabel(selectedClaim.strength)}
            </Badge>
            <div className="text-sm text-gray-700">
              根拠候補数: {selectedClaim.evidence.length}
            </div>
            {selectedClaim.location?.snippet && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                懸念: {selectedClaim.location.snippet}
              </div>
            )}
            {logicRiskByClaim.get(selectedClaim.claim_id)?.reason && (
              <div className="rounded-md border border-purple-200 bg-purple-50 p-2 text-sm text-purple-900">
                論理面の指摘: {logicRiskByClaim.get(selectedClaim.claim_id)?.reason}
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-700">参照ID</p>
              {selectedClaim.evidence.length === 0 ? (
                <p className="text-xs text-gray-500">参照IDは見つかっていません。</p>
              ) : (
                selectedClaim.evidence.map((ev, index) => (
                  <p key={`${ev.ref_id ?? 'ref'}_${index}`} className="text-xs text-gray-600">
                    - {ev.ref_id ?? '(idなし)'}
                  </p>
                ))
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function OralTab({
  analysisStatus,
  messages,
  onAddDraftToTodo,
  onAcceptDraft,
  onStart,
  onSend,
  isLoading
}: {
  analysisStatus: AnalysisResponse['status']
  messages: ChatMessage[]
  onAddDraftToTodo: (sentences: string[]) => void
  onAcceptDraft: (sentences: string[]) => void
  onStart: () => void
  onSend: (value: string) => void
  isLoading: boolean
}) {
  const canStart = analysisStatus === 'READY'

  return (
    <div className="space-y-3">
      {!canStart && (
        <Card>
          <p className="text-sm text-amber-700">
            口頭試問は解析完了後に開始できます。現在ステータス: {analysisStatus}
          </p>
        </Card>
      )}
      <ChatThread
        messages={messages}
        onStart={onStart}
        canStart={canStart}
        onAddDraftToTodo={onAddDraftToTodo}
        onAcceptDraft={onAcceptDraft}
        onSendMessage={onSend}
        isLoading={isLoading}
      />
    </div>
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
  canGenerate,
  onGenerate
}: {
  reportState: { reportId?: string; reportUrl?: string; error?: string }
  isGenerating: boolean
  canGenerate: boolean
  onGenerate: () => void
}) {
  return (
    <Card>
      <CardHeader title="レポート" subtitle="生成 -> 閲覧 -> ダウンロード" icon={<FileText className="w-5 h-5 text-indigo-600" />} />
      <div className="space-y-3">
        <Button onClick={onGenerate} isLoading={isGenerating} disabled={!canGenerate}>
          レポート生成
        </Button>
        {!canGenerate && (
          <p className="text-xs text-amber-700">
            解析完了後にレポート生成できます。
          </p>
        )}
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

function PreflightTab({ analysis }: { analysis: AnalysisResponse | undefined }) {
  const summary = analysis && 'summary' in analysis ? analysis.summary : undefined
  const metrics = summary?.metrics
  const preflightSummary = summary?.preflight_summary

  return (
    <Card>
      <CardHeader title="整合チェック" subtitle="参照漏れや構成崩れのチェック" icon={<AlertCircle className="w-5 h-5 text-orange-600" />} />
      <div className="space-y-2 text-sm text-gray-700">
        {!metrics && <p>- 解析完了後に指標を表示します</p>}
        {metrics && (
          <>
            <p>- 根拠なし主張: {metrics.no_evidence_claims ?? '-'}</p>
            <p>- 根拠が弱い主張: {metrics.weak_evidence_claims ?? '-'}</p>
            <p>- 具体性不足主張: {metrics.specificity_lack ?? '-'}</p>
          </>
        )}
        {preflightSummary && (
          <>
            <p>- 整合エラー: {preflightSummary.error_count ?? 0}</p>
            <p>- 整合警告: {preflightSummary.warning_count ?? 0}</p>
          </>
        )}
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

function severityRank(severity: 'LOW' | 'MEDIUM' | 'HIGH'): number {
  if (severity === 'HIGH') return 3
  if (severity === 'MEDIUM') return 2
  return 1
}

function severityLabel(severity: 'LOW' | 'MEDIUM' | 'HIGH'): string {
  if (severity === 'HIGH') return '高'
  if (severity === 'MEDIUM') return '中'
  return '低'
}

function formatRiskRefs(
  refs:
    | {
        claim_ids?: string[]
        paragraph_ids?: string[]
        figure_ids?: string[]
        citation_keys?: string[]
      }
    | undefined
): string {
  if (!refs) return '参照: なし'
  return `参照: claim ${refs.claim_ids?.length ?? 0} / paragraph ${
    refs.paragraph_ids?.length ?? 0
  } / citation ${refs.citation_keys?.length ?? 0}`
}

function strengthLabel(strength: ClaimEvidence['strength']): string {
  switch (strength) {
    case 'strong':
      return '強'
    case 'moderate':
      return '中'
    case 'weak':
      return '弱'
    default:
      return 'なし'
  }
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
  const claimEvidence = summary?.claim_evidence ?? []

  if (claimEvidence.length > 0) {
    return claimEvidence.map((risk, index) => {
      return {
        claim_id: risk.claim_id,
        claim_text: risk.claim_text ?? `Claim ${index + 1}`,
        location: { snippet: risk.reason },
        evidence: risk.paragraph_ids.map((id) => ({
          type: 'citation',
          ref_id: id
        })),
        strength:
          risk.severity === 'HIGH' ? 'none' : risk.severity === 'MEDIUM' ? 'weak' : 'moderate'
      }
    })
  }

  const risks =
    summary?.top_risks ??
    (summary?.top3_risks ?? []).map((risk) => ({
      title: risk.title,
      severity: 'MEDIUM' as const,
      reason: '',
      ...(risk.refs ? { refs: risk.refs } : {})
    }))

  if (risks.length === 0) return []

  return risks.map((risk, index) => ({
    claim_id: risk.refs?.claim_ids?.[0] ?? `claim_${index + 1}`,
    claim_text: risk.title,
    location: { snippet: risk.reason || risk.title },
    evidence: (risk.refs?.paragraph_ids ?? []).map((id) => ({
      type: 'citation',
      ref_id: id
    })),
    strength: (risk.refs?.paragraph_ids?.length ?? 0) > 0 ? 'moderate' : 'none'
  }))
}

function buildVaguePoints(analysis: AnalysisResponse | undefined): VaguePoint[] {
  const summary = analysis && 'summary' in analysis ? analysis.summary : undefined
  const logicRisks = summary?.logic_risks ?? []

  if (logicRisks.length > 0) {
    return logicRisks.map((risk, index) => ({
      id: `logic_risk_${index + 1}`,
      type: 'no_condition',
      text: `${risk.claim_id}: ${risk.reason}`,
      location: {},
      suggestion: '数値・条件・比較対象を追記して主張を具体化してください'
    }))
  }

  const risks =
    summary?.top_risks ??
    (summary?.top3_risks ?? []).map((risk) => ({
      title: risk.title,
      severity: 'MEDIUM' as const,
      reason: '',
      ...(risk.refs ? { refs: risk.refs } : {})
    }))

  return risks.map((risk, index) => ({
    id: `risk_vague_${index + 1}`,
    type: 'no_condition',
    text: `${risk.title}: ${risk.reason || '具体化の余地があります'}`,
    location: {},
    suggestion: '根拠となる条件・数値・比較対象を明示してください'
  }))
}

function buildHeatmapText(claims: ClaimEvidence[]): string {
  if (claims.length === 0) return ''
  return claims.map((claim) => claim.claim_text).join('\n')
}

function buildTodosFromAnalysis(analysis: AnalysisResponse | undefined): TodoItem[] {
  const summary = analysis && 'summary' in analysis ? analysis.summary : undefined
  const risks =
    summary?.top_risks ??
    (summary?.top3_risks ?? []).map((risk) => ({
      title: risk.title,
      severity: 'MEDIUM' as const,
      reason: '',
      ...(risk.refs ? { refs: risk.refs } : {})
    }))
  const claimEvidence = summary?.claim_evidence ?? []

  if (risks.length === 0 && claimEvidence.length > 0) {
    return claimEvidence.slice(0, 5).map((claim, index) => ({
      id: `todo_claim_${index + 1}`,
      title: `Claim ${index + 1} の根拠を補強`,
      description: claim.reason,
      impact: claim.severity === 'HIGH' ? 5 : claim.severity === 'MEDIUM' ? 4 : 3,
      effort: 2,
      status: 'pending',
      source: 'evidence'
    }))
  }

  if (risks.length === 0) return []

  return risks.map((risk, index) => ({
    id: `todo_risk_${index + 1}`,
    title: risk.title,
    description: risk.reason || '該当主張の根拠を補強してください',
    impact: risk.severity === 'HIGH' ? 5 : risk.severity === 'MEDIUM' ? 4 : 3,
    effort: 2,
    status: 'pending',
    source: 'evidence'
  }))
}

function hashText(input: string): string {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}
