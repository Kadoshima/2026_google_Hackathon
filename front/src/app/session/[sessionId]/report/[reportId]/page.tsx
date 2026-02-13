'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { reportApi } from '@/api'
import { Button, Card, CardHeader } from '@/components/ui'

export default function ReportPage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const reportId = params.reportId as string

  const reportQuery = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => reportApi.get(reportId),
    enabled: Boolean(reportId)
  })

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link
        href={`/session/${sessionId}?tab=report`}
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        セッションに戻る
      </Link>

      <Card>
        <CardHeader title="Report" subtitle={`report_id: ${reportId}`} />
        {reportQuery.isLoading && <p className="text-sm text-gray-600">読み込み中...</p>}
        {reportQuery.isError && (
          <p className="text-sm text-red-700">{reportQuery.error.message}</p>
        )}
        {reportQuery.data && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              report_html_signed_url が取得できました。
            </p>
            <a
              href={reportQuery.data.report_html_signed_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-indigo-700 underline"
            >
              Open Report
              <ExternalLink className="w-4 h-4 ml-1" />
            </a>
          </div>
        )}
      </Card>

      <div>
        <Link href={`/session/${sessionId}`}>
          <Button variant="outline">セッションへ戻る</Button>
        </Link>
      </div>
    </div>
  )
}
