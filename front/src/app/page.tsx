'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui';
import { FileText, ArrowRight, Shield, MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { ensureClientToken, sessions } = useAppStore();

  useEffect(() => {
    // クライアントトークンを確認/生成
    ensureClientToken();
  }, [ensureClientToken]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero Section */}
      <section className="py-12 md:py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          査読官に詰められて
          <br />
          <span className="text-indigo-600">論文が強固になる</span>
        </h1>
        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
          Reviewer Zeroは、投稿前の論文を多角的に分析し、
          査読官からの指摘を事前に予測・修正することで、
          より説得力のある論文作成を支援します。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/new">
            <Button size="lg">
              <FileText className="w-5 h-5 mr-2" />
              論文を査読する
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <Link href="/demo">
            <Button variant="outline" size="lg">
              <Sparkles className="w-5 h-5 mr-2" />
              デモを見る
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 border-t border-gray-200">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">
          主な機能
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Shield className="w-8 h-8 text-indigo-600" />}
            title="Evidence Auditor"
            description="主張と根拠の対応関係を分析し、エビデンスの欠如や弱い論理を可視化します。"
          />
          <FeatureCard
            icon={<MessageSquare className="w-8 h-8 text-indigo-600" />}
            title="Oral Defense"
            description="査読官からの質問をシミュレートし、論理の穴を口頭試問形式で発見します。"
          />
          <FeatureCard
            icon={<Sparkles className="w-8 h-8 text-indigo-600" />}
            title="Auto Patch"
            description="修正候補を自動生成し、差分形式で確認・採用することができます。"
          />
        </div>
      </section>

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <section className="py-12 border-t border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            最近のセッション
          </h2>
          <div className="grid gap-4">
            {sessions.slice(0, 3).map((session) => (
              <Link
                key={session.session_id}
                href={`/session/${session.session_id}`}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors"
              >
                <div>
                  <h3 className="font-medium text-gray-900">
                    {session.title || '無題の論文'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {new Date(session.updated_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
}) {
  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
